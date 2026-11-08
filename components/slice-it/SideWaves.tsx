'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { AudioManager } from '@/lib/audio/AudioManager';
import { canvasGlowEnabled } from '@/lib/render/canvas2d-fx';
import { useSliceItStore } from '@/lib/slice-it/store';

/**
 * The music, printed in the margins.
 *
 * The playfield is held to 16:9 for fairness, so on a wide monitor it leaves a strip
 * of ink to either side. This fills it with the track itself, in the game's two spot
 * inks — side A (cyan) on the left, side B (pink) on the right — as one press:
 *
 *  - a **halftone field** of square pixels that swells with the loudness of each row
 *    and ripples outward from the field;
 *  - a **record** per side, turning, labelled A / B, that thumps on the kick;
 *  - the **spectrum**, a bar per frequency band (lows at the bottom) growing out of
 *    the field's edge, each with a solid cap and a paper tick that holds its peak;
 *  - a **slam**: on every kick the column at the field's edge thickens and the
 *    bass tips throw pixel sparks;
 *  - the live **waveform** as a trace, a **ruler** along the outer edge that scrolls
 *    with the energy, the song's **progress** as a bar down that edge, and a little
 *    telemetry.
 *
 * Everything is flat and hard-edged — the same slanted line screen as the lanes, no
 * glow, no gradient — and everything is driven by the actual audio, read from an
 * `AnalyserNode` tapped off the music's own gain stage, so uploaded songs and old ones
 * behave alike. The punch is in SIZE and MOTION, never a full-field flash.
 *
 * Decoration only: it never takes input, sits behind the field, and is off under the
 * performance tier, Reduced Flash, and a zero Effect Intensity — the switches that
 * govern the stage backdrop. It draws nothing unless a margin is at least
 * {@link MIN_GUTTER} wide.
 *
 * Idle at rest: motion (the records, the ruler, the halftone ripple) advances only
 * while there is sound, and once the bars, the thump and the sparks have all settled
 * — a pause, a countdown, a silent intro — the loop stops asking for animation frames
 * and polls on a 4 Hz timer for the music to start again. A run that is paused costs
 * nothing per frame.
 */

const BANDS = 48;
/** Narrower than this and there is nothing worth drawing. */
const MIN_GUTTER = 72;
/** Space between the field's edge and where the bars start, px. */
const EDGE_GAP = 10;
/** Share of the height the bars occupy, centred. */
const USABLE = 0.88;
/** Frame spacing: 45 Hz is plenty for a margin and spares the main thread. */
const MIN_FRAME_MS = 22;
const LOW_HZ = 40;
const HIGH_HZ = 16000;
/** Smoothing time constants, seconds: a hit lands at once and rings out. */
const ATTACK_TAU = 0.035;
const RELEASE_TAU = 0.16;
const PEAK_FALL_PER_SECOND = 0.55;
/** The lowest bands, whose energy is "the kick". */
const BASS_BANDS = 8;
/** A kick needs the fast bass envelope this far over the slow one, and this long since the last. */
const KICK_RISE = 0.07;
const KICK_REFRACTORY_MS = 140;
const THUMP_TAU = 0.2;
/** Halftone cell, px. */
const CELL = 14;
const MAX_SPARKS = 72;
const SCOPE_POINTS = 200;
/** While settled, how often to look for sound again, ms. */
const IDLE_POLL_MS = 250;

/** One slanted line, 36×5 px, that tiles without a seam — the lanes' own screen. */
function lineTile(color: string): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = 36;
  tile.height = 5;
  const c = tile.getContext('2d');
  if (c) {
    c.strokeStyle = color;
    c.lineWidth = 2;
    for (const o of [-5, 0, 5]) {
      c.beginPath();
      c.moveTo(0, 5 + o);
      c.lineTo(36, o);
      c.stroke();
    }
  }
  return tile;
}

export function SideWaves({
  stageRef,
  enabled,
}: {
  /** The playfield's box; the margins are everything outside it. */
  stageRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !stage || !ctx) return;

    // Resolved once: the tokens do not change while a run is on screen.
    const style = getComputedStyle(canvas);
    const token = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;
    const cyan = token('--slice-primary', '#2db3f0');
    const pink = token('--slice-accent', '#f4509f');
    const paper = token('--slice-paper', '#f0f1f6');
    const label = token('--slice-label', '#050921');
    const screens = {
      cyan: ctx.createPattern(lineTile(cyan), 'repeat'),
      pink: ctx.createPattern(lineTile(pink), 'repeat'),
    };

    const levels = new Float32Array(BANDS);
    const peaks = new Float32Array(BANDS);
    const sparks = {
      x: new Float32Array(MAX_SPARKS),
      y: new Float32Array(MAX_SPARKS),
      vx: new Float32Array(MAX_SPARKS),
      vy: new Float32Array(MAX_SPARKS),
      life: new Float32Array(MAX_SPARKS),
      size: new Float32Array(MAX_SPARKS),
      side: new Int8Array(MAX_SPARKS),
      paper: new Uint8Array(MAX_SPARKS),
    };
    let sparkCursor = 0;
    let freq: Uint8Array<ArrayBuffer> | null = null;
    let wave: Uint8Array<ArrayBuffer> | null = null;
    let edges: Int32Array | null = null;
    let edgesFor: { bins: number; rate: number } | null = null;

    // Slow state: the kick detector, the thump it drives, the record and ruler phases.
    let fastBass = 0;
    let slowBass = 0;
    let lastKick = 0;
    let thump = 0;
    let angle = 0;
    let rulerPhase = 0;
    let clock = 0;
    let readout = '';
    let readoutAt = 0;

    let width = 0;
    let height = 0;
    let stageLeft = 0;
    let stageRight = 0;

    /** Rects are read when the layout changes, never per frame. */
    const measure = () => {
      const box = canvas.getBoundingClientRect();
      const field = stage.getBoundingClientRect();
      width = Math.max(0, Math.round(box.width));
      height = Math.max(0, Math.round(box.height));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      stageLeft = field.left - box.left;
      stageRight = field.right - box.left;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    observer.observe(stage);

    /** Log-spaced band edges as FFT bin indices, rebuilt only if the analyser changes. */
    const bandEdges = (bins: number, rate: number): Int32Array => {
      if (edges && edgesFor && edgesFor.bins === bins && edgesFor.rate === rate) return edges;
      const nyquist = rate / 2;
      const top = Math.min(HIGH_HZ, nyquist);
      const out = new Int32Array(BANDS + 1);
      for (let i = 0; i <= BANDS; i++) {
        const hz = LOW_HZ * Math.pow(top / LOW_HZ, i / BANDS);
        out[i] = Math.max(0, Math.min(bins - 1, Math.round((hz / nyquist) * bins)));
      }
      for (let i = 1; i <= BANDS; i++) {
        if (out[i] <= out[i - 1]) out[i] = Math.min(bins - 1, out[i - 1] + 1);
      }
      edges = out;
      edgesFor = { bins, rate };
      return out;
    };

    /** The band a y position belongs to (bass at the bottom). */
    const bandAt = (y: number, top: number, usable: number) => {
      const row = Math.max(0, Math.min(BANDS - 1, Math.floor(((y - top) / usable) * BANDS)));
      return BANDS - 1 - row;
    };

    const spawnSpark = (side: -1 | 1, x: number, y: number, speed: number) => {
      const i = sparkCursor++ % MAX_SPARKS;
      sparks.x[i] = x;
      sparks.y[i] = y;
      sparks.vx[i] = side * (speed * (0.55 + Math.random() * 0.6));
      sparks.vy[i] = (Math.random() - 0.5) * speed * 0.5;
      sparks.life[i] = 0.5 + Math.random() * 0.45;
      sparks.size[i] = 3 + Math.floor(Math.random() * 3);
      sparks.side[i] = side;
      sparks.paper[i] = Math.random() < 0.3 ? 1 : 0;
    };

    let raf = 0;
    let timer = 0;
    let last = 0;

    /** Ask for the next frame — or, when everything has settled, poll instead. */
    const next = (idle: boolean) => {
      if (idle) {
        timer = window.setTimeout(() => {
          last = 0;
          raf = requestAnimationFrame(draw);
        }, IDLE_POLL_MS);
      } else {
        raf = requestAnimationFrame(draw);
      }
    };

    const draw = (now: number) => {
      if (document.hidden) return next(true);
      if (now - last < MIN_FRAME_MS) return next(false);
      const dt = Math.min(0.1, last === 0 ? 1 / 60 : (now - last) / 1000);
      last = now;

      const store = useSliceItStore.getState();
      const off = !canvasGlowEnabled() || store.reducedFlash || store.effectIntensity <= 0.01;
      ctx.clearRect(0, 0, width, height);
      if (off) return next(true);

      const leftRoom = stageLeft;
      const rightRoom = width - stageRight;
      const showLeft = leftRoom >= MIN_GUTTER;
      const showRight = rightRoom >= MIN_GUTTER;
      if (!showLeft && !showRight) return next(true);

      const fx = store.effectIntensity;
      const audio = AudioManager.getInstance();
      const analyser = audio.getAnalyser();
      const rate = audio.getContext()?.sampleRate ?? 44100;
      const attack = 1 - Math.exp(-dt / ATTACK_TAU);
      const release = 1 - Math.exp(-dt / RELEASE_TAU);

      /* ── Read the audio ─────────────────────────────────────────────────── */
      let rawBass = 0;
      let rawAll = 0;
      if (analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) {
          freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        if (!wave || wave.length !== analyser.fftSize) {
          wave = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        }
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(wave);
        const e = bandEdges(freq.length, rate);
        for (let b = 0; b < BANDS; b++) {
          let max = 0;
          for (let k = e[b]; k < e[b + 1]; k++) if (freq[k] > max) max = freq[k];
          // Peaks win over averages, and a gentle tilt keeps the treble from being
          // a row of stubs next to a bass that is always loud.
          const tilt = 0.72 + 0.55 * (b / (BANDS - 1));
          const target = Math.min(1, Math.pow(max / 255, 1.5) * tilt) * fx;
          if (b < BASS_BANDS) rawBass += target;
          rawAll += target;
          levels[b] += (target - levels[b]) * (target > levels[b] ? attack : release);
          if (levels[b] < 0.002) levels[b] = 0;
        }
        rawBass /= BASS_BANDS;
        rawAll /= BANDS;
      } else {
        for (let b = 0; b < BANDS; b++) {
          levels[b] += (0 - levels[b]) * release;
          if (levels[b] < 0.002) levels[b] = 0;
        }
      }

      /* ── The kick: fast bass over slow bass, with a refractory period ───── */
      fastBass += (rawBass - fastBass) * (1 - Math.exp(-dt / 0.03));
      slowBass += (rawBass - slowBass) * (1 - Math.exp(-dt / 0.4));
      const kicked = fastBass - slowBass * 1.08 > KICK_RISE && now - lastKick > KICK_REFRACTORY_MS;
      if (kicked) {
        lastKick = now;
        thump = 1;
      }
      thump *= Math.exp(-dt / THUMP_TAU);
      // Exactly zero once it has died away, so a settled frame is identical to the last
      // (a value creeping toward zero would keep nudging sub-pixel edges).
      if (thump < 0.002) thump = 0;
      const energy = Math.min(1, rawAll * 2.2);
      // Motion needs sound. With none, the records stand still, the ruler stops and
      // the ripple freezes — and the loop can go idle below.
      const sounding = rawAll > 0.004 || thump > 0.02;
      if (sounding) {
        clock += dt;
        // 33⅓ RPM is 0.56 turns a second; the records idle at a fifth of that and
        // speed up with the music.
        angle += dt * Math.PI * 2 * 0.11 * (1 + energy * 2.2);
        rulerPhase = (rulerPhase + dt * (36 + energy * 120)) % 60;
      }

      const usable = height * USABLE;
      const top = (height - usable) / 2;
      const rowH = usable / BANDS;
      const barH = Math.max(2, Math.floor(rowH) - 2);

      /* ── Per-side painting ──────────────────────────────────────────────── */
      const side = (dir: -1 | 1, room: number) => {
        const ink = dir === -1 ? cyan : pink;
        const screen = dir === -1 ? screens.cyan : screens.pink;
        const edge = dir === -1 ? stageLeft : stageRight;
        const outer = dir === -1 ? 0 : width;
        const x0 = edge + dir * EDGE_GAP;
        const reach = Math.max(8, room - EDGE_GAP - 14);
        // Distance from the field, then to px.
        const px = (d: number) => edge + dir * d;

        ctx.save();
        ctx.beginPath();
        ctx.rect(dir === -1 ? 0 : stageRight, 0, room, height);
        ctx.clip();

        /* 1. The halftone field: square pixels, bigger where the row is louder and
              near the field, with a wave travelling outward. */
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.34;
        const cols = Math.floor(room / CELL);
        const rows = Math.floor(height / CELL);
        const speed = 2.4 + energy * 4.5;
        for (let gy = 0; gy < rows; gy++) {
          const cy = gy * CELL + CELL / 2;
          const level = levels[bandAt(Math.max(top, Math.min(top + usable - 1, cy)), top, usable)];
          for (let gx = 0; gx < cols; gx++) {
            const d = gx * CELL + CELL / 2;
            const fade = 1 - d / room;
            const ripple = 0.5 + 0.5 * Math.sin(d * 0.05 - clock * speed);
            const s = Math.min(
              CELL - 1,
              1 + (level * 0.75 + thump * 0.55 + ripple * 0.3 * (0.3 + energy)) * CELL * 0.7 * fade,
            );
            if (s < 1.5) continue;
            const x = px(d);
            ctx.fillRect(
              Math.round(x - s / 2),
              Math.round(cy - s / 2),
              Math.round(s),
              Math.round(s),
            );
          }
        }
        ctx.globalAlpha = 1;

        /* 2. The record: grooves, a label with the side's letter, a marker that
              turns with it; it swells a hair on the kick. */
        const rcx = edge + dir * room * 0.52;
        const rcy = height * 0.5;
        const radius = Math.min(room * 0.36, height * 0.2) * (1 + 0.05 * thump);
        if (radius > 24) {
          ctx.save();
          ctx.translate(rcx, rcy);
          ctx.rotate(dir === -1 ? angle : -angle);
          ctx.fillStyle = label;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1;
          for (let r = radius * 0.42; r < radius - 2; r += 5) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
          }
          // A wedge of sheen: a hard-edged slice of paper, not a gradient.
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = paper;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, radius, -0.35, 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          // The label.
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = label;
          ctx.font = `900 ${Math.round(radius * 0.36)}px "Archivo", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dir === -1 ? 'A' : 'B', 0, radius * 0.02);
          ctx.fillStyle = paper;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(2, radius * 0.045), 0, Math.PI * 2);
          ctx.fill();
          // The marker that shows it is turning.
          ctx.strokeStyle = paper;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(radius * 0.46, 0);
          ctx.lineTo(radius - 3, 0);
          ctx.stroke();
          ctx.restore();
        }

        /* 3. The slam: the column at the field's edge, thicker on every kick. */
        const slam = 3 + thump * 16;
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(dir === -1 ? edge - slam : edge, top, slam, usable);
        ctx.globalAlpha = 1;

        /* 4. The spectrum. */
        ctx.fillStyle = paper;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(dir === -1 ? x0 : x0 - 1, top, 1, usable);
        ctx.globalAlpha = 1;
        for (let b = 0; b < BANDS; b++) {
          // Row 0 is the highest band, at the top; the bass sits at the bottom.
          const row = BANDS - 1 - b;
          const y = Math.round(top + row * rowH);
          const len = Math.max(3, levels[b] * reach);
          peaks[b] = Math.max(len, peaks[b] - PEAK_FALL_PER_SECOND * reach * dt);
          const x = dir === -1 ? x0 - len : x0;
          if (screen) {
            ctx.fillStyle = screen;
            ctx.fillRect(x, y, len, barH);
          }
          // The solid cap at the tip, and the held peak as a paper tick beyond it.
          ctx.fillStyle = ink;
          ctx.fillRect(dir === -1 ? x : x + len - 3, y, 3, barH);
          if (peaks[b] > len + 4) {
            ctx.fillStyle = paper;
            ctx.fillRect(dir === -1 ? x0 - peaks[b] : x0 + peaks[b] - 2, y, 2, barH);
          }
          // The kick throws pixels off the bass tips.
          if (kicked && b < BASS_BANDS + 4 && levels[b] > 0.35 && Math.random() < 0.7) {
            spawnSpark(dir, dir === -1 ? x : x + len, y + barH / 2, 220 + levels[b] * 260);
          }
        }

        /* 5. The waveform, as a trace down the middle of the margin. */
        if (wave) {
          const stride = Math.floor(wave.length / SCOPE_POINTS);
          const mid = edge + dir * room * 0.5;
          const swing = room * 0.2 * (0.35 + energy);
          ctx.strokeStyle = paper;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'miter';
          ctx.beginPath();
          for (let i = 0; i < SCOPE_POINTS; i++) {
            const v = (wave[i * stride] - 128) / 128;
            const x = mid + v * swing * dir;
            const y = top + (i / (SCOPE_POINTS - 1)) * usable;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        /* 6. The ruler along the outer edge, scrolling with the music: up on side
              A, down on side B. */
        ctx.fillStyle = paper;
        ctx.globalAlpha = 0.38;
        const shift = dir === -1 ? -rulerPhase : rulerPhase;
        for (let y = -60; y < height + 60; y += 12) {
          const yy = y + shift;
          const major = (((y / 12) % 5) + 5) % 5 === 0;
          const len = major ? 18 : 8;
          ctx.fillRect(dir === -1 ? outer + 6 : outer - 6 - len, Math.round(yy), len, 1);
        }
        ctx.globalAlpha = 1;

        /* 7. Song progress: a bar down the outer edge. */
        const duration = audio.getDuration();
        if (duration > 0) {
          const progress = Math.max(0, Math.min(1, audio.getCurrentTime() / duration));
          ctx.fillStyle = paper;
          ctx.globalAlpha = 0.16;
          ctx.fillRect(dir === -1 ? outer : outer - 3, top, 3, usable);
          ctx.globalAlpha = 1;
          ctx.fillStyle = ink;
          ctx.fillRect(dir === -1 ? outer : outer - 3, top, 3, usable * progress);
        }

        /* 8. Telemetry. */
        ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = dir === -1 ? 'left' : 'right';
        ctx.fillStyle = paper;
        ctx.globalAlpha = 0.6;
        const textX = dir === -1 ? outer + 14 : outer - 14;
        ctx.fillText(dir === -1 ? 'SIDE A · 33⅓ RPM' : 'SIDE B · 33⅓ RPM', textX, top - 10);
        if (now - readoutAt > 160) {
          readoutAt = now;
          const db = energy > 0.002 ? 20 * Math.log10(Math.min(1, energy)) : -60;
          readout = `LVL ${db.toFixed(1).padStart(5, ' ')} dB`;
        }
        ctx.fillText(readout, textX, top + usable + 20);
        ctx.globalAlpha = 1;

        ctx.restore();
      };

      if (showLeft) side(-1, leftRoom);
      if (showRight) side(1, rightRoom);

      /* ── Sparks: pixels thrown by the kick, over everything ─────────────── */
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (sparks.life[i] <= 0) continue;
        sparks.life[i] -= dt;
        sparks.x[i] += sparks.vx[i] * dt;
        sparks.y[i] += sparks.vy[i] * dt;
        sparks.vx[i] *= Math.exp(-dt * 2.2);
        sparks.vy[i] *= Math.exp(-dt * 2.2);
        if (sparks.life[i] <= 0) continue;
        const s = sparks.side[i];
        if ((s === -1 && !showLeft) || (s === 1 && !showRight)) continue;
        ctx.fillStyle = sparks.paper[i] ? paper : s === -1 ? cyan : pink;
        ctx.globalAlpha = Math.min(1, sparks.life[i] * 2.4);
        const size = sparks.size[i];
        ctx.fillRect(Math.round(sparks.x[i]), Math.round(sparks.y[i]), size, size);
      }
      ctx.globalAlpha = 1;

      // Settled: nothing is sounding, every bar has fallen, and no spark is in flight.
      let settled = !sounding;
      for (let b = 0; settled && b < BANDS; b++) if (levels[b] > 0.01) settled = false;
      for (let i = 0; settled && i < MAX_SPARKS; i++) if (sparks.life[i] > 0) settled = false;
      next(settled);
    };
    next(false);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, stageRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0 size-full"
      aria-hidden
      data-jelly-zone="playfield"
    />
  );
}
