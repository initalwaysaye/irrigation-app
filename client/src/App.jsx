/**
 * App.jsx
 * Root component — owns all application state and coordinates data fetching.
 *
 * State:
 *   zones     - array of zone objects from GET /api/zones, polled every 10 seconds
 *   schedules - array of schedule objects from GET /api/schedules
 *   tab       - which tab is currently shown: 'zones' or 'schedules'
 *   modal     - controls the schedule modal:
 *                 null           = modal closed
 *                 {}             = modal open in "create" mode
 *                 { schedule: s} = modal open in "edit" mode with schedule s
 *
 * Data flow:
 *   App fetches data and passes it down as props.
 *   Child components call API functions directly and pass results back up
 *   via callbacks (onUpdate, onSave etc.) so App can update its state.
 *   This keeps the single source of truth at the top level.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ZoneCard from './components/ZoneCard';
import ScheduleModal from './components/ScheduleModal';
import {
  fetchZones, fetchSchedules,
  createSchedule, updateSchedule, toggleSchedule, deleteSchedule,
} from './api';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function App() {
  const [zones, setZones] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [tab, setTab] = useState('zones');
  const [modal, setModal] = useState(null);

  // useCallback prevents these functions being recreated on every render,
  // which would cause the useEffect dependency array to change and re-run the effect.
  const loadZones = useCallback(() => fetchZones().then(setZones), []);
  const loadSchedules = useCallback(() => fetchSchedules().then(setSchedules), []);

  useEffect(() => {
    // Load both zones and schedules when the app first mounts.
    loadZones();
    loadSchedules();

    // Poll zone state every 10 seconds so the UI reflects changes that happen
    // automatically (scheduled runs starting/stopping) without needing a refresh.
    // Schedules don't need polling — they only change when the user edits them.
    const id = setInterval(loadZones, 10000);

    // Clean up the interval when the component unmounts (prevents memory leaks).
    return () => clearInterval(id);
  }, []); // empty dependency array = run once on mount

  /**
   * Updates a single zone in the zones array without re-fetching all zones.
   * Called by ZoneCard after a successful on/off API call — the server returns
   * the updated zone object so we can apply it immediately for snappy UI feedback.
   *
   * @param {object} updated - the updated zone object returned by the API
   */
  function updateZone(updated) {
    setZones(zs => zs.map(z => z.id === updated.id ? updated : z));
  }

  /**
   * Handles saving from the schedule modal — either creating or updating
   * depending on whether form.id exists (edit mode) or not (create mode).
   * Reloads the schedule list afterwards so the UI shows the saved state.
   */
  async function handleSave(form) {
    if (form.id) {
      await updateSchedule(form.id, form);
    } else {
      await createSchedule(form);
    }
    setModal(null);      // close the modal
    loadSchedules();     // refresh the list
  }

  /** Toggles enabled/disabled on a schedule and refreshes the list. */
  async function handleToggle(id) {
    await toggleSchedule(id);
    loadSchedules();
  }

  /** Deletes a schedule after confirmation and refreshes the list. */
  async function handleDelete(id) {
    if (!confirm('Delete this schedule?')) return;
    await deleteSchedule(id);
    loadSchedules();
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Fixed header — stays visible when scrolling on mobile */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Irrigation Control</h1>
      </header>

      {/* Tab bar — switches between zone controls and schedule management */}
      <nav className="bg-white border-b border-gray-200 flex">
        {['zones', 'schedules'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="max-w-lg mx-auto px-4 py-6">

        {/* Zones tab — one ZoneCard per zone */}
        {tab === 'zones' && (
          <div className="grid gap-4">
            {/* Show a placeholder while the first fetch is in flight */}
            {zones.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Connecting…</p>
            )}
            {zones.map(zone => (
              <ZoneCard key={zone.id} zone={zone} onUpdate={updateZone} />
            ))}
          </div>
        )}

        {/* Schedules tab — list of all schedules with edit/delete/toggle actions */}
        {tab === 'schedules' && (
          <div>
            {/* Primary action button — opens the modal in create mode */}
            <button
              onClick={() => setModal({})}
              className="w-full mb-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              + Add schedule
            </button>

            {schedules.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No schedules yet</p>
            )}

            <div className="space-y-3">
              {schedules.map(s => {
                // Look up the zone name for display — zones come from separate API call.
                const zoneName = zones.find(z => z.id === s.zone_id)?.name ?? `Zone ${s.zone_id}`;
                // Format the days array for display. Empty array = every day.
                const daysLabel = s.days.length
                  ? s.days.map(d => DAY_LABELS[d]).join(', ')
                  : 'Every day';

                return (
                  <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex justify-between items-start gap-3">

                      {/* Schedule summary — zone, time, duration, days */}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{s.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {zoneName} · {s.start_time} · {s.duration_minutes} min
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{daysLabel}</p>
                      </div>

                      {/*
                       * Toggle switch — enables or disables the schedule.
                       * Visually mimics an iOS-style switch using pure CSS:
                       *   - Outer button is the track (blue = on, grey = off)
                       *   - Inner span is the white circle that slides left/right
                       */}
                      <button
                        onClick={() => handleToggle(s.id)}
                        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
                          s.enabled ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                        aria-label={s.enabled ? 'Disable schedule' : 'Enable schedule'}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                          s.enabled ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                    </div>

                    {/* Inline edit and delete links */}
                    <div className="flex gap-3 mt-3">
                      {/* Edit: opens the modal pre-populated with this schedule's data */}
                      <button
                        onClick={() => setModal({ schedule: s })}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/*
       * Schedule modal — rendered at the App level (outside main) so it overlays
       * the entire page. Only mounted when modal !== null to keep the DOM clean.
       * modal.schedule is undefined for create mode, or a schedule object for edit mode.
       */}
      {modal !== null && (
        <ScheduleModal
          schedule={modal.schedule}
          zones={zones}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
