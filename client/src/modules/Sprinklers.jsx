/**
 * Sprinklers.jsx
 * The full irrigation module — zones, schedules, and history tabs plus the
 * rain delay panel. This is the original app UI, now living behind the
 * Sprinklers tile on the landing screen and styled for the dark theme.
 *
 * All data and mutation handlers are owned by App.jsx and passed in as props,
 * so this component is purely presentational + local UI state (active tab,
 * modal, rain panel visibility).
 */

import React, { useState, useEffect } from 'react';
import ZoneCard from '../components/ZoneCard';
import ScheduleModal from '../components/ScheduleModal';
import HistoryList from '../components/HistoryList';
import UsageTab from '../components/UsageTab';
import { Droplet, CloudRain, Calendar, History, Play, Stop, ChevronLeft, Gauge, Thermometer } from '../components/Icons';
import { DAY_LABELS, nextRun, fmtNextRun } from '../utils';
import { fetchSettings, saveSettings, fetchUsage } from '../api';

const TABS = [
  { id: 'zones',     label: 'Zones',     Icon: Droplet },
  { id: 'schedules', label: 'Schedules', Icon: Calendar },
  { id: 'history',   label: 'History',   Icon: History },
  { id: 'usage',     label: 'Usage',     Icon: Gauge },
];

export default function Sprinklers({
  zones, schedules, log, rainDelayUntil,
  onUpdateZone, onSaveSchedule, onToggleSchedule, onDeleteSchedule,
  onRunAll, onStopAll, onRainDelay, onCancelRain, onRefreshLog,
  onBack,
}) {
  const [tab, setTab] = useState('zones');
  const [modal, setModal] = useState(null);   // null | {} | { schedule }
  const [rainPanel, setRainPanel] = useState(false);
  const [runAllDuration, setRunAllDuration] = useState(10);

  // Settings (flow rates, tariff, location) and usage stats are module-local —
  // nothing outside the sprinklers module needs them.
  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => { fetchSettings().then(setSettings); }, []);

  // Refresh tab-specific data when the user switches tabs.
  useEffect(() => {
    if (tab === 'history') onRefreshLog();
    if (tab === 'usage') fetchUsage().then(setUsage);
  }, [tab]);

  const anyOn = zones.some(z => z.isOn);

  async function handleSave(form) {
    await onSaveSchedule(form);
    setModal(null);
  }

  /** Saves settings then refreshes the usage stats so new rates apply immediately. */
  async function handleSaveSettings(patch) {
    const merged = await saveSettings(patch);
    setSettings(merged);
    setUsage(await fetchUsage());
  }

  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-12">

      {/* Module header: back, title, rain delay toggle */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          aria-label="Back to home"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-100">Sprinklers</h1>
          <p className="text-[11px] text-slate-500">
            {anyOn ? 'Watering in progress' : 'All zones idle'}
          </p>
        </div>
        <button
          onClick={() => setRainPanel(p => !p)}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors border ${
            rainDelayUntil
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
              : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:text-white'
          }`}
          aria-label="Rain delay"
        >
          <CloudRain className="w-4 h-4" />
        </button>
      </div>

      {/* Rain delay options panel */}
      {rainPanel && (
        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-3 mb-4">
          <p className="text-xs text-slate-400 mb-2">
            Pause scheduled watering (manual runs still work):
          </p>
          <div className="flex gap-2">
            {[24, 48, 72].map(h => (
              <button
                key={h}
                onClick={() => { onRainDelay(h); setRainPanel(false); }}
                className="flex-1 py-1.5 bg-slate-700/60 hover:bg-slate-600/60 rounded-lg text-xs font-semibold text-slate-200 transition-colors"
              >
                {h}h
              </button>
            ))}
            {rainDelayUntil && (
              <button
                onClick={() => { onCancelRain(); setRainPanel(false); }}
                className="flex-1 py-1.5 bg-cyan-500/15 text-cyan-400 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active rain delay banner */}
      {rainDelayUntil && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2.5 mb-4 text-amber-400">
          <CloudRain className="w-4 h-4 flex-shrink-0" />
          <p className="text-xs flex-1">
            Schedules paused until{' '}
            {new Date(rainDelayUntil).toLocaleString(undefined, {
              weekday: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
          <button onClick={onCancelRain} className="text-xs font-semibold underline">
            Resume
          </button>
        </div>
      )}

      {/* Tab bar — segmented control */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-1 flex mb-5">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === id
                ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ZONES TAB */}
      {tab === 'zones' && (
        <div className="space-y-4">
          {zones.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-12">Connecting…</p>
          )}

          {zones.map(zone => (
            <ZoneCard key={zone.id} zone={zone} onUpdate={onUpdateZone} />
          ))}

          {/* Water all / stop all controls */}
          {zones.length > 0 && (
            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
              {anyOn ? (
                <button
                  onClick={onStopAll}
                  className="w-full flex items-center justify-center gap-2 bg-red-500/90 hover:bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                >
                  <Stop className="w-4 h-4" /> Stop everything
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-200">Water all zones</p>
                    <p className="text-xs text-slate-500">Runs each zone in sequence</p>
                  </div>
                  <select
                    value={runAllDuration}
                    onChange={e => setRunAllDuration(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    {[5, 10, 15, 20, 30].map(d => (
                      <option key={d} value={d}>{d} min each</option>
                    ))}
                  </select>
                  <button
                    onClick={() => onRunAll(runAllDuration)}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl px-4 py-2 text-xs font-semibold transition-all"
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
            className="w-full mb-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-white rounded-xl text-sm font-semibold transition-all"
          >
            + Add schedule
          </button>

          {schedules.length === 0 && (
            <div className="text-center py-16">
              <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-700" />
              <p className="text-sm text-slate-500">No schedules yet</p>
            </div>
          )}

          <div className="space-y-3">
            {schedules.map(s => {
              const zoneName = zones.find(z => z.id === s.zone_id)?.name ?? `Zone ${s.zone_id}`;
              const next = nextRun(s);
              return (
                <div
                  key={s.id}
                  className={`bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4 ${
                    s.enabled ? '' : 'opacity-50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-gray-100 truncate">{s.name}</p>
                        {/* Hot-day condition pill */}
                        {s.temp_threshold != null && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold flex-shrink-0">
                            <Thermometer className="w-2.5 h-2.5" /> ≥{s.temp_threshold}°C
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {zoneName} · {s.start_time} · {s.duration_minutes} min
                      </p>
                      <p className={`text-xs mt-1 font-medium ${
                        s.enabled ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {s.enabled && next ? `Next: ${fmtNextRun(next)}` : 'Paused'}
                      </p>
                    </div>
                    <button
                      onClick={() => onToggleSchedule(s.id)}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
                        s.enabled ? 'bg-emerald-500' : 'bg-slate-600'
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
                            ? 'bg-cyan-500/15 text-cyan-400'
                            : 'bg-slate-700/40 text-slate-600'
                        }`}
                      >
                        {label[0]}
                      </span>
                    ))}
                    <div className="flex-1" />
                    <button
                      onClick={() => setModal({ schedule: s })}
                      className="text-xs text-cyan-400 font-medium hover:underline px-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteSchedule(s.id)}
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

      {/* HISTORY TAB — settings enable per-entry cost estimates */}
      {tab === 'history' && <HistoryList log={log} zones={zones} settings={settings} />}

      {/* USAGE TAB — cost dashboard + settings. Keyed on settings so the form
          re-initialises once the settings fetch lands. */}
      {tab === 'usage' && settings !== null && (
        <UsageTab
          key={JSON.stringify(settings)}
          zones={zones}
          usage={usage}
          settings={settings}
          onSave={handleSaveSettings}
        />
      )}

      {modal !== null && (
        <ScheduleModal
          schedule={modal.schedule}
          zones={zones}
          hasLocation={Boolean(settings?.location)}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
