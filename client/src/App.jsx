/**
 * App.jsx
 * Root component — owns all application state and coordinates data fetching.
 *
 * Tabs:
 *   zones     - live zone control cards + "water all" / "stop all"
 *   schedules - recurring schedule management with next-run preview
 *   history   - log of past watering events
 *
 * Other state:
 *   rainDelayUntil - ISO timestamp while a rain delay is active (schedules paused)
 *   modal          - schedule modal: null (closed) | {} (create) | { schedule } (edit)
 *   rainPanel      - whether the rain delay options panel is open
 */

import React, { useState, useEffect, useCallback } from 'react';
import ZoneCard from './components/ZoneCard';
import ScheduleModal from './components/ScheduleModal';
import HistoryList from './components/HistoryList';
import { Droplet, CloudRain, Calendar, History, Play, Stop } from './components/Icons';
import {
  fetchZones, fetchSchedules, fetchLog, fetchStatus,
  createSchedule, updateSchedule, toggleSchedule, deleteSchedule,
  runAllZones, stopAllZones, setRainDelay, cancelRainDelay,
} from './api';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TABS = [
  { id: 'zones',     label: 'Zones',     Icon: Droplet },
  { id: 'schedules', label: 'Schedules', Icon: Calendar },
  { id: 'history',   label: 'History',   Icon: History },
];

/**
 * Works out when a schedule will next fire, scanning up to 8 days ahead.
 * Returns a Date, or null if the schedule is disabled.
 */
function nextRun(s) {
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
function fmtNextRun(d) {
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

export default function App() {
  const [zones, setZones] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [log, setLog] = useState([]);
  const [rainDelayUntil, setRainDelayUntil] = useState(null);
  const [tab, setTab] = useState('zones');
  const [modal, setModal] = useState(null);
  const [rainPanel, setRainPanel] = useState(false);
  const [runAllDuration, setRunAllDuration] = useState(10);

  const loadZones = useCallback(() => fetchZones().then(setZones), []);
  const loadSchedules = useCallback(() => fetchSchedules().then(setSchedules), []);
  const loadLog = useCallback(() => fetchLog().then(setLog), []);
  const loadStatus = useCallback(
    () => fetchStatus().then(s => setRainDelayUntil(s.rainDelayUntil)), []
  );

  useEffect(() => {
    loadZones();
    loadSchedules();
    loadLog();
    loadStatus();
    // Poll zones + status every 10s so scheduled runs and delay expiry show up
    // without a refresh. Schedules/log reload on demand instead.
    const id = setInterval(() => { loadZones(); loadStatus(); }, 10000);
    return () => clearInterval(id);
  }, []);

  // Refresh the history list whenever the user switches to that tab.
  useEffect(() => { if (tab === 'history') loadLog(); }, [tab]);

  function updateZone(updated) {
    setZones(zs => zs.map(z => z.id === updated.id ? updated : z));
  }

  async function handleSave(form) {
    if (form.id) await updateSchedule(form.id, form);
    else await createSchedule(form);
    setModal(null);
    loadSchedules();
  }

  async function handleToggle(id) {
    await toggleSchedule(id);
    loadSchedules();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this schedule?')) return;
    await deleteSchedule(id);
    loadSchedules();
  }

  async function handleRunAll() {
    setZones(await runAllZones(runAllDuration));
  }

  async function handleStopAll() {
    setZones(await stopAllZones());
  }

  async function handleRainDelay(hours) {
    const s = await setRainDelay(hours);
    setRainDelayUntil(s.rainDelayUntil);
    setRainPanel(false);
  }

  async function handleCancelRain() {
    await cancelRainDelay();
    setRainDelayUntil(null);
  }

  const anyOn = zones.some(z => z.isOn);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-sky-50/50">

      {/* Header — gradient banner with app title and rain delay button */}
      <header className="bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 text-white sticky top-0 z-20 shadow-md">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
            <Droplet className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Irrigation</h1>
            <p className="text-[11px] text-sky-100">
              {anyOn ? 'Watering in progress' : 'All zones idle'}
            </p>
          </div>
          {/* Rain delay toggle — highlighted while a delay is active */}
          <button
            onClick={() => setRainPanel(p => !p)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              rainDelayUntil ? 'bg-white text-sky-600' : 'bg-white/15 hover:bg-white/25'
            }`}
            aria-label="Rain delay"
          >
            <CloudRain className="w-5 h-5" />
          </button>
        </div>

        {/* Rain delay options panel */}
        {rainPanel && (
          <div className="max-w-lg mx-auto px-4 pb-4">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs text-sky-100 mb-2">
                Pause scheduled watering (manual runs still work):
              </p>
              <div className="flex gap-2">
                {[24, 48, 72].map(h => (
                  <button
                    key={h}
                    onClick={() => handleRainDelay(h)}
                    className="flex-1 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-semibold transition-colors"
                  >
                    {h}h
                  </button>
                ))}
                {rainDelayUntil && (
                  <button
                    onClick={() => { handleCancelRain(); setRainPanel(false); }}
                    className="flex-1 py-1.5 bg-white text-sky-700 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Active rain delay banner */}
      {rainDelayUntil && (
        <div className="bg-amber-50 border-b border-amber-100">
          <div className="max-w-lg mx-auto px-4 py-2 flex items-center gap-2 text-amber-700">
            <CloudRain className="w-4 h-4 flex-shrink-0" />
            <p className="text-xs flex-1">
              Schedules paused until{' '}
              {new Date(rainDelayUntil).toLocaleString(undefined, {
                weekday: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            <button onClick={handleCancelRain} className="text-xs font-semibold underline">
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Tab bar — segmented control */}
      <nav className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-white rounded-xl p-1 flex shadow-sm border border-gray-100">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === id
                  ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-lg mx-auto px-4 py-5 pb-12">

        {/* ZONES TAB */}
        {tab === 'zones' && (
          <div className="space-y-4">
            {zones.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-12">Connecting…</p>
            )}

            {zones.map(zone => (
              <ZoneCard key={zone.id} zone={zone} onUpdate={updateZone} />
            ))}

            {/* Water all / stop all controls */}
            {zones.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                {anyOn ? (
                  <button
                    onClick={handleStopAll}
                    className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                  >
                    <Stop className="w-4 h-4" /> Stop everything
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">Water all zones</p>
                      <p className="text-xs text-gray-400">Runs each zone in sequence</p>
                    </div>
                    <select
                      value={runAllDuration}
                      onChange={e => setRunAllDuration(Number(e.target.value))}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    >
                      {[5, 10, 15, 20, 30].map(d => (
                        <option key={d} value={d}>{d} min each</option>
                      ))}
                    </select>
                    <button
                      onClick={handleRunAll}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl px-4 py-2 text-xs font-semibold transition-all"
                    >
                      <Play className="w-3.5 h-3.5" /> Start
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SCHEDULES TAB */}
        {tab === 'schedules' && (
          <div>
            <button
              onClick={() => setModal({})}
              className="w-full mb-4 py-2.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
            >
              + Add schedule
            </button>

            {schedules.length === 0 && (
              <div className="text-center py-16 text-gray-300">
                <Calendar className="w-10 h-10 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No schedules yet</p>
              </div>
            )}

            <div className="space-y-3">
              {schedules.map(s => {
                const zoneName = zones.find(z => z.id === s.zone_id)?.name ?? `Zone ${s.zone_id}`;
                const next = nextRun(s);
                return (
                  <div
                    key={s.id}
                    className={`bg-white rounded-2xl border shadow-sm p-4 transition-opacity ${
                      s.enabled ? 'border-gray-100' : 'border-gray-100 opacity-60'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{s.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {zoneName} · {s.start_time} · {s.duration_minutes} min
                        </p>
                        {/* Next run preview, or paused state */}
                        <p className={`text-xs mt-1 font-medium ${
                          s.enabled ? 'text-emerald-600' : 'text-gray-400'
                        }`}>
                          {s.enabled && next ? `Next: ${fmtNextRun(next)}` : 'Paused'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggle(s.id)}
                        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
                          s.enabled ? 'bg-emerald-500' : 'bg-gray-200'
                        }`}
                        aria-label={s.enabled ? 'Disable schedule' : 'Enable schedule'}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                          s.enabled ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                    </div>

                    {/* Day-of-week pills */}
                    <div className="flex gap-1 mt-3">
                      {DAY_LABELS.map((label, i) => (
                        <span
                          key={i}
                          className={`w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                            !s.days.length || s.days.includes(i)
                              ? 'bg-sky-100 text-sky-600'
                              : 'bg-gray-50 text-gray-300'
                          }`}
                        >
                          {label[0]}
                        </span>
                      ))}
                      <div className="flex-1" />
                      <button
                        onClick={() => setModal({ schedule: s })}
                        className="text-xs text-sky-600 font-medium hover:underline px-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-xs text-red-400 font-medium hover:underline px-1"
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

        {/* HISTORY TAB */}
        {tab === 'history' && <HistoryList log={log} zones={zones} />}
      </main>

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
