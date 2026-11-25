/**
 * Recording a take (pure). The recorder is fed timestamped note-on and note-off events in transport seconds and
 * returns the notes of one MIDI clip in beats. It reads no clock and holds no timer: the caller stamps each event
 * with the transport's own clock when it happens, so what lands in the clip does not depend on a frame loop.
 */
import type { MidiNote } from '@/lib/studio/types';

/** The quantize grid, as the Studio setting stores it. */
export type RecordQuantize = 'off' | '1/4' | '1/8' | '1/16';

export const RECORD_QUANTIZE_VALUES: readonly RecordQuantize[] = ['off', '1/4', '1/8', '1/16'];

/** A grid step in beats (a quarter note is one beat). Null means no quantize. */
export function gridBeats(q: RecordQuantize): number | null {
  switch (q) {
    case '1/4':
      return 1;
    case '1/8':
      return 0.5;
    case '1/16':
      return 0.25;
    case 'off':
      return null;
  }
}

export const MAX_INPUT_LATENCY_MS = 200;
/** The shortest note a take keeps when quantize is off, in beats. */
export const MIN_NOTE_BEATS = 1 / 32;

export interface RecordEvent {
  kind: 'on' | 'off';
  /** MIDI pitch, 0-127. */
  pitch: number;
  /** 0-127; ignored on note-off. */
  velocity: number;
  /** Transport seconds when the key went down or up. */
  seconds: number;
}

export interface TakeOptions {
  bpm: number;
  beatsPerBar: number;
  /** Transport seconds at which the take started (the playhead when the transport rolled). */
  startSeconds: number;
  /** Transport seconds when the take ended; notes still held are closed here. */
  endSeconds: number;
  /** Subtracted from every event, 0-200 ms. */
  latencyMs: number;
  quantize: RecordQuantize;
  newId: () => string;
}

export interface Take {
  /** The bar line where recording started. */
  startBeat: number;
  /** A whole number of bars, at least one. */
  durationBeats: number;
  /** Relative to `startBeat`, ordered by start. */
  notes: MidiNote[];
}

const secondsToBeats = (seconds: number, bpm: number) => (seconds * bpm) / 60;

const clampLatency = (ms: number) => (Number.isFinite(ms) ? Math.max(0, Math.min(MAX_INPUT_LATENCY_MS, ms)) : 0);

const clampVelocity = (v: number) => Math.max(1, Math.min(127, Math.round(v)));

/**
 * Build the take. Returns null when no note was played. A note-on for a pitch that is still down closes the earlier
 * note at that moment; a note-off with no note down is ignored; a note still held at the end closes at the end.
 */
export function buildTake(events: readonly RecordEvent[], o: TakeOptions): Take | null {
  const bpm = o.bpm > 0 ? o.bpm : 120;
  const perBar = Math.max(1, Math.round(o.beatsPerBar));
  const latency = clampLatency(o.latencyMs) / 1000;
  const grid = gridBeats(o.quantize);
  const startBeat = secondsToBeats(o.startSeconds, bpm);
  const endBeat = secondsToBeats(o.endSeconds, bpm);
  const barStart = Math.floor(startBeat / perBar + 1e-9) * perBar;

  // Absolute beats, latency removed. The take never reaches back before the moment recording started.
  const abs = (seconds: number) => Math.max(startBeat, secondsToBeats(seconds - latency, bpm));
  const open = new Map<number, { start: number; velocity: number }>();
  const raw: { pitch: number; start: number; end: number; velocity: number }[] = [];
  const close = (pitch: number, at: number) => {
    const n = open.get(pitch);
    if (!n) return;
    open.delete(pitch);
    raw.push({ pitch, start: n.start, end: Math.max(n.start, at), velocity: n.velocity });
  };

  const ordered = [...events].sort((a, b) => a.seconds - b.seconds);
  for (const e of ordered) {
    if (e.seconds > o.endSeconds || !Number.isFinite(e.seconds)) continue;
    if (e.pitch < 0 || e.pitch > 127) continue;
    const at = abs(e.seconds);
    if (e.kind === 'on') {
      close(e.pitch, at);
      open.set(e.pitch, { start: at, velocity: clampVelocity(e.velocity) });
    } else {
      close(e.pitch, at);
    }
  }
  const finish = Math.max(endBeat, startBeat);
  for (const pitch of [...open.keys()]) close(pitch, finish);
  if (raw.length === 0) return null;

  const notes: MidiNote[] = raw
    .map((n) => {
      let start = n.start;
      let end = n.end;
      if (grid !== null) {
        start = Math.max(startBeat, Math.round(start / grid) * grid);
        end = Math.max(start + grid, Math.round(end / grid) * grid);
      } else {
        end = Math.max(start + MIN_NOTE_BEATS, end);
      }
      return { pitch: n.pitch, start, end, velocity: n.velocity };
    })
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
    .map((n) => ({
      id: o.newId(),
      pitch: n.pitch,
      startBeat: n.start - barStart,
      durationBeats: n.end - n.start,
      velocity: n.velocity,
    }));

  const last = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
  // "To the bar after the last note": a note ending exactly on a bar line ends the clip there.
  const bars = Math.max(1, Math.ceil(last / perBar - 1e-9));
  return { startBeat: barStart, durationBeats: bars * perBar, notes };
}

/** The slice of the Studio store the recorder reacts to. */
export interface RecordWatchState {
  isRecording: boolean;
  isPlaying: boolean;
  loopEnabled: boolean;
  recordPhase: 'idle' | 'count-in' | 'recording';
}

/**
 * What the recorder does about one store change.
 *
 * - `begin` / `end`: record was pressed or released.
 * - `stop-take`: the transport stopped (or the loop was switched on) under a running take, so the take ends and is
 *   kept. A loop is never allowed to run under a take: Tone's transport clock jumps back at the loop end, and a note
 *   stamped after the jump would land before the notes it followed.
 * - `cancel-count-in`: play was pressed during the count-in bar (Space, or the play button). The count-in is
 *   cancelled and nothing starts, so the take can never begin believing the transport "was playing" already.
 */
export type RecordReaction = 'begin' | 'end' | 'stop-take' | 'cancel-count-in' | null;

export function recordReaction(s: RecordWatchState, prev: RecordWatchState): RecordReaction {
  if (s.isRecording && !prev.isRecording) return 'begin';
  if (!s.isRecording && prev.isRecording) return 'end';
  if (!s.isRecording) return null;
  if (s.recordPhase === 'count-in' && s.isPlaying && !prev.isPlaying) return 'cancel-count-in';
  if (s.recordPhase === 'recording' && prev.isPlaying && !s.isPlaying) return 'stop-take';
  if (s.recordPhase === 'recording' && s.loopEnabled && !prev.loopEnabled) return 'stop-take';
  return null;
}

/** Why a take cannot start now, or null when it can. A loop is refused for the reason under `RecordReaction`. */
export function recordRefusal(s: {
  loopEnabled: boolean;
  tracks: readonly { type: string; armed?: boolean }[];
}): 'no-armed-track' | 'loop-on' | null {
  if (!s.tracks.some((t) => t.type === 'midi' && t.armed)) return 'no-armed-track';
  if (s.loopEnabled) return 'loop-on';
  return null;
}
