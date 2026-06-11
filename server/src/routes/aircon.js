/**
 * routes/aircon.js
 * REST API for the Bosch Climate 3200i (Matter-controlled).
 *
 * Mounted at /api/aircon in index.js.
 *
 * Endpoints:
 *   GET    /api/aircon/status      — full device state (or commissioned:false)
 *   POST   /api/aircon/commission  — pair using a HomeCom-generated code
 *   DELETE /api/aircon/commission  — unpair from our controller
 *   POST   /api/aircon/power       — { on: true|false }
 *   POST   /api/aircon/mode        — { mode: auto|cool|heat|dry|fan }
 *   POST   /api/aircon/temp        — { target: °C }
 *   POST   /api/aircon/fan         — { mode: auto|low|medium|high }
 *
 * Mutating endpoints respond with the refreshed status so the UI can update
 * in one round trip.
 */

const express = require('express');
const router = express.Router();
const aircon = require('../aircon');

/** Wraps an async action: run it, then return fresh status (or a 500). */
function act(fn) {
  return async (req, res) => {
    try {
      await fn(req);
      res.json(await aircon.getStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

router.get('/status', async (req, res) => {
  try {
    res.json(await aircon.getStatus());
  } catch (err) {
    // Never let a status read crash the process (async route errors are
    // fatal in Express 4 otherwise).
    res.status(500).json({ error: err.message });
  }
});

// Commissioning can take 10-30s while the device is discovered over mDNS.
router.post('/commission', act(async (req) => {
  const code = req.body.pairingCode;
  if (!code) throw new Error('pairingCode is required');
  await aircon.commission(String(code));
}));

router.delete('/commission', act(() => aircon.decommission()));

router.post('/power', act((req) => aircon.setPower(Boolean(req.body.on))));

router.post('/mode', act((req) => aircon.setMode(req.body.mode)));

router.post('/temp', act((req) => {
  const target = Number(req.body.target);
  if (!target || target < 10 || target > 35) throw new Error('target must be 10-35°C');
  return aircon.setTargetTemp(target);
}));

router.post('/fan', act((req) => aircon.setFanMode(req.body.mode)));

module.exports = router;
