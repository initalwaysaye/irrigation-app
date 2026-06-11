/**
 * routes/ufh.js
 * REST API for the underfloor heating module (Heatmiser NeoHub/NeoStats).
 *
 * Mounted at /api/ufh in index.js.
 *
 * Endpoints:
 *   GET    /api/ufh/status     — { configured, online, rooms: [...] }
 *   POST   /api/ufh/setup      — { host, token? } tests the connection, saves on success
 *   DELETE /api/ufh/setup      — forget the hub
 *   POST   /api/ufh/room/temp  — { room, target } set a room's target temperature
 */

const express = require('express');
const router = express.Router();
const neohub = require('../neohub');

router.get('/status', async (req, res) => {
  res.json(await neohub.getStatus());
});

// Tests against the live hub before saving, so a typo'd IP or bad token comes
// back as a 400 with the underlying error rather than half-configured state.
router.post('/setup', async (req, res) => {
  const { host, token } = req.body;
  if (!host) return res.status(400).json({ error: 'host is required' });
  try {
    await neohub.testAndSave({ host: String(host).trim(), token: token ? String(token).trim() : null });
    res.json(await neohub.getStatus());
  } catch (err) {
    res.status(400).json({ error: `Could not connect to NeoHub: ${err.message}` });
  }
});

router.delete('/setup', async (req, res) => {
  neohub.clearConfig();
  res.json(await neohub.getStatus());
});

router.post('/room/temp', async (req, res) => {
  const { room, target } = req.body;
  const temp = Number(target);
  // NeoStats accept 5-35°C (their own min/max limits)
  if (!room || !temp || temp < 5 || temp > 35) {
    return res.status(400).json({ error: 'room and target (5-35°C) are required' });
  }
  try {
    await neohub.setTarget(room, temp);
    res.json(await neohub.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
