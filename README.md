# Home Automation Hub

A self-hosted home automation app that runs on a Raspberry Pi. Dark, mobile-first
web UI served on the local network — no cloud accounts, no subscriptions.

## Modules

| Module | Status | How it works |
|---|---|---|
| **Sprinklers** | Live | 3 irrigation zones via GPIO relay board (active-LOW, BCM pins 17/27/22) |
| **Air Conditioning** | Live | Bosch Climate 3200i controlled locally over **Matter** (matter.js controller) |
| **Underfloor Heating** | Planned | Placeholder screen |

### Sprinklers
- Manual control per zone with timed auto-off and live countdown
- Weekly schedules (per-zone, day-of-week, start time, duration)
- **Hot-day schedules**: only run when the outdoor temperature is at/above a
  threshold (default 25°C) — checked at fire time via the free Open-Meteo API
- **Rain delay**: pause all schedules for 24/48/72h (manual runs still work)
- "Water all zones" sequential run + emergency stop-everything
- **Cost tracking**: per-zone flow rates (L/min) + water tariff (£/m³) produce
  usage dashboards (today / 7 days / month, per-zone breakdown) and per-run
  cost estimates in the history log
- Watering history grouped by day

### Air conditioning (Bosch Climate 3200i)
- Paired over Matter using a pairing code from the Bosch HomeCom Easy app —
  control is fully local after that (the AC stays connected to HomeCom too)
- Power, mode (auto/cool/heat/dry/fan), target temperature, fan speed, room temp
- Note: the HomeCom *cloud* API was a dead end — it doesn't support
  Midea-based units like the 3200i; Matter is the supported path

## Architecture

```
Browser (phone/laptop)
      ↕  HTTP
React + Vite + Tailwind frontend  ←── served by Express in production
      ↕  REST API (/api/...)
Express backend (Node 20)
   ↕            ↕            ↕              ↕
SQLite      GPIO (rpio)  node-cron     matter.js controller
(schedules,  relay board  (schedules,   (Bosch AC over LAN)
 run log,                  rain delay,
 settings)                 temp checks)
```

- **Dev**: `npm run dev` → Vite on :5173 proxying API calls to Express on :3000.
  `MOCK_GPIO=true` and `MOCK_AIRCON=true` simulate the hardware.
- **Prod**: Express serves the built frontend from `client/dist` on :3000.

## Setting up a fresh Raspberry Pi

> Works on Pi 1–5 with Raspberry Pi OS. The GPIO layer auto-selects its
> backend: `rpio` (memory-mapped) on Pi 1–4, the official `pinctrl` tool on
> Pi 5 (whose RP1 GPIO chip rpio can't address).

```bash
git clone https://github.com/initalwaysaye/home-automation.git ~/home-automation
cd ~/home-automation
./setup-pi.sh
sudo reboot   # first time only — applies gpio group + boot-time GPIO config
```

The script is idempotent and handles Node 20, native module builds, the
`.env` file, boot-safe relay state, the gpio group, the systemd service
(`home-automation.service`, auto-start + auto-restart), and a client build
if `client/dist` wasn't pre-built and copied over.

Then open `http://<pi-ip>:3000`.

### Configuration (`server/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `ZONE1_PIN`/`ZONE2_PIN`/`ZONE3_PIN` | 17/27/22 | BCM GPIO pins for the relays |
| `RELAY_ACTIVE_HIGH` | false | Set true if your relay board switches on HIGH |
| `MOCK_GPIO` / `MOCK_AIRCON` | false | Simulate hardware (dev) |
| `DB_PATH` | ./data/irrigation.db | SQLite location |
| `MATTER_STORAGE` | ./data/matter | Matter fabric/session storage |

In-app settings (Sprinklers → Usage tab): per-zone flow rates, water tariff,
and home location (used for hot-day schedule temperature checks).

## Deploying updates

```bash
# on the dev machine
npm run build && git push

# on the Pi
cd ~/home-automation && git pull && sudo systemctl restart home-automation
```

(If the Pi is slow at building, build on the dev machine and copy
`client/dist` over instead — it's gitignored.)

## Hardware notes (hard-won)

- **Active-LOW relays**: LOW = relay ON. The "off" level is HIGH everywhere
  (init, cleanup, and firmware boot state).
- **Boot safety**: without `gpio=17,27,22=op,dh` in `/boot/firmware/config.txt`,
  the pins float during boot and *all valves open* until the service starts.
- **rpio over onoff**: the `onoff` package uses sysfs GPIO numbering which is
  offset on newer kernels (gpiochip512); `rpio` memory-maps `/dev/gpiomem`
  and just works (Pi 1–4). On **Pi 5** neither works (new RP1 GPIO chip) —
  the app shells out to the official `pinctrl` tool there instead.
- **Matter pairing**: generate the pairing code in HomeCom Easy
  (AC → settings → Connectivity/Matter). Commissioning takes ~10–30s over
  mDNS; credentials persist in `server/data/matter/`.
