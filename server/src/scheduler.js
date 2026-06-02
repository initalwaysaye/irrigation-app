/**
 * scheduler.js
 * Manages recurring irrigation schedules using node-cron.
 *
 * node-cron runs cron expressions inside the Node.js process — no system cron
 * required. A cron expression like "0 6 * * 1,3,5" means "at 06:00 on Mon, Wed, Fri".
 *
 * The main export is load(), which is called:
 *   1. Once at server startup to activate all enabled schedules from the DB.
 *   2. Every time a schedule is created, updated, toggled, or deleted — so the
 *      in-memory cron jobs always reflect exactly what's in the database.
 *
 * runZone() is also exported so the zone route handler can reuse the same
 * timed-run logic for manual "run for N minutes" requests.
 */

const cron = require('node-cron');
const db = require('./db');
const gpio = require('./gpio');
const state = require('./state');

// Stores active cron job handles keyed by schedule id.
// Used so we can stop old jobs before creating new ones in load().
const jobs = {};

/**
 * Converts a schedule's days-of-week array and time string into a cron expression.
 *
 * Cron expression format: "minute hour * * day-of-week"
 * Day numbers: 0=Sunday, 1=Monday ... 6=Saturday (matches JS Date.getDay())
 *
 * Examples:
 *   days=[1,3,5], startTime="06:00"  →  "0 6 * * 1,3,5"   (Mon/Wed/Fri at 6am)
 *   days=[],      startTime="07:30"  →  "30 7 * * *"       (every day at 7:30am)
 *
 * @param {number[]} days      - array of day numbers; empty means every day
 * @param {string}   startTime - "HH:MM" in 24-hour format
 * @returns {string} cron expression
 */
function toCronExpr(days, startTime) {
  const [h, m] = startTime.split(':').map(Number);
  const daysExpr = days.length ? days.join(',') : '*'; // '*' = every day in cron syntax
  return `${m} ${h} * * ${daysExpr}`;
}

/**
 * Turns a zone on for a given duration, then automatically turns it off.
 * This is the core watering action — used by both scheduled runs and timed manual runs.
 *
 * Steps:
 *   1. Cancel any existing auto-off timer on the zone (handles overlap if zone is already running)
 *   2. Set zone state to on and record when it will auto-off
 *   3. Open the GPIO relay (valve opens)
 *   4. Insert a run_log entry to record this watering event
 *   5. Schedule a setTimeout to close the valve after durationMinutes
 *
 * @param {number} zoneId           - zone id (1, 2, or 3)
 * @param {number} durationMinutes  - how long to run the zone
 * @param {string} trigger          - 'manual' or 'schedule' — stored in the run log
 */
function runZone(zoneId, durationMinutes, trigger = 'schedule') {
  const zone = state.get(zoneId);
  if (!zone) return;

  // Cancel any in-progress timed run before starting a new one.
  state.clearTimer(zoneId);

  // Update in-memory state so the API immediately reflects the new status.
  zone.isOn = true;
  zone.autoOffAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  // Open the physical relay/valve.
  gpio.setZone(zone.pin, true);

  // Write the run to the database log. We capture the row id so we can
  // update the same row with ended_at when the timer fires.
  const { lastInsertRowid } = db
    .prepare('INSERT INTO run_log (zone_id, duration_minutes, trigger) VALUES (?, ?, ?)')
    .run(zoneId, durationMinutes, trigger);

  // Record when this zone's schedule last ran (used for informational display).
  db.prepare("UPDATE schedules SET last_run_at = datetime('now') WHERE zone_id = ? AND enabled = 1")
    .run(zoneId);

  // Schedule the automatic shutoff after the requested duration.
  const handle = setTimeout(() => {
    zone.isOn = false;
    zone.autoOffAt = null;
    gpio.setZone(zone.pin, false); // close the valve
    // Stamp the log entry with the actual end time.
    db.prepare("UPDATE run_log SET ended_at = datetime('now') WHERE id = ?").run(lastInsertRowid);
    console.log(`[Scheduler] Zone ${zoneId} auto-off after ${durationMinutes}m`);
  }, durationMinutes * 60 * 1000);

  // Register the timer handle in state so it can be cancelled if needed.
  state.setTimer(zoneId, handle);

  console.log(`[Scheduler] Zone ${zoneId} ON for ${durationMinutes}m (${trigger})`);
}

/**
 * Loads all enabled schedules from the database and creates a cron job for each.
 *
 * Called on startup and after any schedule change. It completely replaces all
 * existing jobs rather than trying to diff them — simpler and always correct.
 */
function load() {
  // Stop and discard all currently running cron jobs.
  Object.values(jobs).forEach(j => j.stop());
  Object.keys(jobs).forEach(k => delete jobs[k]);

  // Fetch every enabled schedule and create a cron job for each.
  const schedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all();
  for (const s of schedules) {
    const days = JSON.parse(s.days || '[]'); // days is stored as a JSON string in SQLite
    const expr = toCronExpr(days, s.start_time);
    try {
      // cron.schedule() returns a task object. The callback fires whenever
      // the cron expression matches the current time.
      jobs[s.id] = cron.schedule(expr, () => runZone(s.zone_id, s.duration_minutes, 'schedule'));
      console.log(`[Scheduler] Loaded schedule ${s.id}: "${s.name}" (${expr})`);
    } catch (err) {
      // Log bad cron expressions rather than crashing — a corrupt schedule
      // row shouldn't take down the whole server.
      console.error(`[Scheduler] Invalid cron for schedule ${s.id}:`, err.message);
    }
  }
}

module.exports = { load, runZone };
