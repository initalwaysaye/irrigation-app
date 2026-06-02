/**
 * gpio.js
 * Abstracts all physical GPIO hardware access behind a simple on/off interface.
 *
 * Because this app needs to be developed and tested on a regular laptop (no GPIO),
 * this module automatically falls back to "mock mode" when it detects it isn't
 * running on a Raspberry Pi — or when MOCK_GPIO=true is set in the environment.
 * In mock mode all GPIO calls are replaced with console.log statements so you can
 * see exactly what would happen on real hardware.
 */

const fs = require('fs');
const config = require('./config');

// Decide at module load time whether to use real GPIO or the mock.
// This avoids sprinkling if/else checks throughout every function.
const MOCK = process.env.MOCK_GPIO === 'true' || !isRaspberryPi();

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

// Stores the onoff Gpio objects keyed by pin number.
// These are only populated when running on real hardware.
const gpioObjects = {};

/**
 * Initialises all GPIO pins as outputs and drives them to the "off" state.
 * Must be called once at server startup before any setZone() calls.
 *
 * On real hardware: requires the 'onoff' package and the user being in the
 * 'gpio' group (or running as root). Uses require() inside the function so
 * that in mock mode the onoff package is never even loaded (avoids errors on
 * machines where it isn't installed or can't access hardware).
 */
function init() {
  if (MOCK) {
    console.log('[GPIO] Mock mode — no hardware access');
    return;
  }
  const { Gpio } = require('onoff');
  // "Off" value depends on relay polarity — see config.activeHigh explanation.
  const offValue = config.activeHigh ? 0 : 1;
  for (const zone of config.zones) {
    gpioObjects[zone.pin] = new Gpio(zone.pin, 'out'); // configure pin as output
    gpioObjects[zone.pin].writeSync(offValue);          // ensure relay starts closed
  }
  console.log('[GPIO] Initialized, all zones off');
}

/**
 * Turns a single zone relay on or off.
 *
 * @param {number} pin - BCM GPIO pin number (from config)
 * @param {boolean} on  - true to open the valve, false to close it
 *
 * The actual electrical signal written to the pin is inverted when using
 * an active-LOW relay board (the common case), because on those boards:
 *   LOW signal (0) = relay coil energised = valve OPEN
 *   HIGH signal (1) = relay coil de-energised = valve CLOSED
 */
function setZone(pin, on) {
  // Translate the logical on/off to the correct electrical signal level.
  const value = config.activeHigh ? (on ? 1 : 0) : (on ? 0 : 1);
  if (MOCK) {
    console.log(`[GPIO] Mock: pin ${pin} → ${on ? 'ON' : 'OFF'} (write ${value})`);
    return;
  }
  gpioObjects[pin].writeSync(value);
}

/**
 * Drives all pins back to "off" and releases the GPIO resources.
 * Called when the server is shutting down (SIGTERM/SIGINT) to ensure
 * valves don't stay open if the process exits unexpectedly.
 */
function cleanup() {
  if (MOCK) return;
  const offValue = config.activeHigh ? 0 : 1;
  for (const gpio of Object.values(gpioObjects)) {
    gpio.writeSync(offValue); // close the valve
    gpio.unexport();          // release the pin back to the OS
  }
}

module.exports = { init, setZone, cleanup };
