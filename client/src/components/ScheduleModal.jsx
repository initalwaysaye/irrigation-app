/**
 * ScheduleModal.jsx
 * A modal dialog for creating a new schedule or editing an existing one.
 * The same component handles both cases — controlled by whether the 'schedule'
 * prop is provided.
 *
 * Props:
 *   schedule - existing schedule object to edit, or undefined for a new schedule
 *   zones    - array of zone objects (for the zone selector dropdown)
 *   onSave   - called with the form data when the user submits; parent handles the API call
 *   onClose  - called when the user cancels or clicks the backdrop
 */

import React, { useState } from 'react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Default values for a brand new schedule.
const DEFAULTS = {
  zone_id: 1,
  name: '',
  days: [],           // empty array = runs every day
  start_time: '06:00',
  duration_minutes: 10,
  enabled: true,
};

export default function ScheduleModal({ schedule, zones, onSave, onClose }) {
  // Initialise form state from the existing schedule (edit mode) or defaults (create mode).
  // Spread into a new object so edits don't mutate the prop directly.
  const [form, setForm] = useState(schedule ? { ...schedule } : { ...DEFAULTS });

  /**
   * Toggles a day in the days array.
   * If the day is already selected, removes it; otherwise adds it.
   * The array is kept sorted so the cron expression generation on the server
   * is predictable (e.g. [1,3,5] not [5,1,3]).
   */
  function toggleDay(d) {
    setForm(f => ({
      ...f,
      days: f.days.includes(d)
        ? f.days.filter(x => x !== d)                       // remove
        : [...f.days, d].sort((a, b) => a - b),             // add and sort
    }));
  }

  /** Generic field setter — keeps the form update logic DRY. */
  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  return (
    /*
     * Backdrop — clicking outside the modal dismisses it.
     * The inner div stops click events from propagating up to the backdrop,
     * so clicking inside the modal doesn't close it.
     */
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-5 text-gray-900">
          {schedule ? 'Edit Schedule' : 'New Schedule'}
        </h2>

        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-4">

          {/* Zone selector — which relay/valve this schedule controls */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
            <select
              value={form.zone_id}
              onChange={e => set('zone_id', Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>

          {/* Human-readable name for identifying this schedule in the list */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              placeholder="e.g. Morning front lawn"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          {/*
           * Day-of-week selector.
           * Each button toggles one day. Active days are highlighted blue.
           * Leaving all unselected means the schedule runs every day
           * (the server converts an empty array to '*' in the cron expression).
           */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Days{' '}
              <span className="font-normal text-gray-400">(leave empty for every day)</span>
            </label>
            <div className="flex gap-1 flex-wrap">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button" // prevents this from submitting the form
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    form.days.includes(i)
                      ? 'bg-sky-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Start time and duration — side by side to save vertical space */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
              {/* type="time" gives a native time picker on mobile */}
              <input
                type="time"
                value={form.start_time}
                onChange={e => set('start_time', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input
                type="number"
                min="1"
                max="120"
                value={form.duration_minutes}
                onChange={e => set('duration_minutes', Number(e.target.value))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          </div>

          {/* Form actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {schedule ? 'Save changes' : 'Add schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
