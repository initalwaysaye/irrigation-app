/**
 * HomeScreen.jsx
 * The landing screen of the home automation hub — a greeting plus one tile
 * per module. Sprinklers is live; Aircon and Underfloor Heating are
 * placeholders until their hardware integrations exist.
 *
 * Props:
 *   zones          - live zone array (for the sprinkler tile status line)
 *   schedules      - schedule array (for "Next: ..." on the sprinkler tile)
 *   rainDelayUntil - ISO string while a rain delay is active, else null
 *   onOpen         - callback(viewId) to navigate into a module
 */

import React, { useState, useEffect } from 'react';
import { Droplet, Snowflake, Flame, CloudRain, ChevronRight } from './Icons';
import { nextRun, fmtNextRun, fmtTime } from '../utils';

/** Time-of-day greeting for the header. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Builds the sprinkler tile's status line from live data.
 * Priority: actively watering → rain delay → next schedule → idle.
 * Returns { text, active } where active drives the glow/pulse styling.
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
  // Find the soonest next run across all enabled schedules.
  const upcoming = schedules.map(nextRun).filter(Boolean).sort((a, b) => a - b)[0];
  if (upcoming) return { text: `Next run: ${fmtNextRun(upcoming)}`, active: false };
  return { text: 'All quiet', active: false };
}

/**
 * One tile on the landing screen.
 * Live modules navigate on tap; coming-soon modules still open (to their
 * placeholder screen) but are visually dimmed.
 */
function Tile({ icon, iconBg, title, status, statusIcon, active, comingSoon, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-3xl px-5 min-h-[96px] flex items-center gap-4 transition-all duration-200 active:scale-[0.98]
        bg-slate-800/70 border backdrop-blur
        ${active ? 'border-cyan-500/40 glow-active' : 'border-slate-700/60 hover:border-slate-600'}
        ${comingSoon ? 'opacity-70' : ''}`}
    >
      {/* Module icon */}
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>

      {/* Title + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-100 truncate">{title}</h2>
          {comingSoon && (
            <span className="inline-flex items-center justify-center leading-none whitespace-nowrap px-2 py-1 rounded-full bg-slate-700/80 text-slate-400 text-[10px] font-semibold uppercase tracking-wide">
              Coming soon
            </span>
          )}
        </div>
        <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${
          active ? 'text-cyan-400' : 'text-slate-400'
        }`}>
          {statusIcon}
          <span className="truncate">{status}</span>
          {active && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />}
        </p>
      </div>

      <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
    </button>
  );
}

export default function HomeScreen({ zones, schedules, rainDelayUntil, onOpen }) {
  // Tick every second only while a zone is running, so the tile countdown is live.
  const anyOn = zones.some(z => z.isOn);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!anyOn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyOn]);

  const sprinkler = sprinklerStatus(zones, schedules, rainDelayUntil, now);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="max-w-lg mx-auto px-5 pt-10 pb-12">

      {/* Greeting header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-100">{greeting()}</h1>
        <p className="text-sm text-slate-500 mt-1">{today}</p>
      </div>

      {/* Module tiles */}
      <div className="space-y-3">
        <Tile
          icon={<Droplet className={`w-6 h-6 text-cyan-400 ${sprinkler.active ? 'animate-pulse' : ''}`} />}
          iconBg="bg-cyan-500/10"
          title="Sprinklers"
          status={sprinkler.text}
          statusIcon={sprinkler.rain ? <CloudRain className="w-3.5 h-3.5 flex-shrink-0" /> : null}
          active={sprinkler.active}
          onClick={() => onOpen('sprinklers')}
        />

        <Tile
          icon={<Snowflake className="w-6 h-6 text-blue-400" />}
          iconBg="bg-blue-500/10"
          title="Air Conditioning"
          status="Not connected"
          comingSoon
          onClick={() => onOpen('aircon')}
        />

        <Tile
          icon={<Flame className="w-6 h-6 text-amber-400" />}
          iconBg="bg-amber-500/10"
          title="Underfloor Heating"
          status="Not connected"
          comingSoon
          onClick={() => onOpen('ufh')}
        />
      </div>

      <p className="text-center text-[11px] text-slate-700 mt-10">Home Control</p>
    </div>
  );
}
