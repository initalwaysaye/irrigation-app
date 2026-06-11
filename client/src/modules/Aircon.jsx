/**
 * Aircon.jsx
 * The Air Conditioning module — controls a Bosch Climate 3200i over Matter.
 *
 * Two states:
 *   Not paired → step-by-step pairing screen (enter the Matter pairing code
 *                generated in the Bosch HomeCom Easy app). Commissioning runs
 *                over the LAN and takes ~10-30 seconds.
 *   Paired     → thermostat UI: big target temperature with +/− steppers,
 *                power toggle, mode chips, fan speed chips, room temperature.
 *
 * Controls update optimistically; every mutation returns fresh status from
 * the server which then overwrites local state.
 *
 * Props:
 *   status         - aircon status object from /api/aircon/status (or null)
 *   onStatusChange - callback(newStatus) to push server responses up to App
 *   onBack         - navigate back to the landing screen
 */

import React, { useState } from 'react';
import {
  commissionAircon, decommissionAircon,
  setAirconPower, setAirconMode, setAirconTemp, setAirconFan,
} from '../api';
import { Snowflake, ChevronLeft, Thermometer } from '../components/Icons';

const MODES = [
  { id: 'auto', label: 'Auto' },
  { id: 'cool', label: 'Cool' },
  { id: 'heat', label: 'Heat' },
  { id: 'dry',  label: 'Dry' },
  { id: 'fan',  label: 'Fan' },
];

const FAN_MODES = [
  { id: 'auto',   label: 'Auto' },
  { id: 'low',    label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high',   label: 'High' },
];

// Accent colour per mode — heat glows warm, everything else cool blue.
const MODE_ACCENT = {
  heat: 'from-orange-500 to-red-500',
  default: 'from-blue-500 to-indigo-600',
};

export default function Aircon({ status, onStatusChange, onBack }) {
  const [busy, setBusy] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState(null);

  /** Runs a control action, pushing the server's refreshed status up to App. */
  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      if (next.error && !next.commissioned) setError(next.error);
      onStatusChange(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePair(e) {
    e.preventDefault();
    setPairing(true);
    setError(null);
    try {
      const next = await commissionAircon(pairCode.trim());
      if (next.error) throw new Error(next.error);
      onStatusChange(next);
    } catch (err) {
      setError(err.message || 'Pairing failed — check the code and try again');
    } finally {
      setPairing(false);
    }
  }

  async function handleUnpair() {
    if (!confirm('Unpair the air conditioner from this app? It stays connected to HomeCom.')) return;
    await act(() => decommissionAircon());
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
        <h1 className="text-lg font-bold text-gray-100">Air Conditioning</h1>
        <p className="text-[11px] text-slate-500">Bosch Climate 3200i</p>
      </div>
      <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
        <Snowflake className="w-4 h-4 text-blue-400" />
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

  // ---- Pairing screen ----
  if (!status.commissioned) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 pb-12">
        {header}

        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-200 mb-3">Pair your air conditioner</h2>
          <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Open the <span className="text-slate-200">Bosch HomeCom Easy</span> app</li>
            <li>Select your AC → settings → <span className="text-slate-200">Connectivity / Matter</span></li>
            <li>Generate a <span className="text-slate-200">Matter pairing code</span></li>
            <li>Enter the code below within a few minutes</li>
          </ol>
        </div>

        <form onSubmit={handlePair} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            value={pairCode}
            onChange={e => setPairCode(e.target.value)}
            placeholder="Pairing code, e.g. 3497-011-2332"
            required
            className="w-full h-12 bg-slate-900 border border-slate-600 text-gray-100 rounded-xl px-4 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <button
            type="submit"
            disabled={pairing || !pairCode.trim()}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
          >
            {pairing ? 'Pairing — this can take 30 seconds…' : 'Pair device'}
          </button>
        </form>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-3">
            {error}
          </p>
        )}

        {!status.available && status.error && (
          <p className="text-xs text-amber-400/80 mt-3 text-center">
            Matter controller issue: {status.error}
          </p>
        )}
      </div>
    );
  }

  // ---- Control screen ----
  const accent = MODE_ACCENT[status.mode] ?? MODE_ACCENT.default;
  const offline = !status.online;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-12">
      {header}

      {offline && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 mb-4">
          Device unreachable — check the AC has power and WiFi.
        </p>
      )}

      {/* Thermostat card */}
      <div className={`rounded-3xl p-6 mb-4 border transition-all ${
        status.on
          ? 'bg-gradient-to-br from-slate-800/90 to-slate-800/50 border-blue-500/30'
          : 'bg-slate-800/50 border-slate-700/60'
      }`}>
        {/* Room temp + power row */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5" />
            Room {status.roomTemp != null ? `${status.roomTemp.toFixed(1)}°` : '—'}
          </p>
          {/* Power toggle */}
          <button
            onClick={() => act(() => setAirconPower(!status.on))}
            disabled={busy || offline}
            className={`relative w-14 h-8 rounded-full transition-colors disabled:opacity-50 ${
              status.on ? `bg-gradient-to-r ${accent}` : 'bg-slate-600'
            }`}
            aria-label={status.on ? 'Turn off' : 'Turn on'}
          >
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${
              status.on ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Big target temperature with steppers */}
        <div className={`flex items-center justify-center gap-6 transition-opacity ${
          status.on ? '' : 'opacity-40'
        }`}>
          <button
            onClick={() => act(() => setAirconTemp(status.targetTemp - 0.5))}
            disabled={busy || offline || !status.on || status.targetTemp == null}
            className="w-12 h-12 rounded-full bg-slate-700/60 hover:bg-slate-600/60 disabled:opacity-40 text-gray-200 text-2xl font-light transition-colors"
          >
            −
          </button>
          <div className="text-center w-36">
            <p className="text-6xl font-bold text-gray-100 tabular-nums">
              {status.targetTemp != null ? status.targetTemp.toFixed(1) : '—'}
              <span className="text-2xl text-slate-400 font-normal">°</span>
            </p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mt-1">target</p>
          </div>
          <button
            onClick={() => act(() => setAirconTemp(status.targetTemp + 0.5))}
            disabled={busy || offline || !status.on || status.targetTemp == null}
            className="w-12 h-12 rounded-full bg-slate-700/60 hover:bg-slate-600/60 disabled:opacity-40 text-gray-200 text-2xl font-light transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Mode selector */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Mode</p>
        <div className="flex gap-1.5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => act(() => setAirconMode(m.id))}
              disabled={busy || offline}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
                status.mode === m.id && status.on
                  ? `bg-gradient-to-r ${m.id === 'heat' ? MODE_ACCENT.heat : MODE_ACCENT.default} text-white`
                  : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fan speed */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Fan</p>
        <div className="flex gap-1.5">
          {FAN_MODES.map(f => (
            <button
              key={f.id}
              onClick={() => act(() => setAirconFan(f.id))}
              disabled={busy || offline}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
                status.fanMode === f.id
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <button
        onClick={handleUnpair}
        className="w-full text-xs text-slate-500 hover:text-red-400 py-2 transition-colors"
      >
        Unpair device
      </button>
    </div>
  );
}
