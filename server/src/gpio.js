/**
 * gpio.js
 * GPIO control using the rpio package, which memory-maps /dev/gpiomem directly.
 * Works on Pi 1/2/3/4/5 without needing a daemon or the sysfs interface.
 * Requires the user to be in the 'gpio' group (standard on Raspberry Pi OS).
 */

const fs = require('fs');
const config = require('./config');

let MOCK = process.env.MOCK_GPIO === 'true' || !isRaspberryPi();

/**
 * Detects whether this process is running on a Raspberry Pi by checking
 * /proc/cpuinfo, which on a Pi contains "Raspberry Pi" or the chip name "BCM".
 * Returns false on any OS that doesn't have that file (macOS, Windows, etc.).
 */
function isRaspberryPi() {
  try {
    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    return /Raspberry Pi|BCM/.test(cpuinfo);
  } catch {
    return false;
  }
}

/**
 * Initialises all GPIO pins as outputs and drives them to the "off" state.
 * Uses rpio which memory-maps /dev/gpiomem directly — no sysfs, no daemon needed.
 * Falls back to mock mode if initialisation fails (e.g. wrong group membership).
 */
function init() {
  if (MOCK) {
    console.log('[GPIO] Mock mode — no hardware access');
    return;
  }
  try {
    const rpio = require('rpio');
    // Use BCM (GPIO) pin numbering rather than physical header numbering.
    // gpiomem: true uses /dev/gpiomem which is accessible to the gpio group without sudo.
    rpio.init({ mapping: 'gpio', gpiomem: true });
    // "Off" is the relay's de-energised level: HIGH for active-LOW boards.
    const offValue = config.activeHigh ? rpio.LOW : rpio.HIGH;
    for (const zone of config.zones) {
      rpio.open(zone.pin, rpio.OUTPUT, offValue);
    }
    console.log('[GPIO] Initialized via rpio, all zones off');
  } catch (err) {
    // Fall back to mock so the server still starts even if GPIO is unavailable.
    // Fix: sudo usermod -aG gpio $USER then reboot.
    MOCK = true;
    console.warn('[GPIO] Hardware init failed, falling back to mock mode.');
    console.warn('[GPIO] Make sure the user is in the gpio group: sudo usermod -aG gpio $USER');
    console.warn('[GPIO] Error was:', err.message);
  }
}

/**
 * Turns a single zone relay on or off.
 *
 * @param {number} pin - BCM GPIO pin number (from config)
 * @param {boolean} on  - true to open the valve, false to close it
 *
 * For active-LOW relay boards (the common case):
 *   LOW signal (0) = relay coil energised = valve OPEN
 *   HIGH signal (1) = relay coil de-energised = valve CLOSED
 */
function setZone(pin, on) {
  if (MOCK) {
    console.log(`[GPIO] Mock: pin ${pin} → ${on ? 'ON' : 'OFF'}`);
    return;
  }
  const rpio = require('rpio');
  const value = config.activeHigh ? (on ? rpio.HIGH : rpio.LOW) : (on ? rpio.LOW : rpio.HIGH);
  rpio.write(pin, value);
}

/**
 * Drives all pins back to "off" and releases GPIO resources.
 * Called on server shutdown to ensure valves don't stay open.
 */
function cleanup() {
  if (MOCK) return;
  const rpio = require('rpio');
  const offValue = config.activeHigh ? rpio.LOW : rpio.HIGH;
  for (const zone of config.zones) {
    rpio.write(zone.pin, offValue);
    rpio.close(zone.pin);
  }
}

module.exports = { init, setZone, cleanup };
