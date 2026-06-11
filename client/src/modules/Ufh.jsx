/**
 * Ufh.jsx
 * The Underfloor Heating module — Heatmiser NeoHub/NeoStats over the local API.
 *
 * Two states:
 *   Not configured → setup screen: hub IP + API token (generated in the
 *                    Heatmiser neoApp under Settings → API), with the
 *                    connection tested before saving.
 *   Configured     → one card per room: current temperature, flame indicator
 *                    while calling for heat, and target temp with −/+ steppers.
 *
 * Temperature changes are optimistic; the server's refreshed status (returned
 * by every mutation) overwrites local state.
 *
 * Props:
 *   status         - UFH status from /api/ufh/status (or null while loading)
 *   onStatusChange - callback(newStatus) to push server responses up to App
 *   onBack         - navigate back to the landing screen
 */

import React, { useState } from 'react';
import { setupUfh, clearUfh, setUfhTarget } from '../api';
import { Flame, ChevronLeft } from '../components/Icons';

export default function Ufh({ status, onStatusChange, onBack }) {
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [busyRoom, setBusyRoom] = useState(null);
  const [error, setError] = useState(null);

  async function handleConnect(e) {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    try {
      onStatusChange(await setupUfh(host.trim(), token.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect the NeoHub from this app?')) return;
    onStatusChange(await clearUfh());
  }

  /** Nudges a room's target by ±0.5°, optimistically then server-confirmed. */
  async function nudge(room, delta) {
    const target = Math.min(35, Math.max(5, room.targetTemp + delta));
    setBusyRoom(room.name);
    setError(null);
    // Optimistic update for instant feedback
    onStatusChange({
      ...status,
      rooms: status.rooms.map(r => r.name === room.name ? { ...r, targetTemp: target } : r),
    });
    try {
      onStatusChange(await setUfhTarget(room.name, target));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRoom(null);
    }
  }

  const header = (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={onBack}
        className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
        aria-label="Back to home"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="flex-1">
        <h1 className="text-lg font-bold text-gray-100">Underfloor Heating</h1>
        <p className="text-[11px] text-slate-500">Heatmiser NeoStat</p>
      </div>
      <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
        <Flame className="w-4 h-4 text-amber-400" />
      </div>
    </div>
  );

  // ---- Loading ----
  if (!status) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 pb-12">
        {header}
        <p className="text-center text-slate-500 text-sm py-12">Connecting…</p>
      </div>
    );
  }

  // ---- Setup screen ----
  if (!status.configured) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 pb-12">
        {header}

        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-200 mb-3">Connect your NeoHub</h2>
          <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Open the <span className="text-slate-200">Heatmiser neoApp</span></li>
            <li>Go to <span className="text-slate-200">Settings → API</span></li>
            <li>Tap <span className="text-slate-200">+</span> to generate an API token and copy it</li>
            <li>Enter your hub's IP address and the token below</li>
          </ol>
          <p className="text-[11px] text-slate-500 mt-3">
            Older hubs with the legacy API enabled can connect with just the IP — leave the token blank.
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-3">
          <input
            type="text"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="Hub IP address, e.g. 192.168.0.50"
            required
            className="w-full h-11 bg-slate-900 border border-slate-600 text-gray-100 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <input
            type="text"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="API token (blank for legacy hubs)"
            className="w-full h-11 bg-slate-900 border border-slate-600 text-gray-100 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <button
            type="submit"
            disabled={connecting || !host.trim()}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-3">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ---- Room control ----
  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-12">
      {header}

      {!status.online && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 mb-4">
          NeoHub unreachable — check it has power and network.
          {status.error ? ` (${status.error})` : ''}
        </p>
      )}

      <div className="space-y-3">
        {status.rooms.map(room => (
          <div
            key={room.name}
            className={`rounded-2xl p-4 border transition-all ${
              room.heating
                ? 'bg-gradient-to-br from-slate-800/90 to-slate-800/50 border-amber-500/30'
                : 'bg-slate-800/70 border-slate-700/60'
            } ${room.offline ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-4">
              {/* Flame indicator */}
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                room.heating
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25'
                  : 'bg-slate-700/50'
              }`}>
                <Flame className={`w-5 h-5 ${room.heating ? 'text-white animate-pulse' : 'text-slate-500'}`} />
              </div>

              {/* Name + current temp */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-100 truncate">{room.name}</p>
                  {room.offline && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-semibold flex-shrink-0">
                      offline
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="text-xl font-bold text-gray-100 tabular-nums">
                    {room.currentTemp.toFixed(1)}°
                  </span>
                  <span className="ml-2">
                    {room.heating ? 'heating' : 'idle'} · set to {room.targetTemp.toFixed(1)}°
                  </span>
                </p>
              </div>

              {/* Target steppers */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => nudge(room, -0.5)}
                  disabled={busyRoom === room.name || room.offline}
                  className="w-9 h-9 rounded-full bg-slate-700/60 hover:bg-slate-600/60 disabled:opacity-40 text-gray-200 text-lg font-light transition-colors"
                >
                  −
                </button>
                <button
                  onClick={() => nudge(room, 0.5)}
                  disabled={busyRoom === room.name || room.offline}
                  className="w-9 h-9 rounded-full bg-slate-700/60 hover:bg-slate-600/60 disabled:opacity-40 text-gray-200 text-lg font-light transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}

        {status.online && status.rooms.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-12">
            Connected, but no thermostats found on the hub.
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-4">
          {error}
        </p>
      )}

      <button
        onClick={handleDisconnect}
        className="w-full text-xs text-slate-500 hover:text-red-400 py-2 mt-4 transition-colors"
      >
        Disconnect hub
      </button>
    </div>
  );
}
