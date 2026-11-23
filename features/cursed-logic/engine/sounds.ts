import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';

/**
 * The page's shared AudioContext, or null where Web Audio isn't available —
 * every effect below already handles null, so the game is silent rather than
 * broken. A bare `new AudioContext()` here used to throw and take the game's
 * init path down with it.
 */
function getContext(): AudioContext | null {
  const ctx = getAudioContext();
  // Engines start contexts suspended until a gesture, and iOS re-suspends on
  // backgrounding, so this is worth re-checking rather than doing once.
  resumeAudioContext();
  return ctx;
}

function now() {
  return getContext()?.currentTime ?? 0;
}

/** Laser fire (player or protocol) — bright sweep */
export function laserFire(isPlayer: boolean) {
  const ctx = getContext();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(isPlayer ? 800 : 600, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.12);
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.start(t);
  osc.stop(t + 0.15);
}

/** Shield block — metallic clang */
export function shieldBlock(isPlayer: boolean) {
  const ctx = getContext();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(isPlayer ? 400 : 350, t);
  osc.type = 'square';
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.start(t);
  osc.stop(t + 0.2);
}

/** Damage impact — low thud */
export function damageHit() {
  const ctx = getContext();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}

/** Prepare charge — soft buildup */
export function prepareCharge() {
  const ctx = getContext();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.linearRampToValueAtTime(400, t + 0.2);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

/** Game win — short triumph */
export function gameWin() {
  const ctx = getContext();
  if (!ctx) return;
  const t = now();
  const notes = [523, 659, 784];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, t + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.12, t + i * 0.1 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.1);
    osc.stop(t + i * 0.1 + 0.25);
  });
}

/**
 * The terminal's voice: square-wave chirps stepped in pitch, like a modem choking on bad data. Each cue is one
 * short burst (<= 0.3 s) answering a clash; nothing loops.
 */
function chirp(freqs: number[], step: number, type: OscillatorType, volume: number) {
  const ctx = getContext();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * step));
  const end = t + freqs.length * step;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(end);
}

/** A tell or an action flipping over: one dry tick (yours a little higher). */
export function revealTick(isPlayer: boolean) {
  chirp(isPlayer ? [1320, 990] : [880, 660], 0.025, 'square', 0.05);
}

/** Your hit lands: a rising corrupted arpeggio. */
export function hitFoe() {
  chirp([220, 440, 330, 660, 495], 0.03, 'square', 0.07);
}

/** You are hit: a falling bit-crush with a thud under it. */
export function hitYou() {
  chirp([600, 300, 450, 150], 0.035, 'sawtooth', 0.06);
  damageHit();
}

/** A process terminated: a long stepped fall to silence. */
export function terminate() {
  chirp([880, 660, 990, 440, 330, 220, 110], 0.04, 'square', 0.07);
}

/** Game lose — low descent */
export function gameLose() {
  const ctx = getContext();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.4);
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.4);
}
