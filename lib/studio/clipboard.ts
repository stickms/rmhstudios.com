/**
 * The Studio clipboard (pure): what a copy puts on it, how foreign text is refused, and where a paste lands.
 *
 * The payload is JSON text with a `rmh-studio-clipboard/1` marker so it can ride the system clipboard between two
 * Studio tabs. Anything parsed back goes through the project schema's clip and note shapes, which drop unknown keys
 * and refuse out-of-range values, so a crafted clipboard cannot put anything into the document the project file
 * could not hold.
 */
import { z } from 'zod';
import { clipSchema, midiNoteSchema } from '@/lib/studio/project-schema';
import type { Clip, MidiNote, Track } from '@/lib/studio/types';

export const CLIPBOARD_MARKER = 'rmh-studio-clipboard/1';
/** Refuse clipboard text larger than this before parsing it (2 MB). */
const MAX_CLIPBOARD_CHARS = 2_000_000;

const payloadSchema = z.discriminatedUnion('kind', [
  z.object({
    marker: z.literal(CLIPBOARD_MARKER),
    kind: z.literal('clips'),
    clips: z.array(clipSchema).min(1).max(2000),
  }),
  z.object({
    marker: z.literal(CLIPBOARD_MARKER),
    kind: z.literal('notes'),
    notes: z.array(midiNoteSchema).min(1).max(20_000),
  }),
]);

export type ClipboardPayload =
  | {
      kind: 'clips';
      clips: Clip[];
    }
  | {
      kind: 'notes';
      notes: MidiNote[];
    };

export function serializeClipboard(payload: ClipboardPayload): string {
  return JSON.stringify({
    marker: CLIPBOARD_MARKER,
    ...payload,
  });
}

/** The payload in `text`, or null for anything that is not ours (ignored silently by the caller). */
export function parseClipboard(text: string | null | undefined): ClipboardPayload | null {
  if (!text || text.length > MAX_CLIPBOARD_CHARS || !text.includes(CLIPBOARD_MARKER)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  return d.kind === 'clips'
    ? {
        kind: 'clips',
        clips: d.clips as Clip[],
      }
    : {
        kind: 'notes',
        notes: d.notes as MidiNote[],
      };
}

type TrackType = Track['type'];
/** Which track type a clip can live on. */
const trackTypeFor = (clip: Clip): TrackType =>
  clip.type === 'audio' ? 'audio' : clip.type === 'automation' ? 'automation' : 'midi';

export interface ClipPasteContext {
  playheadBeat: number;
  selectedTrackId: string | null;
  tracks: Pick<Track, 'id' | 'type'>[];
  newId: () => string;
}

/**
 * Where pasted clips land: the earliest copied clip starts at the playhead and the rest keep their spacing. They go
 * onto the selected track when there is one that can hold them, otherwise back onto their original tracks if those
 * still exist. A clip with nowhere to go is left out.
 */
export function placeClips(clips: Clip[], ctx: ClipPasteContext): Clip[] {
  if (clips.length === 0) return [];
  const origin = Math.min(...clips.map((c) => c.startBeat));
  const delta = Math.max(0, ctx.playheadBeat) - origin;
  const selected = ctx.tracks.find((t) => t.id === ctx.selectedTrackId) ?? null;
  const out: Clip[] = [];
  for (const c of clips) {
    let target: Pick<Track, 'id' | 'type'> | undefined;
    if (selected && selected.type === trackTypeFor(c)) target = selected;
    else if (!selected) target = ctx.tracks.find((t) => t.id === c.trackId);
    else target = ctx.tracks.find((t) => t.id === c.trackId && t.type === trackTypeFor(c));
    if (!target) continue;
    const base = {
      ...c,
      id: ctx.newId(),
      trackId: target.id,
      startBeat: Math.max(0, c.startBeat + delta),
    };
    out.push(
      base.type === 'midi'
        ? {
            ...base,
            notes: base.notes.map((n) => ({
              ...n,
              id: ctx.newId(),
            })),
          }
        : base,
    );
  }
  return out;
}

/**
 * Notes paste into the open MIDI clip with the earliest at the playhead. Note starts are relative to the clip, so
 * the playhead is converted first; a playhead before the clip puts the notes at the clip's start.
 */
export function placeNotes(
  notes: MidiNote[],
  clipStartBeat: number,
  playheadBeat: number,
  newId: () => string,
): MidiNote[] {
  if (notes.length === 0) return [];
  const origin = Math.min(...notes.map((n) => n.startBeat));
  const delta = Math.max(0, playheadBeat - clipStartBeat) - origin;
  return notes.map((n) => ({
    ...n,
    id: newId(),
    startBeat: Math.max(0, n.startBeat + delta),
  }));
}
