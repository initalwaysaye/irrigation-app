/**
 * state.js
 * Holds the live in-memory state of all irrigation zones.
 *
 * This is kept separate from the database because zone state changes constantly
 * (every time a zone turns on or off) and doesn't need to survive a server restart
 * — on startup all zones are assumed off and GPIO is set accordingly.
 *
 * By centralising state here, both the route handlers and the scheduler can
 * read and write zone state without importing each other (which would create
 * circular dependencies).
 */

const config = require('./config');

/**
 * The zones object is the single source of truth for current zone state.
 * Keyed by zone id (1, 2, 3). Each zone has:
 *   - id, name, pin: copied from config, included here so callers don't need to import config separately
 *   - isOn: whether the valve is currently open
 *   - autoOffAt: ISO timestamp of when the auto-off timer will fire, or null if running indefinitely
 */
const zones = {};
for (const z of config.zones) {
  zones[z.id] = { id: z.id, name: z.name, pin: z.pin, isOn: false, autoOffAt: null };
}

// Stores active setTimeout handles keyed by zone id.
// Kept here so we can cancel a pending auto-off timer when a zone is
// manually stopped or restarted before the timer fires.
const timers = {};

/** Returns an array of all zone state objects (used by GET /api/zones). */
function getAll() {
  return Object.values(zones);
}

/** Returns the state object for a single zone, or null if the id doesn't exist. */
function get(id) {
  return zones[id] || null;
}

/**
 * Registers an auto-off timer for a zone.
 * Automatically cancels any existing timer for that zone first,
 * so calling this twice on the same zone safely replaces the old timer.
 *
 * @param {number} zoneId - zone id (1, 2, or 3)
 * @param {ReturnType<typeof setTimeout>} handle - the setTimeout return value
 */
function setTimer(zoneId, handle) {
  clearTimer(zoneId); // cancel previous timer if one exists
  timers[zoneId] = handle;
}

/**
 * Cancels and removes any pending auto-off timer for a zone.
 * Safe to call even if no timer is registered.
 */
function clearTimer(zoneId) {
  if (timers[zoneId]) {
    clearTimeout(timers[zoneId]);
    delete timers[zoneId];
  }
}

module.exports = { getAll, get, setTimer, clearTimer };
