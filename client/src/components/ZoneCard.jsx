/**
 * ZoneCard.jsx
 * Displays the current state of a single irrigation zone and provides
 * manual controls to run it for a chosen duration or stop it immediately.
 *
 * Props:
 *   zone     - zone state object from the server: { id, name, isOn, autoOffAt }
 *   onUpdate - callback to update the zone in App's state after an API call
 */

import React, { useState, useEffect } from 'react';
import { turnOn, turnOff } from '../api';

// Duration options shown in the dropdown (minutes).
const DURATIONS = [5, 10, 15, 20, 30, 60];

/**
 * Custom hook that calculates the minutes remaining on an auto-off timer.
 *
 * Takes the autoOffAt ISO timestamp from the server and computes how many
 * minutes are left, updating every 15 seconds. Returns null when there's
 * no active timer (zone is off or running indefinitely).
 *
 * Deriving the countdown from the server's timestamp (rather than maintaining
 * our own countdown timer) means it stays accurate across page reloads and
 * the 10-second zone state polls.
 *
 * @param {string|null} autoOffAt - ISO 8601 timestamp, or null
 * @returns {number|null} minutes remaining, or null
 */
function useCountdown(autoOffAt) {
  const [minsLeft, setMinsLeft] = useState(null);

  useEffect(() => {
    if (!autoOffAt) {
      setMinsLeft(null);
      return;
    }
    // Calculate immediately, then recalculate every 15 seconds.
    const tick = () =>
      setMinsLeft(Math.max(0, Math.round((new Date(autoOffAt) - Date.now()) / 60000)));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id); // clean up interval when component unmounts or autoOffAt changes
  }, [autoOffAt]);

  return minsLeft;
}

export default function ZoneCard({ zone, onUpdate }) {
  // Selected duration for the next "Run" action — local UI state only.
  const [duration, setDuration] = useState(10);
  // Prevents double-tapping while an API call is in flight.
  const [busy, setBusy] = useState(false);

  const minsLeft = useCountdown(zone.autoOffAt);

  /**
   * Sends a timed run request to the server using the selected duration.
   * Updates the parent with the server's response (which includes the new
   * autoOffAt timestamp) so the countdown appears immediately.
   */
  async function handleOn() {
    setBusy(true);
    const updated = await turnOn(zone.id, duration);
    onUpdate(updated); // push updated zone state up to App so all components stay in sync
    setBusy(false);
  }

  /**
   * Sends a stop request. The server cancels any pending auto-off timer
   * and closes the valve immediately.
   */
  async function handleOff() {
    setBusy(true);
    const updated = await turnOff(zone.id);
    onUpdate(updated);
    setBusy(false);
  }

  return (
    <div className={`rounded-xl border-2 p-5 transition-all ${
      // Highlight the card in blue when the zone is active so it's obvious at a glance.
      zone.isOn ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
    }`}>

      {/* Zone name and status badge */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{zone.name}</h2>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          zone.isOn ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {zone.isOn
            ? (minsLeft != null ? `ON · ${minsLeft}m left` : 'ON') // show countdown if timed run
            : 'OFF'}
        </span>
      </div>

      {/* Duration selector — sets how long the zone runs when "Run" is tapped */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-600">Run for</span>
        <select
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
        </select>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Run: starts the zone for the selected duration */}
        <button
          onClick={handleOn}
          disabled={busy}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
        >
          Run
        </button>
        {/* Stop: disabled when the zone is already off (nothing to stop) */}
        <button
          onClick={handleOff}
          disabled={busy || !zone.isOn}
          className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg py-2.5 text-sm font-medium transition-colors"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
