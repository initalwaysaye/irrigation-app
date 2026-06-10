/**
 * index.js
 * Entry point for the irrigation server.
 *
 * Responsibilities:
 *   1. Create and configure the Express HTTP server
 *   2. Mount the API route handlers
 *   3. Serve the pre-built React frontend as static files (production)
 *   4. Initialise GPIO hardware
 *   5. Load and activate all scheduled watering jobs
 *   6. Handle graceful shutdown (turn off all valves before exiting)
 *
 * In development, run this alongside the Vite dev server (npm run dev).
 * In production, build the React app first (npm run build), then start
 * this server — it will serve the static files from client/dist/ as well
 * as handling all /api/ requests.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const gpio = require('./gpio');
const scheduler = require('./scheduler');

// Importing db.js triggers the database initialisation (table creation and
// cleanup of open log entries). The require cache means this only runs once.
require('./db');

const app = express();

// Allow cross-origin requests — needed in development where the Vite dev
// server (port 5173) makes API calls to Express (port 3000).
app.use(cors());

// Parse incoming JSON request bodies so route handlers can access req.body.
app.use(express.json());

// Mount the API route handlers. All irrigation control logic lives here.
app.use('/api/zones', require('./routes/zones'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/system', require('./routes/system'));

// Serve the compiled React app for any non-API request.
// express.static serves files from client/dist/ (index.html, JS bundles, CSS).
// The catch-all GET handler below it ensures client-side routing works correctly —
// if someone navigates directly to a URL, the server returns index.html and
// React handles the routing in the browser.
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

// Initialise GPIO pins — sets all relay pins as outputs and drives them LOW/HIGH
// to ensure all valves are closed before any user interaction occurs.
gpio.init();

// Load all enabled schedules from the database and start their cron jobs.
scheduler.load();

const server = app.listen(config.port, () =>
  console.log(`Irrigation server running on http://localhost:${config.port}`)
);

/**
 * Graceful shutdown handler.
 * Called when the process receives SIGTERM (e.g. systemd stopping the service)
 * or SIGINT (Ctrl+C in the terminal).
 *
 * Closes the HTTP server (stops accepting new requests), then calls gpio.cleanup()
 * which drives all relay pins back to the "off" state before the process exits.
 * This ensures valves don't stay open if the server is restarted.
 */
function shutdown() {
  console.log('Shutting down — closing all valves');
  server.close();
  gpio.cleanup();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
