/**
 * routes/zones.js
 * REST API endpoints for reading zone state and controlling valves manually.
 *
 * Mounted at /api/zones in index.js.
 *
 * Endpoints:
 *   GET  /api/zones          — current state of all zones
 *   POST /api/zones/:id/on   — turn a zone on (optionally for a set duration)
 *   POST /api/zones/:id/off  — turn a zone off immediately
 *   GET  /api/zones/log      — recent watering history
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const gpio = require('../gpio');
const state = require('../state');
const { runZone } = require('../scheduler');

/**
 * GET /api/zones
 * Returns the current live state of all three zones as a JSON array.
 * The frontend polls this every 10 seconds to keep the UI current.
 *
 * Example response:
 * [
 *   { id: 1, name: "Zone 1", pin: 17, isOn: true, autoOffAt: "2026-06-01T06:10:00.000Z" },
 *   { id: 2, name: "Zone 2", pin: 27, isOn: false, autoOffAt: null },
 *   { id: 3, name: "Zone 3", pin: 22, isOn: false, autoOffAt: null }
 * ]
 */
router.get('/', (req, res) => {
  res.json(state.getAll());
});

/**
 * POST /api/zones/:id/on
 * Turns a zone on. Behaviour depends on whether a duration is provided:
 *
 *   With duration (e.g. { duration: 10 }):
 *     Delegates to runZone() which opens the valve, logs the run, and
 *     automatically closes the valve after the specified number of minutes.
 *
 *   Without duration:
 *     Opens the valve and leaves it running indefinitely until a POST to /off.
 *     Useful for "I want to manually water until I say stop."
 *
 * In both cases the response is the updated zone state object.
 */
router.post('/:id/on', (req, res) => {
  const id = parseInt(req.params.id);
  const duration = req.body.duration ? parseInt(req.body.duration) : null;
  const zone = state.get(id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  if (duration) {
    // Timed run — reuse the scheduler's runZone function so the auto-off
    // and logging behaviour is identical to a scheduled run.
    runZone(id, duration, 'manual');
  } else {
    // Indefinite run — cancel any existing timer, turn on, and log it.
    // No setTimeout is registered; the zone stays on until POST /off.
    state.clearTimer(id);
    zone.isOn = true;
    zone.autoOffAt = null;
    gpio.setZone(zone.pin, true);
    db.prepare('INSERT INTO run_log (zone_id, trigger) VALUES (?, ?)').run(id, 'manual');
  }

  res.json(state.get(id));
});

/**
 * POST /api/zones/:id/off
 * Immediately turns off a zone regardless of how it was started.
 *
 * - Cancels any pending auto-off timer (so the valve doesn't get turned back
 *   on by a timer that was already running when this request arrived).
 * - Closes any open run_log entries for this zone.
 * - Returns the updated zone state.
 */
router.post('/:id/off', (req, res) => {
  const id = parseInt(req.params.id);
  const zone = state.get(id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  state.clearTimer(id);
  zone.isOn = false;
  zone.autoOffAt = null;
  gpio.setZone(zone.pin, false);

  // Close any open log entries for this zone (there should only be one,
  // but the WHERE covers the edge case of duplicates from a previous crash).
  db.prepare("UPDATE run_log SET ended_at = datetime('now') WHERE zone_id = ? AND ended_at IS NULL")
    .run(id);

  res.json(state.get(id));
});

/**
 * GET /api/zones/log
 * Returns the 100 most recent watering events across all zones, newest first.
 * Useful for checking when zones last ran and for how long.
 */
router.get('/log', (req, res) => {
  const rows = db.prepare('SELECT * FROM run_log ORDER BY started_at DESC LIMIT 100').all();
  res.json(rows);
});

module.exports = router;
