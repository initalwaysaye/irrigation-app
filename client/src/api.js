/**
 * api.js
 * All HTTP calls to the backend in one place.
 *
 * Keeping fetch() calls here (rather than scattered across components) means:
 *   - If the API changes, there's only one file to update.
 *   - Components stay focused on rendering; they don't know about URLs or HTTP methods.
 *   - In development, Vite proxies any request starting with /api to localhost:3000
 *     (configured in vite.config.js), so these relative URLs work in both dev and prod.
 */

const BASE = '/api';

/**
 * Internal helper that wraps fetch() with sensible defaults.
 * - Always sends/expects JSON
 * - Handles the 204 No Content response (DELETE) which has no body to parse
 *
 * @param {string} path   - path relative to /api, e.g. '/zones'
 * @param {object} opts   - fetch options; pass 'body' as an object (it will be JSON.stringify'd)
 * @returns {Promise<any>} parsed JSON response, or null for 204 responses
 */
async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    // Only stringify body if provided — GET requests have no body.
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null; // DELETE returns no body
  return res.json();
}

// --- Zone endpoints ---

/** Fetches current state of all 3 zones. Polled every 10s by App.jsx. */
export const fetchZones = () => req('/zones');

/** Fetches the last 100 watering events across all zones. */
export const fetchLog = () => req('/zones/log');

/**
 * Turns a zone on.
 * @param {number} id       - zone id (1, 2, or 3)
 * @param {number} duration - minutes to run; omit for indefinite run
 */
export const turnOn = (id, duration) =>
  req(`/zones/${id}/on`, { method: 'POST', body: duration ? { duration } : {} });

/** Immediately turns a zone off and cancels any pending auto-off timer. */
export const turnOff = (id) =>
  req(`/zones/${id}/off`, { method: 'POST' });

// --- Schedule endpoints ---

/** Fetches all schedules, sorted by start time. */
export const fetchSchedules = () => req('/schedules');

/**
 * Creates a new schedule.
 * @param {object} data - { zone_id, name, days, start_time, duration_minutes, enabled }
 */
export const createSchedule = (data) =>
  req('/schedules', { method: 'POST', body: data });

/**
 * Fully replaces an existing schedule.
 * @param {number} id   - schedule id to update
 * @param {object} data - same shape as createSchedule
 */
export const updateSchedule = (id, data) =>
  req(`/schedules/${id}`, { method: 'PUT', body: data });

/**
 * Toggles the enabled flag on a schedule (active ↔ paused).
 * No body required — the server flips whatever the current state is.
 */
export const toggleSchedule = (id) =>
  req(`/schedules/${id}/toggle`, { method: 'PATCH' });

/** Permanently deletes a schedule. Returns null (204 No Content). */
export const deleteSchedule = (id) =>
  req(`/schedules/${id}`, { method: 'DELETE' });
