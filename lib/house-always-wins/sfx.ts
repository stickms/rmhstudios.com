// ───────────────────────────────────────────────────────────────────────────
// Sound effects — synthesized with the Web Audio API (no asset files). A small
// palette of casino-flavoured blips for jumps, dashes, pickups, levers, busts
// and UI. Volume + mute are persisted to localStorage and adjustable in the
// settings menu.
// ───────────────────────────────────────────────────────────────────────────

type SfxName =
  | "jump"
  | "doublejump"
  | "dash"
  | "land"
  | "chip"
  | "key"
  | "ability"
  | "lever"
  | "door"
  | "save"
  | "bust"
  | "ui"
  | "win"
  | "lose"
  | "deal";

const VOL_KEY = "haw-sfx-vol";
const MUTE_KEY = "haw-sfx-muted";

function readNum(key: string, def: number): number {
  if (typeof window === "undefined") return def;
  const v = window.localStorage.getItem(key);
  const n = v == null ? def : parseFloat(v);
  return Number.isFinite(n) ? n : def;
}
function readBool(key: string, def: boolean): boolean {
  if (typeof window === "undefined") return def;
  const v = window.localStorage.getItem(key);
  return v == null ? def : v === "1";
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let _volume = readNum(VOL_KEY, 0.5);
let _muted = readBool(MUTE_KEY, false);

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = _muted ? 0 : _volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  when = 0,
  slideTo?: number,
  gain = 1
) {
  const c = audio();
  if (!c || !master) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.34 * gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 1, hp = 600) {
  const c = audio();
  if (!c || !master) return;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = 0.25 * gain;
  src.connect(filt).connect(g).connect(master);
  src.start();
}

function arp(freqs: number[], step: number, type: OscillatorType, dur: number, gain = 1) {
  freqs.forEach((f, i) => tone(f, dur, type, i * step, undefined, gain));
}

export const SfxManager = {
  play(name: SfxName) {
    if (_muted) return;
    switch (name) {
      case "jump":
        tone(320, 0.13, "square", 0, 540);
        break;
      case "doublejump":
        tone(520, 0.1, "sine", 0, 760);
        tone(780, 0.1, "sine", 0.05, 1040, 0.8);
        break;
      case "dash":
        noise(0.18, 1, 800);
        tone(620, 0.16, "sawtooth", 0, 180, 0.6);
        break;
      case "land":
        tone(170, 0.08, "triangle", 0, 90, 0.7);
        break;
      case "chip":
        tone(880, 0.07, "sine", 0, 1180);
        tone(1320, 0.06, "sine", 0.04, undefined, 0.6);
        break;
      case "key":
        arp([523, 659, 784, 1047], 0.07, "triangle", 0.16);
        break;
      case "ability":
        arp([392, 523, 659, 784, 1047], 0.08, "square", 0.22, 0.9);
        break;
      case "lever":
        tone(200, 0.05, "square", 0, 150, 0.7);
        break;
      case "door":
        tone(300, 0.22, "triangle", 0, 110, 0.7);
        break;
      case "save":
        tone(659, 0.18, "sine", 0, undefined, 0.8);
        tone(988, 0.22, "sine", 0.09, undefined, 0.7);
        break;
      case "bust":
        tone(300, 0.4, "sawtooth", 0, 55, 0.8);
        noise(0.18, 0.5, 300);
        break;
      case "ui":
        tone(460, 0.04, "square", 0, undefined, 0.5);
        break;
      case "win":
        arp([523, 659, 784, 1047, 1319], 0.09, "square", 0.24);
        break;
      case "lose":
        tone(330, 0.5, "sawtooth", 0, 70, 0.7);
        break;
      case "deal":
        tone(700, 0.03, "square", 0, undefined, 0.4);
        break;
    }
  },

  setVolume(v: number) {
    _volume = Math.max(0, Math.min(1, v));
    if (typeof window !== "undefined") window.localStorage.setItem(VOL_KEY, String(_volume));
    if (master && !_muted) master.gain.value = _volume;
  },
  getVolume(): number {
    return _volume;
  },
  setMuted(m: boolean) {
    _muted = m;
    if (typeof window !== "undefined") window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    if (master) master.gain.value = m ? 0 : _volume;
  },
  isMuted(): boolean {
    return _muted;
  },
};
