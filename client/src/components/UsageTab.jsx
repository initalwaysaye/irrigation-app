/**
 * UsageTab.jsx
 * The Usage tab of the sprinklers module: water usage & cost dashboard,
 * plus the settings that power it (per-zone flow rates, water tariff, and
 * the home location used by temperature-conditional schedules).
 *
 * Props:
 *   zones      - zone array (names for the per-zone inputs and breakdown)
 *   usage      - { configured, periods } from GET /api/system/usage (or null while loading)
 *   settings   - { flowRates, tariffPerM3, location } from GET /api/system/settings
 *   onSave     - async callback(settingsPatch) — saves and triggers a usage refresh
 */

import React, { useState } from 'react';
import { Droplet, Gauge, MapPin } from './Icons';

/** Formats a cost in pounds, e.g. 1.5 → "£1.50". */
function fmtCost(c) {
  if (c == null) return '—';
  return `£${c.toFixed(2)}`;
}

/** Formats litres compactly, e.g. 1530 → "1,530 L". */
function fmtLitres(l) {
  if (l == null) return '—';
  return `${l.toLocaleString()} L`;
}

export default function UsageTab({ zones, usage, settings, onSave }) {
  // Local editable copies of the settings fields. Initialised from props once;
  // the inputs are cheap enough that we don't need to resync on prop change.
  const [flowRates, setFlowRates] = useState(() => {
    const init = {};
    for (const z of zones) init[z.id] = settings?.flowRates?.[z.id] ?? '';
    return init;
  });
  const [tariff, setTariff] = useState(settings?.tariffPerM3 ?? '');
  const [lat, setLat] = useState(settings?.location?.lat ?? '');
  const [lon, setLon] = useState(settings?.location?.lon ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  /** Fills the lat/lon fields from the browser's geolocation API. */
  function useMyLocation() {
    if (!navigator.geolocation) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(Math.round(pos.coords.latitude * 10000) / 10000);
        setLon(Math.round(pos.coords.longitude * 10000) / 10000);
        setGeoBusy(false);
      },
      () => setGeoBusy(false),
      { timeout: 10000 }
    );
  }

  async function handleSave() {
    setSaving(true);
    const cleanRates = {};
    for (const [id, v] of Object.entries(flowRates)) {
      if (v !== '' && Number(v) > 0) cleanRates[id] = Number(v);
    }
    await onSave({
      flowRates: cleanRates,
      tariffPerM3: tariff !== '' ? Number(tariff) : null,
      location: lat !== '' && lon !== '' ? { lat: Number(lat), lon: Number(lon) } : null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000); // brief "Saved" confirmation
  }

  const month = usage?.periods?.month;
  const week = usage?.periods?.week;
  const today = usage?.periods?.today;

  // Largest per-zone litres this month, for scaling the breakdown bars.
  const maxZoneLitres = month
    ? Math.max(1, ...Object.values(month.zones).map(z => z.litres))
    : 1;

  const inputCls = 'w-full h-10 bg-slate-900 border border-slate-600 text-gray-100 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

  return (
    <div className="space-y-4">

      {/* Setup prompt shown until flow rates + tariff are configured */}
      {usage && !usage.configured && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-start gap-3">
          <Gauge className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-cyan-200 leading-relaxed">
            Set your zone flow rates and water tariff below to start tracking
            what your sprinklers cost to run.
          </p>
        </div>
      )}

      {/* Headline cost cards */}
      {usage?.configured && (
        <>
          <div className="bg-gradient-to-br from-cyan-600/20 to-sky-700/20 border border-cyan-500/30 rounded-2xl p-5">
            <p className="text-xs text-cyan-300 font-medium uppercase tracking-wide mb-1">This month</p>
            <p className="text-3xl font-bold text-gray-100">{fmtCost(month?.cost)}</p>
            <p className="text-xs text-slate-400 mt-1">{fmtLitres(month?.litres)} of water</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[['Last 7 days', week], ['Today', today]].map(([label, p]) => (
              <div key={label} className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</p>
                <p className="text-lg font-bold text-gray-100">{fmtCost(p?.cost)}</p>
                <p className="text-[11px] text-slate-500">{fmtLitres(p?.litres)}</p>
              </div>
            ))}
          </div>

          {/* Per-zone breakdown for this month */}
          {month && Object.keys(month.zones).length > 0 && (
            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                This month by zone
              </p>
              <div className="space-y-3">
                {zones.map(z => {
                  const u = month.zones[z.id];
                  if (!u) return null;
                  return (
                    <div key={z.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-300 font-medium">{z.name}</span>
                        <span className="text-slate-500">{fmtLitres(u.litres)} · {fmtCost(u.cost)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-sky-500 rounded-full"
                          style={{ width: `${(u.litres / maxZoneLitres) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Cost settings */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Droplet className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-gray-200">Cost settings</h3>
        </div>

        <div className="space-y-3">
          {zones.map(z => (
            <div key={z.id} className="flex items-center gap-3">
              <label className="text-xs text-slate-400 w-20 flex-shrink-0">{z.name}</label>
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="e.g. 12"
                value={flowRates[z.id]}
                onChange={e => setFlowRates(r => ({ ...r, [z.id]: e.target.value }))}
                className={inputCls}
              />
              <span className="text-xs text-slate-500 flex-shrink-0">L/min</span>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-1">
            <label className="text-xs text-slate-400 w-20 flex-shrink-0">Tariff</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 2.20"
              value={tariff}
              onChange={e => setTariff(e.target.value)}
              className={inputCls}
            />
            <span className="text-xs text-slate-500 flex-shrink-0">£/m³</span>
          </div>
        </div>
      </div>

      {/* Home location — used by temperature-conditional schedules */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-gray-200">Home location</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Used to check the outdoor temperature for hot-day schedules.
        </p>

        <div className="flex gap-3 mb-3">
          <input
            type="number"
            step="0.0001"
            placeholder="Latitude"
            value={lat}
            onChange={e => setLat(e.target.value)}
            className={inputCls}
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Longitude"
            value={lon}
            onChange={e => setLon(e.target.value)}
            className={inputCls}
          />
        </div>
        <button
          onClick={useMyLocation}
          disabled={geoBusy}
          className="text-xs text-cyan-400 font-medium hover:underline disabled:opacity-50"
        >
          {geoBusy ? 'Locating…' : 'Use my current location'}
        </button>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
      >
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}
