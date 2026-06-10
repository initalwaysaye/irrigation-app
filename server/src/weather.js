/**
 * weather.js
 * Fetches the current outdoor temperature from the Open-Meteo API
 * (free, no API key) for the home location stored in settings.
 *
 * Used by the scheduler to evaluate temperature-conditional schedules.
 * Results are cached for 10 minutes so several schedules firing close
 * together (or repeated checks) don't hammer the API.
 */

const db = require('./db');

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = { temp: null, fetchedAt: 0 };

/** Reads the stored home location, or null if not configured yet. */
function getLocation() {
  try {
    const settings = JSON.parse(db.getSetting('app_settings') || '{}');
    const loc = settings.location;
    if (loc && typeof loc.lat === 'number' && typeof loc.lon === 'number') return loc;
  } catch { /* malformed settings — treat as unset */ }
  return null;
}

/**
 * Returns the current temperature in °C, or null if it can't be determined
 * (no location configured, network down, API error). Callers should treat
 * null as "unknown" and fail safe.
 */
async function getCurrentTemp() {
  if (Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.temp;

  const loc = getLocation();
  if (!loc) {
    console.warn('[Weather] No home location configured — temperature unavailable');
    return null;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const temp = data?.current?.temperature_2m;
    if (typeof temp !== 'number') throw new Error('unexpected response shape');

    cache = { temp, fetchedAt: Date.now() };
    return temp;
  } catch (err) {
    console.warn('[Weather] Failed to fetch temperature:', err.message);
    return null;
  }
}

module.exports = { getCurrentTemp };
