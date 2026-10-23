/**
 * The game's short sounds, made in the page with the browser's own sound maker
 * (no sound file, nothing recorded, nothing sent anywhere).
 *
 * Sounds start only from a press: the first one makes the sound maker, which a
 * browser allows only after the person has pressed something. Each tone lets
 * go of its parts when it ends.
 */

/** @type {AudioContext | null} */
let maker = null;

/** The sound maker, or `null` where the browser has none. */
function soundMaker() {
  if (typeof window === 'undefined') return null;
  const Maker = window.AudioContext ?? window.webkitAudioContext;
  if (typeof Maker !== 'function') return null;
  if (maker === null) {
    try {
      maker = new Maker();
    } catch {
      return null;
    }
  }
  if (maker.state === 'suspended') maker.resume().catch(() => undefined);
  return maker;
}

/**
 * One soft tone.
 *
 * @param {number} after seconds from now
 * @param {number} pitch in hertz
 * @param {number} length in seconds
 * @param {OscillatorType} [shape]
 * @param {number} [loudness]
 */
function tone(after, pitch, length, shape = 'sine', loudness = 0.08) {
  const sound = soundMaker();
  if (sound === null) return;
  const start = sound.currentTime + after;
  const wave = sound.createOscillator();
  const level = sound.createGain();
  wave.type = shape;
  wave.frequency.value = pitch;
  level.gain.setValueAtTime(0.0001, start);
  level.gain.exponentialRampToValueAtTime(loudness, start + 0.02);
  level.gain.exponentialRampToValueAtTime(0.0001, start + length);
  wave.connect(level).connect(sound.destination);
  wave.onended = () => {
    wave.disconnect();
    level.disconnect();
  };
  wave.start(start);
  wave.stop(start + length + 0.02);
}

/** Two rising notes for a right answer. */
export function playRight() {
  tone(0, 660, 0.14);
  tone(0.1, 880, 0.22);
}

/** Two low, quiet notes for a miss. */
export function playMiss() {
  tone(0, 330, 0.22, 'triangle', 0.06);
  tone(0.12, 262, 0.3, 'triangle', 0.05);
}

/**
 * A short climb at the end of a round, one note more for each star.
 *
 * @param {number} stars
 */
export function playEnd(stars) {
  [523, 659, 784, 1047].slice(0, stars + 1).forEach((pitch, at) => tone(at * 0.12, pitch, 0.25));
}
