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
 *
 * A rain delay suspends *scheduled* watering until the chosen time —
 * handy when rain is forecast and the garden doesn't need it. Manual
 * runs are unaffected (pressing Run always works). The timestamp is
 * persisted in the settings table so it survives server restarts.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

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

module.exports = router;
