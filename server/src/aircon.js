/**
 * aircon.js
 * Bosch Climate 3200i control via Matter (local LAN, no cloud).
 *
 * Runs a Matter controller (matter.js) inside the server process. The AC's
 * Connect Key dongle is a Matter device on the home WiFi; we commission it
 * once using a pairing code generated in the Bosch HomeCom Easy app, after
 * which the fabric credentials persist in server/data/matter/ and control is
 * fully local.
 *
 * Like gpio.js, this module supports a mock mode (MOCK_AIRCON=true or when
 * the controller fails to start) so the UI can be developed without the
 * device and the server never crashes because of Matter problems.
 *
 * Matter cluster usage:
 *   OnOff      — power (when the device exposes it; otherwise SystemMode=Off)
 *   Thermostat — localTemperature (room temp, °C×100), occupiedCooling/
 *                HeatingSetpoint (target, °C×100), systemMode (mode enum)
 *   FanControl — fanMode (Off/Low/Medium/High/On/Auto/Smart)
 */

const path = require('path');

const MOCK = process.env.MOCK_AIRCON === 'true';
const STORAGE_PATH = process.env.MATTER_STORAGE || path.join(__dirname, '../data/matter');

// ---- Matter state ----------------------------------------------------------
let controller = null;       // CommissioningController
let node = null;              // PairedNode (the AC)
let clusters = {};            // { onOff, thermostat, fanControl } cluster clients
let initError = null;         // last init/connect error message, surfaced in status
let initialized = false;

// ---- Mock state (dev without hardware) --------------------------------------
const mock = {
  commissioned: false,
  on: false,
  mode: 'cool',
  targetTemp: 21,
  roomTemp: 23.5,
  fanMode: 'auto',
};

// Matter Thermostat.SystemMode values <-> our mode strings
const MODE_TO_MATTER = { auto: 1, cool: 3, heat: 4, fan: 7, dry: 8 };
const MATTER_TO_MODE = { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 7: 'fan', 8: 'dry' };

// Matter FanControl.FanMode values <-> our fan strings
const FAN_TO_MATTER = { off: 0, low: 1, medium: 2, high: 3, on: 4, auto: 5 };
const MATTER_TO_FAN = { 0: 'off', 1: 'low', 2: 'medium', 3: 'high', 4: 'on', 5: 'auto', 6: 'auto' };

/**
 * Starts the Matter controller and reconnects to the AC if it was previously
 * commissioned. Called once at server startup (non-blocking — see index.js).
 * Failures put the module in an errored-but-alive state rather than throwing.
 */
async function init() {
  if (MOCK) {
    console.log('[Aircon] Mock mode — no Matter controller');
    initialized = true;
    return;
  }
  try {
    // Keep Matter fabric/session data alongside the SQLite db so it survives
    // restarts and is excluded from git (server/data/ is ignored).
    // matter.js's NodeJsEnvironment maps MATTER_* env vars to its config vars,
    // and these must be set before @matter/main is first required.
    process.env.MATTER_STORAGE_PATH = STORAGE_PATH;
    // matter.js logs at DEBUG by default, which would flood the Pi's journal.
    process.env.MATTER_LOG_LEVEL = process.env.MATTER_LOG_LEVEL || 'warn';

    const { Environment } = require('@matter/main');
    const { CommissioningController } = require('@project-chip/matter.js');

    const environment = Environment.default;

    controller = new CommissioningController({
      environment: { environment, id: 'home-automation-aircon' },
      autoConnect: false,
      adminFabricLabel: 'Home Control',
    });
    await controller.start();
    console.log(`[Aircon] Matter controller started (storage: ${STORAGE_PATH})`);

    if (controller.isCommissioned()) {
      await connectNode();
    }
    initialized = true;
    initError = null;
  } catch (err) {
    initError = err.message;
    console.error('[Aircon] Matter controller failed to start:', err.message);
  }
}

/** Connects to the commissioned AC node and locates its clusters. */
async function connectNode() {
  const nodeId = controller.getCommissionedNodes()[0];
  node = await controller.getNode(nodeId);
  if (!node.isConnected) node.connect();
  if (!node.initialized) await node.events.initialized;
  await findClusters();
  console.log(`[Aircon] Connected to node ${nodeId}`);
}

/**
 * Walks the device's endpoints and grabs cluster clients for OnOff,
 * Thermostat, and FanControl wherever they live (endpoint layout varies
 * between manufacturers).
 */
async function findClusters() {
  const { Thermostat, OnOff, FanControl } = require('@matter/main/clusters');
  clusters = {};
  for (const device of node.getDevices()) {
    if (!clusters.thermostat) clusters.thermostat = device.getClusterClient(Thermostat.Complete);
    if (!clusters.onOff) clusters.onOff = device.getClusterClient(OnOff.Complete);
    if (!clusters.fanControl) clusters.fanControl = device.getClusterClient(FanControl.Complete);
  }
  console.log('[Aircon] Clusters found:',
    Object.entries(clusters).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none');
}

/**
 * Commissions the AC using a manual pairing code from the HomeCom Easy app.
 * Discovery happens over mDNS on the LAN; takes ~10-30 seconds.
 */
async function commission(pairingCode) {
  if (MOCK) {
    mock.commissioned = true;
    return;
  }
  if (!controller) throw new Error(initError || 'Matter controller not running');

  const { ManualPairingCodeCodec } = require('@matter/main/types');
  const { GeneralCommissioning } = require('@matter/main/clusters');

  const { shortDiscriminator, passcode } = ManualPairingCodeCodec.decode(pairingCode.replace(/[\s-]/g, ''));
  const nodeId = await controller.commissionNode({
    commissioning: {
      regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
      regulatoryCountryCode: 'XX',
    },
    discovery: {
      identifierData: { shortDiscriminator },
      discoveryCapabilities: { onIpNetwork: true },
    },
    passcode,
  });
  console.log(`[Aircon] Commissioned node ${nodeId}`);
  await connectNode();
}

/** Removes the AC from our fabric (it stays paired to HomeCom/others). */
async function decommission() {
  if (MOCK) {
    mock.commissioned = false;
    return;
  }
  if (!node) throw new Error('No commissioned device');
  await node.decommission();
  node = null;
  clusters = {};
}

/** Safe attribute read returning undefined instead of throwing. */
async function readAttr(fn) {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/**
 * Current state of the AC. All reads resolve from the local subscription
 * cache (connect() auto-subscribes), so this is fast and works offline-ish.
 */
async function getStatus() {
  if (MOCK) {
    return {
      available: true, commissioned: mock.commissioned, online: mock.commissioned,
      on: mock.on, mode: mock.mode, targetTemp: mock.targetTemp,
      roomTemp: mock.roomTemp, fanMode: mock.fanMode, error: null, mock: true,
    };
  }

  const commissioned = Boolean(controller?.isCommissioned());
  const online = Boolean(node?.isConnected);
  const base = {
    available: initialized && !initError, commissioned, online,
    on: null, mode: null, targetTemp: null, roomTemp: null, fanMode: null,
    error: initError, mock: false,
  };
  if (!commissioned || !online || !clusters.thermostat) return base;

  const t = clusters.thermostat;
  const sysMode = await readAttr(() => t.getSystemModeAttribute());
  const roomRaw = await readAttr(() => t.getLocalTemperatureAttribute());
  const coolRaw = await readAttr(() => t.getOccupiedCoolingSetpointAttribute());
  const heatRaw = await readAttr(() => t.getOccupiedHeatingSetpointAttribute());

  const mode = MATTER_TO_MODE[sysMode] ?? null;
  // Pick the setpoint that matches the active mode; default to cooling.
  const targetRaw = mode === 'heat' ? heatRaw : (coolRaw ?? heatRaw);

  let on = mode !== 'off' && mode !== null;
  if (clusters.onOff) {
    const onOffVal = await readAttr(() => clusters.onOff.getOnOffAttribute());
    if (onOffVal !== undefined) on = onOffVal;
  }

  let fanMode = null;
  if (clusters.fanControl) {
    const f = await readAttr(() => clusters.fanControl.getFanModeAttribute());
    fanMode = MATTER_TO_FAN[f] ?? null;
  }

  return {
    ...base, on,
    mode: on ? (mode === 'off' ? null : mode) : mode,
    targetTemp: targetRaw != null ? targetRaw / 100 : null,
    roomTemp: roomRaw != null ? roomRaw / 100 : null,
    fanMode,
  };
}

/** Powers the unit on/off via OnOff cluster, falling back to SystemMode. */
async function setPower(on) {
  if (MOCK) { mock.on = on; return; }
  if (clusters.onOff) {
    await (on ? clusters.onOff.on() : clusters.onOff.off());
  } else if (clusters.thermostat) {
    await clusters.thermostat.setSystemModeAttribute(on ? MODE_TO_MATTER.auto : 0);
  } else {
    throw new Error('Device not connected');
  }
}

/** Sets the operating mode: auto | cool | heat | dry | fan. */
async function setMode(mode) {
  if (!(mode in MODE_TO_MATTER)) throw new Error(`Unknown mode: ${mode}`);
  if (MOCK) { mock.mode = mode; mock.on = true; return; }
  if (!clusters.thermostat) throw new Error('Device not connected');
  await clusters.thermostat.setSystemModeAttribute(MODE_TO_MATTER[mode]);
}

/** Sets the target temperature in °C (written to the relevant setpoints). */
async function setTargetTemp(celsius) {
  if (MOCK) { mock.targetTemp = celsius; return; }
  if (!clusters.thermostat) throw new Error('Device not connected');
  const raw = Math.round(celsius * 100);
  const mode = await readAttr(() => clusters.thermostat.getSystemModeAttribute());
  // Write the setpoint that matters for the current mode; in auto write both.
  if (mode === MODE_TO_MATTER.heat) {
    await clusters.thermostat.setOccupiedHeatingSetpointAttribute(raw);
  } else if (mode === MODE_TO_MATTER.auto) {
    await readAttr(() => clusters.thermostat.setOccupiedCoolingSetpointAttribute(raw));
    await readAttr(() => clusters.thermostat.setOccupiedHeatingSetpointAttribute(raw));
  } else {
    await clusters.thermostat.setOccupiedCoolingSetpointAttribute(raw);
  }
}

/** Sets fan speed: auto | low | medium | high. */
async function setFanMode(fan) {
  if (!(fan in FAN_TO_MATTER)) throw new Error(`Unknown fan mode: ${fan}`);
  if (MOCK) { mock.fanMode = fan; return; }
  if (!clusters.fanControl) throw new Error('Fan control not available');
  await clusters.fanControl.setFanModeAttribute(FAN_TO_MATTER[fan]);
}

module.exports = { init, commission, decommission, getStatus, setPower, setMode, setTargetTemp, setFanMode };
