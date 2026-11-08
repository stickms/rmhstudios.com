/**
 * Turns a raw Web MIDI message into a `NoteEvent`. Only note-on and note-off
 * matter to the learning engines; everything else (control change, pitch bend,
 * clock, sysex) yields `null`. The caller supplies the timestamp so this stays
 * pure and testable, and it never throws on malformed input.
 */
import type { NoteEvent } from './events';

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;

export function parseMidiMessage(data: ArrayLike<number>, time: number): NoteEvent | null {
  if (data.length < 3) return null;
  // The high nibble is the message type; the channel (low nibble) is ignored.
  const kind = data[0] & 0xf0;
  if (kind !== NOTE_ON && kind !== NOTE_OFF) return null;
  const midi = data[1] & 0x7f;
  const velocity = (data[2] & 0x7f) / 127;
  // A note-on with velocity 0 is a note-off by the MIDI spec.
  const on = kind === NOTE_ON && velocity > 0;
  return { type: on ? 'on' : 'off', midi, velocity, time, source: 'midi' };
}
