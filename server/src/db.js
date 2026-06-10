/**
 * db.js
 * Sets up the SQLite database using the better-sqlite3 library.
 * better-sqlite3 is synchronous (unlike most Node DB libraries) which keeps
 * the code simple and avoids async/await complexity for database calls.
 *
 * This module is required once at startup (from index.js). Node caches modules
 * so subsequent requires elsewhere get the same already-initialised db instance.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure the directory that will hold the .db file actually exists.
// fs.mkdirSync with { recursive: true } won't error if it already exists.
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Open (or create) the SQLite database file.
const db = new Database(config.dbPath);

// Create tables if they don't already exist.
// Using IF NOT EXISTS means this is safe to run on every startup.
db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id          INTEGER NOT NULL,         -- which zone (1, 2, or 3)
    name             TEXT    NOT NULL,         -- human-readable label, e.g. "Morning front lawn"
    days             TEXT    NOT NULL DEFAULT '[]',  -- JSON array of day numbers: 0=Sun, 1=Mon ... 6=Sat. Empty = every day.
    start_time       TEXT    NOT NULL,         -- 24h time string "HH:MM"
    duration_minutes INTEGER NOT NULL DEFAULT 10,
    enabled          INTEGER NOT NULL DEFAULT 1,     -- 1 = active, 0 = paused (SQLite has no boolean type)
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    last_run_at      TEXT                      -- NULL until the schedule has fired at least once
  );

  CREATE TABLE IF NOT EXISTS run_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id          INTEGER NOT NULL,
    started_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    ended_at         TEXT,                     -- NULL while the zone is still running
    duration_minutes INTEGER,                  -- NULL for indefinite manual runs
    trigger          TEXT    NOT NULL DEFAULT 'manual'  -- 'manual', 'schedule', or 'run-all'
  );

  -- Simple key/value store for app-wide settings (e.g. rain delay).
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Convenience helpers for the settings key/value table, attached to the db
// instance so callers don't need a separate import.
db.getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};
db.setSetting = (key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
db.deleteSetting = (key) => db.prepare('DELETE FROM settings WHERE key = ?').run(key);

// If the server was killed mid-run (crash, power loss, etc.) there may be
// run_log rows with no ended_at. Close them out now so the log stays clean.
// The zones themselves are reset to off by state.js on startup.
db.prepare("UPDATE run_log SET ended_at = datetime('now') WHERE ended_at IS NULL").run();

// Export the db instance so routes and other modules can import and query it directly.
module.exports = db;
