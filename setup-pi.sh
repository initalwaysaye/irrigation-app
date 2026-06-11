#!/usr/bin/env bash
#
# setup-pi.sh — bootstrap a fresh Raspberry Pi to run the home-automation app.
#
# Usage (on the Pi, as your normal user):
#   git clone https://github.com/initalwaysaye/home-automation.git ~/home-automation
#   cd ~/home-automation
#   ./setup-pi.sh
#
# Idempotent: safe to re-run. Covers everything learned setting up the
# original Pi:
#   - Node.js 20 via NodeSource (Raspberry Pi OS ships an old Node)
#   - server npm install (compiles better-sqlite3/rpio natively on the Pi)
#   - .env created from the example if missing
#   - boot-time GPIO state in /boot/firmware/config.txt so active-LOW relays
#     stay OFF while the Pi boots (otherwise all valves open for ~60s!)
#   - gpio group membership for /dev/gpiomem access
#   - systemd service (start on boot, restart on crash)
#   - client build if client/dist wasn't copied over already
#
# Supports Pi 1-5: the GPIO layer auto-selects rpio (Pi 1-4, memory-mapped
# /dev/gpiomem) or the official pinctrl tool (Pi 5, RP1 GPIO chip).

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="home-automation"
CONFIG_TXT="/boot/firmware/config.txt"
[ -f "$CONFIG_TXT" ] || CONFIG_TXT="/boot/config.txt"   # older Raspberry Pi OS

echo "==> Setting up home-automation in $APP_DIR"

# --- 1. Node.js 20 ----------------------------------------------------------
if ! command -v node >/dev/null || [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -lt 20 ]; then
  echo "==> Installing Node.js 20 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt-get install -y nodejs
else
  echo "==> Node.js $(node --version) already installed"
fi

# --- 2. Server dependencies (native compile happens here) -------------------
echo "==> Installing server dependencies"
npm install --prefix "$APP_DIR/server"

# --- 3. Environment file ----------------------------------------------------
if [ ! -f "$APP_DIR/server/.env" ]; then
  echo "==> Creating server/.env from example (edit to change GPIO pins)"
  cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
else
  echo "==> server/.env already exists, leaving it alone"
fi

# --- 4. Relays off during boot ----------------------------------------------
# Pins float as inputs while the Pi boots; on active-LOW relay boards that
# energises every relay. Drive the pins HIGH from the firmware stage instead.
if ! grep -q "^gpio=17,27,22=op,dh" "$CONFIG_TXT"; then
  echo "==> Adding boot-time GPIO state to $CONFIG_TXT (relays off during boot)"
  sudo tee -a "$CONFIG_TXT" >/dev/null << 'EOC'

# Irrigation relays on GPIO 17/27/22 are active-LOW. Drive them HIGH
# (relays OFF) from the earliest stage of boot so valves do not open
# while the Pi is starting up.
gpio=17,27,22=op,dh
EOC
else
  echo "==> Boot-time GPIO config already present"
fi

# --- 5. GPIO permissions -----------------------------------------------------
if ! groups | grep -q '\bgpio\b'; then
  echo "==> Adding $USER to the gpio group (takes effect after reboot)"
  sudo usermod -aG gpio "$USER"
else
  echo "==> $USER already in gpio group"
fi

# --- 6. Client build ---------------------------------------------------------
# Prefer building on a faster machine and copying client/dist over; only
# build here if it's missing. Takes several minutes on a Pi 3.
if [ ! -f "$APP_DIR/client/dist/index.html" ]; then
  echo "==> client/dist missing — building on the Pi (this is slow, be patient)"
  npm install --prefix "$APP_DIR/client"
  npm run build --prefix "$APP_DIR/client"
else
  echo "==> client/dist already present, skipping build"
fi

# --- 7. systemd service ------------------------------------------------------
echo "==> Installing systemd service ($SERVICE_NAME)"
sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null << EOS
[Unit]
Description=Home Automation Hub
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR/server
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOS
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

sleep 3
echo
echo "==> Service status: $(systemctl is-active $SERVICE_NAME)"
IP=$(hostname -I | awk '{print $1}')
echo "==> Done! Open http://$IP:3000"
echo
echo "    If this is the first run, reboot once so the gpio group and"
echo "    boot-time GPIO config take effect:  sudo reboot"
