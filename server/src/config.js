/**
 * config.js
 * Central configuration for the irrigation server.
 * All values can be overridden via environment variables in a .env file,
 * so you can change pin numbers or relay behaviour without touching code.
 */

module.exports = {
  // Port the Express HTTP server listens on.
  // Default 3000 — access the app at http://<pi-ip>:3000
  port: process.env.PORT || 3000,

  // Controls how the relay board interprets HIGH/LOW signals from the Pi.
  // Most cheap relay boards are "active-LOW": pulling the pin LOW closes the relay (turns zone ON).
  // Set RELAY_ACTIVE_HIGH=true in .env if your board works the opposite way.
  activeHigh: process.env.RELAY_ACTIVE_HIGH === 'true',

  // One entry per irrigation zone.
  // 'pin' is the BCM GPIO pin number (not the physical pin number on the header).
  // Default pins 17, 27, 22 correspond to physical pins 11, 13, 15 — a convenient
  // cluster on the Pi header. Override with ZONE1_PIN etc. in .env.
  zones: [
    { id: 1, name: 'Zone 1', pin: parseInt(process.env.ZONE1_PIN || '17') },
    { id: 2, name: 'Zone 2', pin: parseInt(process.env.ZONE2_PIN || '27') },
    { id: 3, name: 'Zone 3', pin: parseInt(process.env.ZONE3_PIN || '22') },
  ],

  // Path to the SQLite database file.
  // Stored inside the server/data/ directory by default, which is git-ignored.
  dbPath: process.env.DB_PATH || './data/irrigation.db',
};
