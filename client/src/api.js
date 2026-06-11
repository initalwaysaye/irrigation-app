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

// --- Run-all / stop-all ---

/** Waters every zone sequentially, each for `duration` minutes. */
export const runAllZones = (duration) =>
  req('/zones/run-all', { method: 'POST', body: { duration } });

/** Emergency stop — turns off all zones and cancels queued run-all zones. */
export const stopAllZones = () =>
  req('/zones/stop-all', { method: 'POST' });

// --- System / rain delay ---

/** Fetches system status: { rainDelayUntil: ISO string | null }. */
export const fetchStatus = () => req('/system/status');

/** Pauses all scheduled watering for the given number of hours. */
export const setRainDelay = (hours) =>
  req('/system/rain-delay', { method: 'POST', body: { hours } });

/** Cancels the rain delay so schedules resume immediately. */
export const cancelRainDelay = () =>
  req('/system/rain-delay', { method: 'DELETE' });

// --- Settings & usage (cost tracking, weather location) ---

/** Fetches app settings: { flowRates, tariffPerM3, location }. */
export const fetchSettings = () => req('/system/settings');

/** Saves app settings — shallow-merged server-side with what's stored. */
export const saveSettings = (data) =>
  req('/system/settings', { method: 'PUT', body: data });

/** Fetches aggregated water usage and cost: { configured, periods }. */
export const fetchUsage = () => req('/system/usage');

// --- Aircon (Bosch 3200i via Matter) ---

/** Fetches AC state: { commissioned, online, on, mode, targetTemp, roomTemp, fanMode }. */
export const fetchAirconStatus = () => req('/aircon/status');

/** Pairs the AC using a Matter pairing code from the HomeCom Easy app (slow: 10-30s). */
export const commissionAircon = (pairingCode) =>
  req('/aircon/commission', { method: 'POST', body: { pairingCode } });

/** Unpairs the AC from this controller (it stays in HomeCom). */
export const decommissionAircon = () =>
  req('/aircon/commission', { method: 'DELETE' });

export const setAirconPower = (on) => req('/aircon/power', { method: 'POST', body: { on } });
export const setAirconMode = (mode) => req('/aircon/mode', { method: 'POST', body: { mode } });
export const setAirconTemp = (target) => req('/aircon/temp', { method: 'POST', body: { target } });
export const setAirconFan = (mode) => req('/aircon/fan', { method: 'POST', body: { mode } });
