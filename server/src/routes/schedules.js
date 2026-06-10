/**
 * routes/schedules.js
 * REST API endpoints for managing recurring irrigation schedules.
 *
 * Mounted at /api/schedules in index.js.
 *
 * Endpoints:
 *   GET    /api/schedules          — list all schedules
 *   POST   /api/schedules          — create a new schedule
 *   PUT    /api/schedules/:id      — replace a schedule (full update)
 *   PATCH  /api/schedules/:id/toggle — enable or disable a schedule
 *   DELETE /api/schedules/:id      — remove a schedule
 *
 * Every mutating operation (POST, PUT, PATCH, DELETE) calls scheduler.load()
 * at the end to rebuild all cron jobs from the updated database state.
 * This ensures the in-memory schedule always matches what's in the DB.
 *
 * Note: 'days' is stored in SQLite as a JSON string (e.g. "[1,3,5]") because
 * SQLite has no native array type. We parse it back to an array before sending
 * responses so the frontend always receives a proper JS array.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const scheduler = require('../scheduler');

/**
 * GET /api/schedules
 * Returns all schedules sorted by start time, with 'days' parsed from JSON string to array.
 */
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM schedules ORDER BY start_time ASC').all();
  // Parse the days JSON string into a real array for each row before sending.
  res.json(rows.map(r => ({ ...r, days: JSON.parse(r.days) })));
});

/**
 * POST /api/schedules
 * Creates a new schedule.
 *
 * Required body fields: zone_id, name, start_time, duration_minutes
 * Optional:  days (array, default []), enabled (boolean, default true)
 *
 * Returns the created schedule as JSON with HTTP 201.
 */
router.post('/', (req, res) => {
  const { zone_id, name, days = [], start_time, duration_minutes, enabled = true, temp_threshold = null } = req.body;

  // Validate that all required fields are present before touching the DB.
  if (!zone_id || !name || !start_time || !duration_minutes) {
    return res.status(400).json({ error: 'Missing required fields: zone_id, name, start_time, duration_minutes' });
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO schedules (zone_id, name, days, start_time, duration_minutes, enabled, temp_threshold) VALUES (?, ?, ?, ?, ?, ?, ?)')
    // Serialise days array to JSON string for storage.
    // Convert boolean enabled to integer (1/0) for SQLite.
    // temp_threshold: null = unconditional, number = only run at/above that °C.
    .run(zone_id, name, JSON.stringify(days), start_time, duration_minutes, enabled ? 1 : 0, temp_threshold);

  // Rebuild cron jobs to include the new schedule.
  scheduler.load();

  // Fetch and return the newly created row so the client has the server-assigned id and timestamps.
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(lastInsertRowid);
  res.status(201).json({ ...row, days: JSON.parse(row.days) });
});

/**
 * PUT /api/schedules/:id
 * Fully replaces an existing schedule's fields.
 * All fields must be supplied (this is a full replace, not a partial update).
 *
 * Returns 404 if no schedule with that id exists.
 */
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { zone_id, name, days = [], start_time, duration_minutes, enabled, temp_threshold = null } = req.body;

  // .changes is the number of rows affected — 0 means the id wasn't found.
  const { changes } = db
    .prepare('UPDATE schedules SET zone_id=?, name=?, days=?, start_time=?, duration_minutes=?, enabled=?, temp_threshold=? WHERE id=?')
    .run(zone_id, name, JSON.stringify(days), start_time, duration_minutes, enabled ? 1 : 0, temp_threshold, id);

  if (!changes) return res.status(404).json({ error: 'Schedule not found' });

  scheduler.load(); // rebuild cron jobs with updated schedule

  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  res.json({ ...row, days: JSON.parse(row.days) });
});

/**
 * PATCH /api/schedules/:id/toggle
 * Flips the enabled flag on a schedule (active → paused, or paused → active).
 * Used by the toggle switch in the UI — no body required.
 *
 * SQLite's NOT operator inverts the integer boolean: NOT 1 = 0, NOT 0 = 1.
 */
router.patch('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id);
  const { changes } = db
    .prepare('UPDATE schedules SET enabled = NOT enabled WHERE id = ?')
    .run(id);

  if (!changes) return res.status(404).json({ error: 'Schedule not found' });

  scheduler.load(); // if we just enabled a schedule, its cron job needs to be created

  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  res.json({ ...row, days: JSON.parse(row.days) });
});

/**
 * DELETE /api/schedules/:id
 * Permanently removes a schedule and rebuilds cron jobs so it no longer fires.
 * Returns HTTP 204 (No Content) on success — no body.
 */
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(parseInt(req.params.id));
  scheduler.load();
  res.status(204).end();
});

module.exports = router;
