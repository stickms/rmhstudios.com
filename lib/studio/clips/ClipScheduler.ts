import type * as ToneNS from 'tone';
import { StudioEngine } from '../engine/StudioEngine';
import type { Clip, MidiClipData, AudioClipData } from '../types';

/**
 * ClipScheduler — schedules clips onto Tone.Transport for playback.
 *
 * Manages the lifecycle of scheduled events: when clips change,
 * old events are cleared and new ones are scheduled.
 */
export class ClipScheduler {
  private engine: StudioEngine;
  private scheduledEvents: number[] = [];
  private activeNotes = new Map<string, { synth: ToneNS.PolySynth; note: string }>();

  constructor(engine: StudioEngine) {
    this.engine = engine;
  }

  /**
   * Clear all currently scheduled events and reschedule from the given clips.
   */
  scheduleAll(clips: Record<string, Clip>, instrumentMap: Map<string, ToneNS.PolySynth>): void {
    this.clearAll();

    const tone = this.engine.getTone();
    const transport = tone.getTransport();

    for (const clip of Object.values(clips)) {
      if (clip.type === 'midi') {
        this.scheduleMidiClip(clip as MidiClipData, transport, tone, instrumentMap);
      }
      // Audio clips will be added in a future phase
    }
  }

  private scheduleMidiClip(
    clip: MidiClipData,
    transport: ReturnType<typeof ToneNS.getTransport>,
    tone: typeof ToneNS,
    instrumentMap: Map<string, ToneNS.PolySynth>,
  ): void {
    const synth = instrumentMap.get(clip.trackId);
    if (!synth) return;

    for (const note of clip.notes) {
      const startTime = (clip.startBeat + note.startBeat) * (60 / transport.bpm.value);
      const duration = note.durationBeats * (60 / transport.bpm.value);
      const noteName = this.midiToNoteName(note.pitch);
      const velocity = note.velocity / 127;

      const eventId = transport.schedule((time: number) => {
        synth.triggerAttackRelease(noteName, duration, time, velocity);
      }, startTime);

      this.scheduledEvents.push(eventId);
    }
  }

  /**
   * Clear all scheduled events from the transport.
   */
  clearAll(): void {
    const tone = this.engine.getTone();
    const transport = tone.getTransport();
    for (const id of this.scheduledEvents) {
      transport.clear(id);
    }
    this.scheduledEvents = [];
  }

  /**
   * Convert MIDI note number to note name (e.g., 60 → "C4").
   */
  private midiToNoteName(midi: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = noteNames[midi % 12];
    return `${note}${octave}`;
  }

  dispose(): void {
    this.clearAll();
  }
}
