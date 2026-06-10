/**
 * App.jsx
 * Root component of the home automation hub.
 *
 * Owns:
 *   - Navigation: view state 'home' | 'sprinklers' | 'aircon' | 'ufh'.
 *     Each view is wrapped in a keyed div so the .screen-enter CSS animation
 *     replays on every navigation.
 *   - All sprinkler data fetching + polling (zones, schedules, log, rain delay)
 *     so the landing tile can show live status without entering the module.
 *
 * The Sprinklers module receives data + mutation handlers as props; Aircon and
 * Underfloor Heating render the shared ComingSoon placeholder until their
 * (non-GPIO) integrations are built.
 */

import React, { useState, useEffect, useCallback } from 'react';
import HomeScreen from './components/HomeScreen';
import Sprinklers from './modules/Sprinklers';
import ComingSoon from './modules/ComingSoon';
import { Snowflake, Flame } from './components/Icons';
import {
  fetchZones, fetchSchedules, fetchLog, fetchStatus,
  createSchedule, updateSchedule, toggleSchedule, deleteSchedule,
  runAllZones, stopAllZones, setRainDelay, cancelRainDelay,
} from './api';

export default function App() {
  const [view, setView] = useState('home');
  const [zones, setZones] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [log, setLog] = useState([]);
  const [rainDelayUntil, setRainDelayUntil] = useState(null);

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
    // Poll zones + status every 10s so scheduled runs and rain delay expiry
    // appear on the landing tile and module screens without a refresh.
    const id = setInterval(() => { loadZones(); loadStatus(); }, 10000);
    return () => clearInterval(id);
  }, []);

  /** Replace one zone in state after an on/off API call. */
  function updateZone(updated) {
    setZones(zs => zs.map(z => z.id === updated.id ? updated : z));
  }

  async function handleSaveSchedule(form) {
    if (form.id) await updateSchedule(form.id, form);
    else await createSchedule(form);
    loadSchedules();
  }

  async function handleToggleSchedule(id) {
    await toggleSchedule(id);
    loadSchedules();
  }

  async function handleDeleteSchedule(id) {
    if (!confirm('Delete this schedule?')) return;
    await deleteSchedule(id);
    loadSchedules();
  }

  async function handleRunAll(duration) {
    setZones(await runAllZones(duration));
  }

  async function handleStopAll() {
    setZones(await stopAllZones());
  }

  async function handleRainDelay(hours) {
    const s = await setRainDelay(hours);
    setRainDelayUntil(s.rainDelayUntil);
  }

  async function handleCancelRain() {
    await cancelRainDelay();
    setRainDelayUntil(null);
  }

  return (
    <div className="min-h-screen text-gray-100">
      {/* key={view} remounts the wrapper on navigation so the enter animation replays */}
      <div key={view} className="screen-enter">

        {view === 'home' && (
          <HomeScreen
            zones={zones}
            schedules={schedules}
            rainDelayUntil={rainDelayUntil}
            onOpen={setView}
          />
        )}

        {view === 'sprinklers' && (
          <Sprinklers
            zones={zones}
            schedules={schedules}
            log={log}
            rainDelayUntil={rainDelayUntil}
            onUpdateZone={updateZone}
            onSaveSchedule={handleSaveSchedule}
            onToggleSchedule={handleToggleSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            onRunAll={handleRunAll}
            onStopAll={handleStopAll}
            onRainDelay={handleRainDelay}
            onCancelRain={handleCancelRain}
            onRefreshLog={loadLog}
            onBack={() => setView('home')}
          />
        )}

        {view === 'aircon' && (
          <ComingSoon
            title="Air Conditioning"
            description="Climate control for the whole house — set temperatures, modes, and schedules once the AC integration is connected."
            icon={<Snowflake className="w-10 h-10" />}
            accent="blue"
            onBack={() => setView('home')}
          />
        )}

        {view === 'ufh' && (
          <ComingSoon
            title="Underfloor Heating"
            description="Warm floors on demand — room-by-room temperature control and heating schedules once the UFH integration is connected."
            icon={<Flame className="w-10 h-10" />}
            accent="amber"
            onBack={() => setView('home')}
          />
        )}
      </div>
    </div>
  );
}
