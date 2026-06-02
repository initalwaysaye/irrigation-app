What was built

  A full-stack web app that runs on your Raspberry Pi and lets you control 3 irrigation zones from any browser on your network. Here's how all the pieces fit together.

  ---
  Overall architecture

  Browser (phone/laptop)
        ↕  HTTP
    React frontend  ←── served by Express in production
        ↕  REST API (/api/...)
    Express backend
        ↕               ↕              ↕
    SQLite DB       GPIO pins      node-cron
    (schedules,     (relay board)  (scheduled runs)
     run log)

  In development you run two servers (Vite on :5173 proxies API calls to Express on :3000). In production Express serves the pre-built React files directly, so it's a single process on a single port.

  ---
  Server side

  config.js — single source of truth for GPIO pin assignments, relay polarity, and zone names. Everything reads from here, and values can be overridden via environment variables in .env so you never need to touch code to change a pin number.

  gpio.js — thin wrapper around the onoff npm package. On startup it checks /proc/cpuinfo to detect whether it's actually running on a Pi. If not (or if MOCK_GPIO=true), it falls back to a mock that just logs to the console — this means you can
  develop and test the whole app on your laptop without any hardware. When real GPIO is active it writes the correct HIGH/LOW value to each pin accounting for whether the relay board is active-high or active-low.

  db.js — sets up a SQLite database using better-sqlite3. It creates two tables:
  - schedules — stores each recurring schedule (zone, days, time, duration, enabled flag)
  - run_log — records every watering event with start/end times and whether it was triggered manually or by a schedule

  It also runs a cleanup query on every startup to close any log entries that were left open if the server crashed mid-run.

  state.js — holds the live in-memory state of all three zones (is it on right now, when will it auto-off). This is kept separate from the database because it changes constantly and doesn't need to be persisted — on startup all zones are assumed
  off and GPIO is set accordingly.

  scheduler.js — this is where recurring schedules come to life. It:
  1. Reads all enabled schedules from the DB
  2. Converts each one's days-of-week + time into a cron expression (e.g. Mon/Wed/Fri at 06:00 → 0 6 * * 1,3,5, every day at 07:30 → 30 7 * * *)
  3. Creates a node-cron job for each one
  4. When a job fires it calls runZone() which turns the GPIO pin on, sets a setTimeout for the duration, and turns it off when that fires

  Any time you create, edit, or delete a schedule via the API, the scheduler tears down all existing cron jobs and rebuilds from the database — simple and reliable.

  The runZone() function is shared between the scheduler and the manual "Run" button. It handles cancelling any existing timer on a zone before starting a new one (so if zone 1 has 8 minutes left and you hit Run again with 15 minutes, it cancels
  the old timer and starts fresh).

  Routes — /api/zones:
  - GET / — returns current state of all 3 zones (name, isOn, autoOffAt)
  - POST /:id/on — turns a zone on. If you pass { duration: 10 } in the body it delegates to runZone() for timed auto-off; if no duration it stays on indefinitely until you hit Stop
  - POST /:id/off — immediately turns off a zone and cancels any pending auto-off timer
  - GET /log — last 100 run events from the database

  Routes — /api/schedules:
  Standard CRUD. Create, read, update, delete schedules. There's also a PATCH /:id/toggle endpoint that just flips the enabled flag, used by the toggle switch in the UI. Every mutating operation reloads the scheduler.

  ---
  Client side

  api.js — all the fetch() calls in one place. Every function maps to one API endpoint. Components import only what they need and never construct URLs themselves.

  App.jsx — top-level component. Owns all the data: the zones array and schedules array both live here as state. It polls the zones endpoint every 10 seconds so the UI stays current (important if a scheduled run starts or auto-off fires while
  you're looking at the page). It also manages which tab is active and whether the schedule modal is open.

  ZoneCard.jsx — one card per zone. Shows the zone name, current ON/OFF status, and a dropdown to pick how many minutes to run. The "Run" button calls the API and immediately updates the displayed zone state with what the server returns. There's a
  countdown hook that ticks every 15 seconds to show how many minutes are left on a timed run — it calculates this from the autoOffAt timestamp the server provides rather than maintaining its own timer, so it stays accurate even if you reload the
  page.

  ScheduleModal.jsx — handles both creating new schedules and editing existing ones (same form, same component, determined by whether a schedule prop is passed in). Day-of-week selection is a row of toggle buttons (Sun through Sat), leaving all
  unselected means "every day". On submit it just calls onSave with the form data and the parent decides whether to POST or PUT.

  ---
  Data flow for a typical interaction

  Manual run (10 minutes):
  1. You tap "Run" on Zone 2
  2. ZoneCard calls POST /api/zones/2/on with { duration: 10 }
  3. Server calls runZone(2, 10, 'manual')
  4. GPIO pin 27 goes LOW (relay closes, valve opens)
  5. A setTimeout for 10 minutes is registered
  6. A row is inserted into run_log
  7. Server responds with { id: 2, isOn: true, autoOffAt: "2026-06-01T07:10:00Z" }
  8. UI updates immediately; countdown appears
  9. 10 minutes later the timeout fires, GPIO pin goes HIGH (valve closes), log entry gets an ended_at timestamp

  Scheduled run:
  1. node-cron fires at the scheduled time
  2. Same runZone() function runs, same GPIO/timer/log flow
  3. Next time the browser polls (within 10 seconds) it sees the zone is on

  Adding a schedule:
  1. You tap "+ Add schedule", fill in Zone 1, Mon/Wed/Fri, 06:00, 15 min
  2. POST /api/schedules with { zone_id: 1, days: [1,3,5], start_time: "06:00", duration_minutes: 15 }
  3. Server inserts into DB, calls scheduler.load() which builds cron expression 15 6 * * 1,3,5 and registers the job
  4. Every Monday, Wednesday, and Friday at 6:00 AM the job fires
