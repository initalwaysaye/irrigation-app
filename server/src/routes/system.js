/**
 * routes/system.js
 * App-wide status and settings endpoints.
 *
 * Mounted at /api/system in index.js.
 *
 * Endpoints:
 *   GET    /api/system/status      — current rain delay state
 *   POST   /api/system/rain-delay  — pause all schedules for N hours
 *   DELETE /api/system/rain-delay  — cancel the rain delay
 *   GET    /api/system/settings    — app settings (flow rates, tariff, location)
 *   PUT    /api/system/settings    — save app settings (merged with existing)
 *   GET    /api/system/usage       — water usage & cost aggregated from run_log
 *
 * A rain delay suspends *scheduled* watering until the chosen time —
 * handy when rain is forecast and the garden doesn't need it. Manual
 * runs are unaffected (pressing Run always works). The timestamp is
 * persisted in the settings table so it survives server restarts.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/** Reads the app_settings JSON blob, tolerating a missing/corrupt value. */
function readSettings() {
  try {
    return JSON.parse(db.getSetting('app_settings') || '{}');
  } catch {
    return {};
  }
}

/**
 * GET /api/system/status
 * Returns { rainDelayUntil: ISO string | null }.
 * An expired delay is reported as null (and cleaned out of the DB).
 */
router.get('/status', (req, res) => {
  let until = db.getSetting('rain_delay_until');
  if (until && new Date(until) <= new Date()) {
    db.deleteSetting('rain_delay_until'); // expired — tidy up
    until = null;
  }
  res.json({ rainDelayUntil: until });
});

/**
 * POST /api/system/rain-delay
 * Body: { hours } — how long to pause scheduled watering (e.g. 24, 48, 72).
 * Returns the new { rainDelayUntil } timestamp.
 */
router.post('/rain-delay', (req, res) => {
  const hours = parseInt(req.body.hours);
  if (!hours || hours < 1 || hours > 168) {
    return res.status(400).json({ error: 'hours must be between 1 and 168' });
  }
  const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  db.setSetting('rain_delay_until', until);
  res.json({ rainDelayUntil: until });
});

/**
 * DELETE /api/system/rain-delay
 * Cancels the rain delay — schedules resume immediately.
 */
router.delete('/rain-delay', (req, res) => {
  db.deleteSetting('rain_delay_until');
  res.json({ rainDelayUntil: null });
});

/**
 * GET /api/system/settings
 * Returns the app settings blob:
 *   { flowRates: { "1": L/min, ... }, tariffPerM3: number, location: { lat, lon, label } }
 * Missing keys mean "not configured yet".
 */
router.get('/settings', (req, res) => {
  res.json(readSettings());
});

/**
 * PUT /api/system/settings
 * Shallow-merges the request body into the stored settings, so the client can
 * save just the cost fields or just the location without clobbering the rest.
 */
router.put('/settings', (req, res) => {
  const merged = { ...readSettings(), ...req.body };
  db.setSetting('app_settings', JSON.stringify(merged));
  res.json(merged);
});

/**
 * GET /api/system/usage
 * Water usage and cost per zone for several periods, computed from run_log.
 *
 * Run time uses the actual start/end timestamps (not the requested duration),
 * so manually-stopped runs are billed for what actually flowed. Still-running
 * entries count up to "now". Litres = minutes × the zone's flow rate (L/min);
 * cost = litres × tariff (£/m³) / 1000.
 *
 * Response shape:
 * {
 *   configured: bool,            // false until flow rates + tariff are set
 *   periods: {
 *     today:     { litres, cost, zones: { "1": { minutes, litres, cost }, ... } },
 *     week:      { ... },        // last 7 days
 *     month:     { ... },        // calendar month to date
 *     allTime:   { ... },
 *   }
 * }
 */
router.get('/usage', (req, res) => {
  const settings = readSettings();
  const flowRates = settings.flowRates || {};
  const tariff = settings.tariffPerM3;
  const configured = Boolean(tariff && Object.values(flowRates).some(v => v > 0));

  // Period start expressions in SQLite datetime() syntax (UTC, matching run_log).
  const PERIODS = {
    today:   "datetime('now', 'start of day')",
    week:    "datetime('now', '-7 days')",
    month:   "datetime('now', 'start of month')",
    allTime: "datetime('1970-01-01')",
  };

  const periods = {};
  for (const [name, startExpr] of Object.entries(PERIODS)) {
    // Sum actual run minutes per zone. MAX(..., 0) guards against clock
    // weirdness producing negative durations.
    const rows = db.prepare(`
      SELECT zone_id,
             SUM(MAX((julianday(COALESCE(ended_at, datetime('now'))) - julianday(started_at)) * 1440, 0)) AS minutes
      FROM run_log
      WHERE started_at >= ${startExpr}
      GROUP BY zone_id
    `).all();

    const zones = {};
    let totalLitres = 0;
    for (const row of rows) {
      const rate = Number(flowRates[row.zone_id]) || 0;
      const litres = row.minutes * rate;
      totalLitres += litres;
      zones[row.zone_id] = {
        minutes: Math.round(row.minutes * 10) / 10,
        litres: Math.round(litres),
        cost: tariff ? Math.round(litres * tariff / 1000 * 100) / 100 : null,
      };
    }
    periods[name] = {
      litres: Math.round(totalLitres),
      cost: tariff ? Math.round(totalLitres * tariff / 1000 * 100) / 100 : null,
      zones,
    };
  }

  res.json({ configured, periods });
});

module.exports = router;
