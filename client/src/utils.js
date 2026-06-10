/**
 * utils.js
 * Small shared helpers used by both the landing screen and the sprinklers module.
 */

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Works out when a schedule will next fire, scanning up to 8 days ahead.
 * Returns a Date, or null if the schedule is disabled.
 */
export function nextRun(s) {
  if (!s.enabled) return null;
  const [h, m] = s.start_time.split(':').map(Number);
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d <= now) continue;
    if (!s.days.length || s.days.includes(d.getDay())) return d;
  }
  return null;
}

/** Formats a next-run Date as "Today 06:00", "Tomorrow 06:00", or "Mon 06:00". */
export function fmtNextRun(d) {
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
     new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  return `${DAY_LABELS[d.getDay()]} ${time}`;
}

/** Formats seconds as "m:ss" (e.g. 754 → "12:34"). */
export function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}
