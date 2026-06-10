/**
 * HomeScreen.jsx
 * The landing screen of the home automation hub.
 *
 * Layout:
 *   - Ambient background glows (decorative, pointer-events-none)
 *   - Greeting header
 *   - Sprinklers hero card: live status with countdown, plus a mini stat row
 *   - Aircon + UFH as a side-by-side pair of "coming soon" cards
 *
 * Cards animate in with a staggered rise (see .rise in index.css).
 *
 * Props:
 *   zones          - live zone array
 *   schedules      - schedule array
 *   rainDelayUntil - ISO string while a rain delay is active, else null
 *   onOpen         - callback(viewId) to navigate into a module
 */

import React, { useState, useEffect } from 'react';
import { Droplet, Snowflake, Flame, CloudRain, ChevronRight, Calendar } from './Icons';
import { nextRun, fmtNextRun, fmtTime } from '../utils';

/** Time-of-day greeting for the header. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Builds the sprinkler card's status line from live data.
 * Priority: actively watering → rain delay → next schedule → idle.
 */
function sprinklerStatus(zones, schedules, rainDelayUntil, now) {
  const running = zones.filter(z => z.isOn);
  if (running.length === 1) {
    const z = running[0];
    if (z.autoOffAt) {
      const secs = Math.max(0, Math.round((new Date(z.autoOffAt) - now) / 1000));
      return { text: `Watering ${z.name} · ${fmtTime(secs)} left`, active: true };
    }
    return { text: `Watering ${z.name}`, active: true };
  }
  if (running.length > 1) {
    return { text: `Watering ${running.length} zones`, active: true };
  }
  if (rainDelayUntil) {
    const until = new Date(rainDelayUntil).toLocaleString(undefined, {
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
    return { text: `Rain delay until ${until}`, active: false, rain: true };
  }
  const upcoming = schedules.map(nextRun).filter(Boolean).sort((a, b) => a - b)[0];
  if (upcoming) return { text: `Next run: ${fmtNextRun(upcoming)}`, active: false };
  return { text: 'All quiet', active: false };
}

export default function HomeScreen({ zones, schedules, rainDelayUntil, onOpen }) {
  // Tick every second only while a zone is running, so the countdown is live.
  const anyOn = zones.some(z => z.isOn);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!anyOn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyOn]);

  const status = sprinklerStatus(zones, schedules, rainDelayUntil, now);
  const activeSchedules = schedules.filter(s => s.enabled).length;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="relative isolate min-h-screen overflow-hidden">

      {/* Ambient background glows — purely decorative */}
      <div className="absolute -z-10 pointer-events-none inset-0">
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-80 h-80 rounded-full bg-sky-600/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-amber-500/[0.06] blur-3xl" />
      </div>

      <div className="max-w-lg mx-auto px-5 pt-12 pb-12">

        {/* Greeting header */}
        <div className="mb-8 rise">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400/80 mb-2">
            {today}
          </p>
          <h1 className="text-3xl font-bold text-gray-100 leading-tight">
            {greeting()}<span className="text-cyan-400">.</span>
          </h1>
        </div>

        {/* Sprinklers hero card */}
        <button
          onClick={() => onOpen('sprinklers')}
          style={{ animationDelay: '80ms' }}
          className={`rise w-full text-left rounded-3xl p-5 mb-4 transition-all duration-200 active:scale-[0.98] border backdrop-blur
            bg-gradient-to-br from-slate-800/90 to-slate-800/50
            ${status.active ? 'border-cyan-500/40 glow-active' : 'border-slate-700/60 hover:border-slate-500/60'}`}
        >
          <div className="flex items-center gap-4">
            {/* Glowing icon block */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0
              bg-gradient-to-br from-cyan-500 to-sky-600 shadow-lg shadow-cyan-500/25`}
            >
              <Droplet className={`w-7 h-7 text-white ${status.active ? 'animate-pulse' : ''}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-100">Sprinklers</h2>
              <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${
                status.active ? 'text-cyan-400' : status.rain ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {status.rain && <CloudRain className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{status.text}</span>
                {status.active && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
          </div>

          {/* Mini stat row */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-700/50">
            <div className="flex items-center gap-2">
              <Droplet className="w-3.5 h-3.5 text-slate-500" />
              <div>
                <p className="text-sm font-bold text-gray-200 leading-none">{zones.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">zones</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <div>
                <p className="text-sm font-bold text-gray-200 leading-none">{activeSchedules}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">schedules on</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CloudRain className="w-3.5 h-3.5 text-slate-500" />
              <div>
                <p className="text-sm font-bold text-gray-200 leading-none">{rainDelayUntil ? 'On' : 'Off'}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">rain delay</p>
              </div>
            </div>
          </div>
        </button>

        {/* Coming-soon modules — side by side */}
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              id: 'aircon', title: 'Aircon', Icon: Snowflake, delay: '160ms',
              iconCls: 'from-blue-500 to-indigo-600 shadow-blue-500/25',
            },
            {
              id: 'ufh', title: 'Heating', Icon: Flame, delay: '240ms',
              iconCls: 'from-amber-500 to-orange-600 shadow-amber-500/25',
            },
          ].map(({ id, title, Icon, delay, iconCls }) => (
            <button
              key={id}
              onClick={() => onOpen(id)}
              style={{ animationDelay: delay }}
              className="rise text-left rounded-3xl p-5 transition-all duration-200 active:scale-[0.98]
                bg-gradient-to-br from-slate-800/90 to-slate-800/40 border border-slate-700/60
                hover:border-slate-500/60 opacity-90"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4
                bg-gradient-to-br ${iconCls} shadow-lg`}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h2 className="font-bold text-gray-100">{title}</h2>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-1">
                Coming soon
              </p>
            </button>
          ))}
        </div>

        <p className="text-center text-[11px] text-slate-700 mt-10 rise" style={{ animationDelay: '320ms' }}>
          Home Control
        </p>
      </div>
    </div>
  );
}
