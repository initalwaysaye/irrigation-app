/**
 * gpio.js
 * GPIO control with a backend per Pi generation:
 *
 *   - Pi 1-4:  the rpio package, which memory-maps /dev/gpiomem directly.
 *   - Pi 5:    the official `pinctrl` tool (shelled out). The Pi 5's GPIO
 *              lives on the new RP1 chip, which rpio's BCM283x register
 *              mapping cannot address.
 *   - Mock:    anything that isn't a Pi, MOCK_GPIO=true, or hardware init
 *              failure — logs instead of touching hardware.
 *
 * Requires the user to be in the 'gpio' group (standard on Raspberry Pi OS).
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const config = require('./config');

/** Reads the device model string, e.g. "Raspberry Pi 5 Model B Rev 1.0". */
function piModel() {
  try {
    return fs.readFileSync('/proc/device-tree/model', 'utf8');
  } catch {
    try {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      return /Raspberry Pi|BCM/.test(cpuinfo) ? 'Raspberry Pi (unknown model)' : '';
    } catch {
      return '';
    }
  }
}

// Pick the backend once at module load. init() may downgrade to mock on failure.
let BACKEND = 'mock';
if (process.env.MOCK_GPIO !== 'true') {
  const model = piModel();
  if (/Raspberry Pi 5/.test(model)) BACKEND = 'pinctrl';
  else if (model) BACKEND = 'rpio';
}

/** Drives a pin via the Raspberry Pi pinctrl tool: output + drive high/low. */
function pinctrlSet(pin, high) {
  execFileSync('pinctrl', ['set', String(pin), 'op', high ? 'dh' : 'dl']);
}

/**
 * Initialises all GPIO pins as outputs and drives them to the "off" state.
 * Falls back to mock mode if initialisation fails so the server still starts.
 */
function init() {
  // "Off" is the relay's de-energised level: HIGH for active-LOW boards.
  const offHigh = !config.activeHigh;
  try {
    if (BACKEND === 'pinctrl') {
      for (const zone of config.zones) pinctrlSet(zone.pin, offHigh);
      console.log('[GPIO] Initialized via pinctrl (Pi 5), all zones off');
    } else if (BACKEND === 'rpio') {
      const rpio = require('rpio');
      // BCM (GPIO) numbering; gpiomem:true uses /dev/gpiomem which the gpio
      // group can access without sudo.
      rpio.init({ mapping: 'gpio', gpiomem: true });
      for (const zone of config.zones) {
        rpio.open(zone.pin, rpio.OUTPUT, offHigh ? rpio.HIGH : rpio.LOW);
      }
      console.log('[GPIO] Initialized via rpio, all zones off');
    } else {
      console.log('[GPIO] Mock mode — no hardware access');
    }
  } catch (err) {
    BACKEND = 'mock';
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
  // The electrical level to drive: invert for active-LOW boards.
  const high = config.activeHigh ? on : !on;
  if (BACKEND === 'pinctrl') {
    pinctrlSet(pin, high);
  } else if (BACKEND === 'rpio') {
    const rpio = require('rpio');
    rpio.write(pin, high ? rpio.HIGH : rpio.LOW);
  } else {
    console.log(`[GPIO] Mock: pin ${pin} → ${on ? 'ON' : 'OFF'}`);
  }
}

/**
 * Drives all pins back to "off" and releases GPIO resources.
 * Called on server shutdown to ensure valves don't stay open.
 */
function cleanup() {
  const offHigh = !config.activeHigh;
  if (BACKEND === 'pinctrl') {
    for (const zone of config.zones) pinctrlSet(zone.pin, offHigh);
  } else if (BACKEND === 'rpio') {
    const rpio = require('rpio');
    for (const zone of config.zones) {
      rpio.write(zone.pin, offHigh ? rpio.HIGH : rpio.LOW);
      rpio.close(zone.pin);
    }
  }
}

module.exports = { init, setZone, cleanup };
