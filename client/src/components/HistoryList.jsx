/**
 * HistoryList.jsx
 * The History tab — shows the most recent watering events (manual, scheduled,
 * and run-all), newest first, with relative day grouping.
 *
 * Props:
 *   log   - array of run_log rows from GET /api/zones/log
 *   zones - zone array, used to map zone_id → display name
 */

import React from 'react';
import { Droplet, History } from './Icons';

// Badge colour per trigger type so you can tell at a glance what started a run.
const TRIGGER_STYLES = {
  manual:    'bg-cyan-500/10 text-cyan-400',
  schedule:  'bg-emerald-500/10 text-emerald-400',
  'run-all': 'bg-violet-500/10 text-violet-400',
};

/**
 * SQLite's datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" with no
 * timezone marker, so we append 'Z' to parse it as UTC; the Date then
 * renders in the browser's local timezone.
 */
function parseUtc(s) {
  return new Date(s.replace(' ', 'T') + 'Z');
}

/** Formats a date as "Today", "Yesterday", or "Mon 8 Jun". */
function dayLabel(date) {
  const today = new Date();
  const d = new Date(date);
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Estimates litres and cost for a completed run from its actual start/end
 * timestamps and the zone's flow rate. Returns null when the entry is still
 * running or the settings needed for the calculation aren't configured.
 */
function entryCost(e, settings) {
  const rate = Number(settings?.flowRates?.[e.zone_id]);
  if (!rate || !e.ended_at) return null;
  const minutes = Math.max(0, (parseUtc(e.ended_at) - parseUtc(e.started_at)) / 60000);
  const litres = Math.round(minutes * rate);
  const tariff = Number(settings?.tariffPerM3);
  const cost = tariff ? (litres * tariff / 1000) : null;
  return { litres, cost };
}

export default function HistoryList({ log, zones, settings }) {
  if (!log.length) {
    return (
      <div className="text-center py-16 text-slate-700">
        <History className="w-10 h-10 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No watering history yet</p>
      </div>
    );
  }

  // Group entries by day for section headers.
  const groups = [];
  for (const entry of log) {
    const started = parseUtc(entry.started_at);
    const label = dayLabel(started);
    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, entries: [] };
      groups.push(group);
    }
    group.entries.push({ ...entry, started });
  }

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.label}>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">
            {group.label}
          </h3>
          <div className="bg-slate-800/70 rounded-2xl border border-slate-700/60 divide-y divide-slate-700/40">
            {group.entries.map(e => {
              const zoneName = zones.find(z => z.id === e.zone_id)?.name ?? `Zone ${e.zone_id}`;
              const time = e.started.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              const usage = entryCost(e, settings);
              return (
                <div key={e.id} className="flex items-center gap-3 p-3.5">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
                    <Droplet className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{zoneName}</p>
                    <p className="text-xs text-slate-500">
                      {time}{e.duration_minutes ? ` · ${e.duration_minutes} min` : ''}
                      {!e.ended_at && ' · running'}
                      {usage && ` · ${usage.litres} L${usage.cost != null ? ` · £${usage.cost.toFixed(2)}` : ''}`}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                    TRIGGER_STYLES[e.trigger] ?? 'bg-slate-700/50 text-slate-400'
                  }`}>
                    {e.trigger}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
