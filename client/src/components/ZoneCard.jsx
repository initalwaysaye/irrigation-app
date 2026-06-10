/**
 * ZoneCard.jsx
 * Displays the current state of a single irrigation zone with manual controls.
 * When a zone is running it shows a live m:ss countdown and an animated
 * progress bar tracking how far through the run it is.
 *
 * Props:
 *   zone     - zone state from the server: { id, name, isOn, autoOffAt, startedAt }
 *   onUpdate - callback to update the zone in App's state after an API call
 */

import React, { useState, useEffect } from 'react';
import { turnOn, turnOff } from '../api';
import { Droplet, Play, Stop } from './Icons';

// Duration quick-pick options (minutes).
const DURATIONS = [5, 10, 15, 30, 60];

/**
 * Ticks once per second while a timed run is active and returns:
 *   secondsLeft - whole seconds until auto-off (null if not on a timed run)
 *   progress    - 0..1 fraction of the run completed (null if startedAt unknown)
 *
 * Both values are derived from the server's timestamps rather than a local
 * countdown, so they stay accurate across page reloads and polling updates.
 */
function useRunProgress(autoOffAt, startedAt) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!autoOffAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [autoOffAt]);

  if (!autoOffAt) return { secondsLeft: null, progress: null };

  const end = new Date(autoOffAt).getTime();
  const secondsLeft = Math.max(0, Math.round((end - now) / 1000));

  let progress = null;
  if (startedAt) {
    const start = new Date(startedAt).getTime();
    progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
  }
  return { secondsLeft, progress };
}

/** Formats seconds as "m:ss" (e.g. 754 → "12:34"). */
function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function ZoneCard({ zone, onUpdate }) {
  const [duration, setDuration] = useState(10);
  const [busy, setBusy] = useState(false);
  const { secondsLeft, progress } = useRunProgress(zone.autoOffAt, zone.startedAt);

  async function call(fn) {
    setBusy(true);
    try {
      const updated = await fn();
      onUpdate(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl p-5 transition-all duration-300 ${
      zone.isOn
        ? 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg shadow-sky-200'
        : 'bg-white border border-gray-100 shadow-sm'
    }`}>

      {/* Header row: droplet icon, name, status */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          zone.isOn ? 'bg-white/20' : 'bg-sky-50 text-sky-500'
        }`}>
          <Droplet className={`w-5 h-5 ${zone.isOn ? 'animate-pulse' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`font-semibold truncate ${zone.isOn ? 'text-white' : 'text-gray-800'}`}>
            {zone.name}
          </h2>
          <p className={`text-xs ${zone.isOn ? 'text-sky-100' : 'text-gray-400'}`}>
            {zone.isOn
              ? (secondsLeft != null ? `Watering — ${fmtTime(secondsLeft)} remaining` : 'Watering — manual stop')
              : 'Idle'}
          </p>
        </div>
        {/* Status dot */}
        <span className={`w-2.5 h-2.5 rounded-full ${
          zone.isOn ? 'bg-white animate-pulse' : 'bg-gray-200'
        }`} />
      </div>

      {/* Progress bar — only shown during a timed run */}
      {zone.isOn && progress != null && (
        <div className="h-1.5 bg-white/25 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Duration quick-pick chips */}
      {!zone.isOn && (
        <div className="flex gap-1.5 mb-4">
          {DURATIONS.map(d => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                duration === d
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {d}m
            </button>
          ))}
        </div>
      )}

      {/* Action button — Run when idle, Stop when watering */}
      {zone.isOn ? (
        <button
          onClick={() => call(() => turnOff(zone.id))}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
        >
          <Stop className="w-4 h-4" /> Stop
        </button>
      ) : (
        <button
          onClick={() => call(() => turnOn(zone.id, duration))}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-all shadow-sm"
        >
          <Play className="w-4 h-4" /> Water for {duration} min
        </button>
      )}
    </div>
  );
}
