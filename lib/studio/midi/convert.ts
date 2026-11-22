/**
 * Project <-> Standard MIDI File, and pattern flattening. Pure: no store, no audio, no I/O.
 * `flattenPattern` is also what the audio graph schedules, so a pattern sounds and exports the same.
 */
import { clamp } from '@/lib/core/math';
import { RMHDrums } from '../plugins/instruments/RMHDrums';
import type { MidiClipData, MidiNote, Pattern, Track } from '../types';
import { SMF_PPQ, type SmfEvent, type SmfFile, type SmfTrack } from './smf-types';

/** General MIDI percussion channel (channel 10, zero-based 9). */
export const DRUM_CHANNEL = 9;

export interface FlatNote {
  pitch: number;
  /** Relative to the clip start. */
  startBeat: number;
  durationBeats: number;
  /** 1-127. */
  velocity: number;
}

/** Pattern step velocity is stored 0-127 (the grid writes 100); a value of 1 or less is read as a fraction. */
function stepVelocity(v: number): number {
  const scaled = v > 0 && v <= 1 ? v * 127 : v;
  return clamp(Math.round(scaled), 1, 127);
}

function drumPitch(instrumentId: string, pitch: number | undefined): number {
  if (pitch !== undefined) return clamp(Math.round(pitch), 0, 127);
  const m = /^drum-(\d+)$/.exec(instrumentId);
  const pad = m ? RMHDrums.PAD_NOTES[Number(m[1])] : undefined;
  return pad ?? RMHDrums.PAD_NOTES[0];
}

/** The notes a pattern plays over `clipBeats`, looping it when the clip is longer than the pattern. */
export function flattenPattern(pattern: Pattern, clipBeats: number): FlatNote[] {
  const out: FlatNote[] = [];
  const spb = Math.max(1, pattern.stepsPerBeat);
  const length = pattern.lengthBeats;
  if (!(length > 0) || !(clipBeats > 0)) return out;
  const stepBeats = 1 / spb;
  const noteLength = Math.min(stepBeats, 0.25);
  const loops = Math.ceil(clipBeats / length);
  for (let loop = 0; loop < loops; loop++) {
    for (const lane of pattern.tracks) {
      const pitch = (step: { pitch?: number }) => drumPitch(lane.instrumentId, step.pitch);
      const count = Math.min(lane.steps.length, Math.round(length * spb));
      for (let i = 0; i < count; i++) {
        const step = lane.steps[i];
        if (!step.active) continue;
        const startBeat = loop * length + i * stepBeats;
        if (startBeat >= clipBeats) continue;
        out.push({
          pitch: pitch(step),
          startBeat,
          durationBeats: noteLength,
          velocity: stepVelocity(step.velocity),
        });
      }
    }
  }
  return out;
}

// ─── Project -> SMF ─────────────────────────────────────────────────────────

export interface ExportableProject {
  bpm: number;
  timeSignature: [number, number];
  tracks: Pick<Track, 'id' | 'name' | 'type' | 'clipIds'>[];
  clips: Record<
    string,
    {
      type: string;
      startBeat: number;
      durationBeats: number;
      notes?: MidiNote[];
      patternId?: string;
    }
  >;
  patterns: Pattern[];
}

export interface SmfExport {
  file: SmfFile;
  noteCount: number;
}

const toTicks = (beats: number) => Math.max(0, Math.round(beats * SMF_PPQ));

function noteEvents(notes: FlatNote[], offsetBeats: number, channel: number, into: SmfEvent[]) {
  for (const n of notes) {
    const on = toTicks(offsetBeats + n.startBeat);
    const off = Math.max(on + 1, toTicks(offsetBeats + n.startBeat + n.durationBeats));
    into.push({
      tick: on,
      type: 'noteOn',
      channel,
      note: clamp(Math.round(n.pitch), 0, 127),
      velocity: n.velocity,
    });
    into.push({
      tick: off,
      type: 'noteOff',
      channel,
      note: clamp(Math.round(n.pitch), 0, 127),
      velocity: 0,
    });
  }
}

/** Melodic channels in turn, skipping the percussion channel. */
function melodicChannel(index: number): number {
  const slot = index % 15;
  return slot >= DRUM_CHANNEL ? slot + 1 : slot;
}

export function projectToSmf(project: ExportableProject): SmfExport {
  const conductor: SmfEvent[] = [
    {
      tick: 0,
      type: 'trackName',
      name: 'Tempo',
    },
    {
      tick: 0,
      type: 'tempo',
      microsPerQuarter: Math.round(60_000_000 / Math.max(1, project.bpm)),
    },
    {
      tick: 0,
      type: 'timeSignature',
      numerator: project.timeSignature[0],
      denominator: project.timeSignature[1],
    },
  ];
  const tracks: SmfTrack[] = [
    {
      events: conductor,
    },
  ];
  const patterns = new Map(project.patterns.map((p) => [p.id, p]));
  let noteCount = 0;
  let melodic = 0;

  for (const track of project.tracks) {
    if (track.type === 'audio' || track.type === 'automation') continue;
    const tune: SmfEvent[] = [];
    const drums: SmfEvent[] = [];
    for (const clipId of track.clipIds) {
      const clip = project.clips[clipId];
      if (!clip) continue;
      if (clip.type === 'midi' && clip.notes) {
        const flat = clip.notes.map((n: MidiNote): FlatNote => ({
          pitch: n.pitch,
          startBeat: n.startBeat,
          durationBeats: Math.max(n.durationBeats, 1 / SMF_PPQ),
          velocity: clamp(Math.round(n.velocity), 1, 127),
        }));
        noteEvents(flat, clip.startBeat, melodicChannel(melodic), tune);
        noteCount += flat.length;
      } else if (clip.type === 'pattern') {
        const pattern = patterns.get(
          (
            clip as {
              patternId?: string;
            }
          ).patternId ?? '',
        );
        if (!pattern) continue;
        const flat = flattenPattern(pattern, clip.durationBeats);
        noteEvents(flat, clip.startBeat, DRUM_CHANNEL, drums);
        noteCount += flat.length;
      }
    }
    if (tune.length > 0) {
      tracks.push({
        events: [
          {
            tick: 0,
            type: 'trackName',
            name: track.name,
          },
          ...tune,
        ],
      });
      melodic += 1;
    }
    if (drums.length > 0) {
      const name = tune.length > 0 ? `${track.name} (drums)` : track.name;
      tracks.push({
        events: [
          {
            tick: 0,
            type: 'trackName',
            name,
          },
          ...drums,
        ],
      });
    }
  }
  return {
    file: {
      format: 1,
      ppq: SMF_PPQ,
      tracks,
    },
    noteCount,
  };
}

// ─── SMF -> Studio tracks ───────────────────────────────────────────────────

export interface ImportedNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface ImportedTrack {
  name: string;
  channel: number;
  notes: ImportedNote[];
  /** End of the last note, in beats. */
  lengthBeats: number;
}

export interface SmfImport {
  tracks: ImportedTrack[];
  noteCount: number;
  /** From the file's first tempo event, rounded to 0.01 BPM; null when the file has none. */
  bpm: number | null;
  timeSignature: [number, number] | null;
}

export function smfToImport(file: SmfFile): SmfImport {
  let bpm: number | null = null;
  let timeSignature: [number, number] | null = null;
  let firstTempo = Infinity;
  let firstSig = Infinity;
  const result: ImportedTrack[] = [];
  const ppq = file.ppq;

  for (const track of file.tracks) {
    let name = '';
    const open = new Map<
      string,
      {
        tick: number;
        velocity: number;
      }[]
    >();
    const byChannel = new Map<number, ImportedNote[]>();
    const emit = (channel: number, note: number, startTick: number, endTick: number, velocity: number) => {
      const list = byChannel.get(channel) ?? [];
      list.push({
        pitch: note,
        startBeat: startTick / ppq,
        durationBeats: Math.max(1, endTick - startTick) / ppq,
        velocity,
      });
      byChannel.set(channel, list);
    };
    let lastTick = 0;
    const ordered = [...track.events].sort((a, b) => a.tick - b.tick);
    for (const e of ordered) {
      lastTick = Math.max(lastTick, e.tick);
      if (e.type === 'trackName' && !name) name = e.name.trim();
      else if (e.type === 'tempo' && e.tick < firstTempo && e.microsPerQuarter > 0) {
        firstTempo = e.tick;
        bpm = Math.round((60_000_000 / e.microsPerQuarter) * 100) / 100;
      } else if (e.type === 'timeSignature' && e.tick < firstSig) {
        firstSig = e.tick;
        timeSignature = [Math.max(1, e.numerator), Math.max(1, e.denominator)];
      } else if (e.type === 'noteOn') {
        const key = `${e.channel}:${e.note}`;
        const stack = open.get(key) ?? [];
        stack.push({
          tick: e.tick,
          velocity: e.velocity,
        });
        open.set(key, stack);
      } else if (e.type === 'noteOff') {
        const start = open.get(`${e.channel}:${e.note}`)?.shift();
        if (start) emit(e.channel, e.note, start.tick, e.tick, start.velocity);
      }
    }
    // A note never switched off lasts to the end of its track.
    for (const [key, starts] of open) {
      const [channel, note] = key.split(':').map(Number);
      for (const s of starts) emit(channel, note, s.tick, Math.max(lastTick, s.tick + 1), s.velocity);
    }

    // A type 0 file keeps every channel in one track: one Studio track per channel is the useful split.
    const split = byChannel.size > 1;
    for (const [channel, notes] of [...byChannel].sort((a, b) => a[0] - b[0])) {
      notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
      const base = name || '';
      const label = split ? `${base || 'Track'} ${channel + 1}`.trim() : base;
      result.push({
        name: label,
        channel,
        notes,
        lengthBeats: notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0),
      });
    }
  }
  return {
    tracks: result,
    noteCount: result.reduce((s, t) => s + t.notes.length, 0),
    bpm,
    timeSignature,
  };
}

/** Studio tracks and one MIDI clip each for the imported tracks. Ids come from `makeId`; nothing is stored here. */
export function importToStudio(
  imported: ImportedTrack[],
  opts: {
    makeId: () => string;
    firstTrackNumber: number;
    colors: readonly string[];
    trackHeight: number;
    barBeats: number;
  },
): {
  tracks: Track[];
  clips: MidiClipData[];
} {
  const tracks: Track[] = [];
  const clips: MidiClipData[] = [];
  imported.forEach((it, i) => {
    const trackId = opts.makeId();
    const clipId = opts.makeId();
    const color = opts.colors[(opts.firstTrackNumber - 1 + i) % opts.colors.length];
    const name = it.name || `MIDI ${opts.firstTrackNumber + i}`;
    // The clip covers whole bars so it is easy to move and loop.
    const bars = Math.max(1, Math.ceil(it.lengthBeats / opts.barBeats));
    tracks.push({
      id: trackId,
      name,
      type: 'midi',
      color,
      volume: 0.8,
      pan: 0,
      muted: false,
      soloed: false,
      armed: false,
      clipIds: [],
      pluginChain: [],
      sends: [],
      height: opts.trackHeight,
    });
    clips.push({
      id: clipId,
      trackId,
      type: 'midi',
      name,
      startBeat: 0,
      durationBeats: bars * opts.barBeats,
      color,
      notes: it.notes.map((n) => ({
        id: opts.makeId(),
        ...n,
      })),
    });
  });
  return {
    tracks,
    clips,
  };
}
