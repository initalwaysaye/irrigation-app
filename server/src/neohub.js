/**
 * neohub.js
 * Heatmiser NeoHub client for the underfloor heating module — local API only.
 *
 * Two transports (same JSON commands on both):
 *   - WebSocket, port 4243 (Gen 2 hubs): TLS with a self-signed cert, every
 *     frame wraps the command with an API token generated in the neoApp:
 *       { message_type: "hm_get_command_queue",
 *         message: '{"token":"…","COMMANDS":[{"COMMAND":"{…}","COMMANDID":n}]}' }
 *     Replies arrive as { message_type:"hm_set_command_response", command_id,
 *     response } where response is the inner JSON (often as a string).
 *   - Legacy TCP, port 4242 (older hubs / legacy toggle): plain socket, JSON
 *     command terminated by "\0\r", reply terminated by "\0". Used when no
 *     token is configured.
 *
 * Hub config { host, token } lives in the app_settings JSON (settings table),
 * saved from the UFH setup screen. Live data is cached for 10s so UI polling
 * doesn't hammer the hub. MOCK_UFH=true serves three fake rooms for dev.
 */

const tls = require('tls');
const net = require('net');
const db = require('./db');

const MOCK = process.env.MOCK_UFH === 'true';
const CACHE_TTL_MS = 10 * 1000;
const COMMAND_TIMEOUT_MS = 15 * 1000;

// ---- Mock rooms (dev without hardware) --------------------------------------
const mockRooms = [
  { name: 'Lounge',   currentTemp: 20.5, targetTemp: 21, heating: true,  offline: false },
  { name: 'Kitchen',  currentTemp: 19.8, targetTemp: 19, heating: false, offline: false },
  { name: 'Bathroom', currentTemp: 22.1, targetTemp: 23, heating: true,  offline: false },
];
let mockConfigured = false;

// ---- WebSocket connection state ---------------------------------------------
let socket = null;          // active TLS socket (we speak raw websocket below via 'ws')
let wsClient = null;        // ws WebSocket instance
let pending = new Map();    // commandId -> { resolve, reject, timer }
let nextCommandId = 1;
let cache = { data: null, at: 0 };
let lastError = null;

/** Reads the hub config from settings, or null when not set up yet. */
function getConfig() {
  try {
    const settings = JSON.parse(db.getSetting('app_settings') || '{}');
    const cfg = settings.neohub;
    if (cfg && cfg.host) return cfg;
  } catch { /* malformed settings */ }
  return null;
}

/** Tears down the websocket so the next command reconnects fresh. */
function resetSocket() {
  if (wsClient) {
    try { wsClient.close(); } catch { /* already closed */ }
    wsClient = null;
  }
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error('Connection reset'));
  }
  pending.clear();
}

/** Opens (or reuses) the websocket connection to the hub. */
function ensureWebSocket(cfg) {
  return new Promise((resolve, reject) => {
    if (wsClient && wsClient.readyState === 1) return resolve(wsClient);
    resetSocket();

    const WebSocket = require('ws');
    const client = new WebSocket(`wss://${cfg.host}:4243`, {
      rejectUnauthorized: false, // hub uses a self-signed certificate
      handshakeTimeout: 10000,
    });

    client.on('open', () => { wsClient = client; resolve(client); });

    client.on('message', (raw) => {
      try {
        const frame = JSON.parse(raw.toString());
        const entry = pending.get(frame.command_id);
        if (!entry) return;
        pending.delete(frame.command_id);
        clearTimeout(entry.timer);
        if (frame.message_type !== 'hm_set_command_response') {
          return entry.reject(new Error(`Unexpected message_type: ${frame.message_type}`));
        }
        // The inner response is usually a JSON string; sometimes an object.
        const r = frame.response;
        entry.resolve(typeof r === 'string' ? JSON.parse(r) : r);
      } catch (err) {
        console.warn('[NeoHub] Bad frame:', err.message);
      }
    });

    client.on('error', (err) => {
      lastError = err.message;
      if (wsClient !== client) reject(err); // connection-phase failure
      resetSocket();
    });
    client.on('close', () => { if (wsClient === client) resetSocket(); });
  });
}

/** Sends one command over the websocket and resolves with the parsed reply. */
async function sendWs(cfg, command) {
  const client = await ensureWebSocket(cfg);
  const commandId = nextCommandId++;
  const frame = JSON.stringify({
    message_type: 'hm_get_command_queue',
    message: JSON.stringify({
      token: cfg.token,
      COMMANDS: [{ COMMAND: JSON.stringify(command), COMMANDID: commandId }],
    }),
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(commandId);
      reject(new Error('NeoHub command timed out'));
    }, COMMAND_TIMEOUT_MS);
    pending.set(commandId, { resolve, reject, timer });
    client.send(frame, (err) => {
      if (err) {
        pending.delete(commandId);
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

/**
 * Sends one command over the legacy TCP API (port 4242, no token).
 * One short-lived connection per command — fine at our polling rate.
 */
function sendLegacy(cfg, command) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: cfg.host, port: 4242, timeout: 10000 });
    let buf = '';
    sock.on('connect', () => sock.write(JSON.stringify(command) + '\0\r'));
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      const end = buf.indexOf('\0');
      if (end !== -1) {
        sock.destroy();
        try { resolve(JSON.parse(buf.slice(0, end))); }
        catch (err) { reject(err); }
      }
    });
    sock.on('timeout', () => { sock.destroy(); reject(new Error('NeoHub connection timed out')); });
    sock.on('error', reject);
  });
}

/** Sends a command using whichever transport the config calls for. */
function send(cfg, command) {
  return cfg.token ? sendWs(cfg, command) : sendLegacy(cfg, command);
}

/**
 * Maps a GET_LIVE_DATA reply to our room shape, keeping only thermostat-like
 * devices (NeoStats report ACTUAL_TEMP + SET_TEMP; timeclocks/plugs don't).
 */
function mapRooms(live) {
  const devices = live?.devices ?? [];
  return devices
    .filter(d => d.ACTUAL_TEMP !== undefined && d.SET_TEMP !== undefined && !d.TIMECLOCK)
    .map(d => ({
      name: d.ZONE_NAME ?? d.device ?? 'Unknown',
      currentTemp: parseFloat(d.ACTUAL_TEMP),
      targetTemp: parseFloat(d.SET_TEMP),
      heating: Boolean(d.HEAT_ON),
      standby: Boolean(d.STANDBY),
      offline: Boolean(d.OFFLINE),
    }));
}

/** Fetches live data, serving from a 10s cache unless force is set. */
async function getLiveData(cfg, force = false) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const live = await send(cfg, { GET_LIVE_DATA: 0 });
  cache = { data: live, at: Date.now() };
  lastError = null;
  return live;
}

/** Current status for the API: configured/online flags plus the room list. */
async function getStatus() {
  if (MOCK) {
    return { configured: mockConfigured, online: mockConfigured, rooms: mockConfigured ? mockRooms : [], error: null, mock: true };
  }
  const cfg = getConfig();
  if (!cfg) return { configured: false, online: false, rooms: [], error: null, mock: false };
  try {
    const live = await getLiveData(cfg);
    return { configured: true, online: true, rooms: mapRooms(live), error: null, mock: false };
  } catch (err) {
    lastError = err.message;
    return { configured: true, online: false, rooms: [], error: err.message, mock: false };
  }
}

/** Sets a room's target temperature (°C). */
async function setTarget(room, temp) {
  if (MOCK) {
    const r = mockRooms.find(x => x.name === room);
    if (!r) throw new Error(`Unknown room: ${room}`);
    r.targetTemp = temp;
    r.heating = temp > r.currentTemp;
    return;
  }
  const cfg = getConfig();
  if (!cfg) throw new Error('NeoHub not configured');
  await send(cfg, { SET_TEMP: [temp, room] });
  cache = { data: null, at: 0 }; // next status fetch sees the new target
}

/**
 * Tests a candidate config against the hub and saves it on success.
 * Returns the discovered rooms so the UI can confirm what it found.
 */
async function testAndSave({ host, token }) {
  if (MOCK) { mockConfigured = true; return mockRooms; }
  const cfg = { host, token: token || null };
  resetSocket();
  const live = await send(cfg, { GET_LIVE_DATA: 0 }); // throws if unreachable/bad token
  const rooms = mapRooms(live);

  const settings = JSON.parse(db.getSetting('app_settings') || '{}');
  settings.neohub = cfg;
  db.setSetting('app_settings', JSON.stringify(settings));
  cache = { data: live, at: Date.now() };
  return rooms;
}

/** Removes the hub config and drops the connection. */
function clearConfig() {
  if (MOCK) { mockConfigured = false; return; }
  const settings = JSON.parse(db.getSetting('app_settings') || '{}');
  delete settings.neohub;
  db.setSetting('app_settings', JSON.stringify(settings));
  resetSocket();
  cache = { data: null, at: 0 };
}

module.exports = { getStatus, setTarget, testAndSave, clearConfig };
