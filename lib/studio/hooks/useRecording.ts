import { useEffect, useMemo, useRef } from 'react';
import { useStudioStore } from '../store';
import { StudioEngine } from '../engine/StudioEngine';
import { recordReaction, recordRefusal, type RecordEvent } from '../record';
import { commitTakeClips, takeClips } from '../record-commit';
import { selectLiveInput, useLiveMidi } from '../midi/live-store';

/** What the shell tells the member about a take; the shell owns the words. */
export type RecordNotice = 'no-armed-track' | 'loop-on' | 'engine-failed' | 'empty-take' | 'take-saved';

export interface UseRecordingOptions {
  notify: (notice: RecordNotice) => void;
  /** The name given to each clip a take makes (translated by the caller). */
  clipName: string;
}

interface Session {
  startSeconds: number;
  events: RecordEvent[];
  trackIds: string[];
  bpm: number;
  beatsPerBar: number;
  /** The typing keyboard was switched on for this take and goes back off when it ends. */
  enabledTyping: boolean;
}

/** The synth that sounds notes while a take is running, and the Tone transport the take is timed against. */
interface Live {
  synth: {
    triggerAttack: (f: number, t?: number, v?: number) => void;
    triggerRelease: (f: number) => void;
    releaseAll: () => void;
    dispose: () => void;
  };
  frequency: (pitch: number) => number;
  seconds: () => number;
}

const store = () => useStudioStore.getState();

/**
 * useRecording — captures what the member plays into armed MIDI tracks.
 *
 * Pressing record (button or key) flips `isRecording` in the store. This hook watches that flag: it plays a
 * one-bar count-in, rolls the transport from the playhead, and stamps every note-on and note-off with the
 * transport's own clock (no animation frame, no polling: events arrive from the keyboard and MIDI listeners, the
 * count-in is a handful of one-shot timeouts). When the take ends it becomes one new MIDI clip on each armed
 * track, in ONE history step ("Record take"). Mount it once, in the Studio shell, and pass the returned handlers
 * to `useKeybinds` for the typing keyboard.
 */
export function useRecording(options: UseRecordingOptions): {
  noteOn: (pitch: number, velocity: number) => void;
  noteOff: (pitch: number) => void;
} {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  }, [options]);

  const sessionRef = useRef<Session | null>(null);
  const liveRef = useRef<Live | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Bumped by every begin and end, so a begin that was cancelled while it waited for the engine does nothing. */
  const runRef = useRef(0);

  const clickRef = useRef<{ dispose: () => void } | null>(null);

  /** Cancel the count-in: its timeouts and the click synth that belongs to them. */
  const clearTimers = () => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
    const click = clickRef.current;
    clickRef.current = null;
    try {
      click?.dispose();
    } catch {
      // The audio graph may already be gone.
    }
  };

  const releaseLive = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live) return;
    try {
      live.synth.releaseAll();
      live.synth.dispose();
    } catch {
      // The audio graph may already be gone.
    }
  };

  const feed = useRef((kind: 'on' | 'off', pitch: number, velocity: number, secondsAgo = 0) => {
    const session = sessionRef.current;
    const live = liveRef.current;
    if (!session || !live || store().recordPhase !== 'recording') return;
    session.events.push({ kind, pitch, velocity, seconds: live.seconds() - Math.max(0, secondsAgo) });
    try {
      if (kind === 'on') live.synth.triggerAttack(live.frequency(pitch), undefined, velocity / 127);
      else live.synth.triggerRelease(live.frequency(pitch));
    } catch {
      // Monitoring is a convenience; the note is already recorded.
    }
  }).current;

  useEffect(() => {
    const runs = runRef;
    const roll = async (run: number): Promise<void> => {
      if (run !== runRef.current) return;
      const s = store();
      const engine = StudioEngine.getInstance();
      const tone = engine.getTone();
      const transport = tone.getTransport();
      const armed = s.tracks.filter((t) => t.type === 'midi' && t.armed);
      const bpm = s.bpm;
      const startBeat = s.currentBeat;
      const wasPlaying = s.isPlaying;
      transport.seconds = (startBeat * 60) / bpm;
      transport.start();
      s.setCurrentBeat(startBeat);
      try {
        // Notes sound through a synth on the first armed track's channel while the take runs.
        const synth = new tone.PolySynth(tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
          volume: -8,
        }).connect(engine.getTrackChannel(armed[0]?.id ?? '') ?? tone.getDestination());
        liveRef.current = {
          synth,
          frequency: (pitch) => tone.Frequency(pitch, 'midi').toFrequency(),
          seconds: () => transport.seconds,
        };

        let enabledTyping = false;
        if (!s.typingKeyboardEnabled) {
          s.setTypingKeyboardEnabled(true);
          enabledTyping = true;
        }
        sessionRef.current = {
          startSeconds: transport.seconds,
          events: [],
          trackIds: armed.map((t) => t.id),
          bpm,
          beatsPerBar: s.timeSignature[0] * (4 / s.timeSignature[1]),
          enabledTyping,
        };
        s.setRecordPhase('recording');
        if (!wasPlaying) s.setIsPlaying(true);
      } catch (error) {
        // The transport was started for this take; a take that never armed must not leave it rolling.
        sessionRef.current = null;
        releaseLive();
        if (!wasPlaying) {
          try {
            transport.pause();
          } catch {
            // The audio graph may already be gone.
          }
        }
        throw error;
      }
    };

    const begin = async () => {
      const run = ++runRef.current;
      const s = store();
      const refusal = recordRefusal(s);
      if (refusal) {
        s.setIsRecording(false);
        optsRef.current.notify(refusal);
        return;
      }
      try {
        const engine = StudioEngine.getInstance();
        if (!engine.initialized) await engine.initialize();
        if (run !== runRef.current) return;
        const tone = engine.getTone();
        const beatMs = 60000 / s.bpm;
        const clicks = Math.max(1, Math.round(s.timeSignature[0] * (4 / s.timeSignature[1])));
        if (s.settings.recordCountIn && !s.isPlaying) {
          // The bar of clicks, one-shot timeouts that end with the bar (nothing is pending at rest).
          s.setRecordPhase('count-in');
          const click = new tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
            volume: -12,
          }).toDestination();
          clickRef.current = click;
          const tick = (i: number) => {
            click.triggerAttackRelease(i === 0 ? 'C6' : 'C5', '32n');
          };
          tick(0);
          for (let i = 1; i < clicks; i++) timersRef.current.push(setTimeout(() => tick(i), i * beatMs));
          timersRef.current.push(
            setTimeout(() => {
              clickRef.current = null;
              click.dispose();
              if (run !== runRef.current) return;
              void roll(run).catch(() => {
                s.setIsRecording(false);
                optsRef.current.notify('engine-failed');
              });
            }, clicks * beatMs),
          );
        } else {
          await roll(run);
        }
      } catch {
        if (run === runRef.current) {
          store().setIsRecording(false);
          optsRef.current.notify('engine-failed');
        }
      }
    };

    const end = () => {
      runRef.current++;
      clearTimers();
      const session = sessionRef.current;
      const live = liveRef.current;
      sessionRef.current = null;
      const s = store();
      // A project switch resets the phase to idle in the same update that clears `isRecording`: that take is
      // dropped, never written into the other project.
      const dropped = session !== null && s.recordPhase === 'idle';
      s.setRecordPhase('idle');
      if (!session || !live) {
        releaseLive();
        if (session?.enabledTyping) s.setTypingKeyboardEnabled(false);
        return;
      }
      const endSeconds = live.seconds();
      releaseLive();
      if (session.enabledTyping) s.setTypingKeyboardEnabled(false);
      if (dropped) return;

      const now = store();
      const targets = session.trackIds.flatMap((id) => now.tracks.filter((t) => t.id === id));
      const clips = takeClips(
        targets,
        session.events,
        {
          bpm: session.bpm,
          beatsPerBar: session.beatsPerBar,
          startSeconds: session.startSeconds,
          endSeconds,
          latencyMs: now.settings.inputLatencyMs,
          quantize: now.settings.recordQuantize,
          newId: () => crypto.randomUUID(),
        },
        optsRef.current.clipName,
      );
      if (!commitTakeClips(clips)) {
        optsRef.current.notify('empty-take');
        return;
      }
      optsRef.current.notify('take-saved');
    };

    const unsubscribe = useStudioStore.subscribe((s, prev) => {
      switch (recordReaction(s, prev)) {
        case 'begin':
          void begin();
          break;
        case 'end':
          end();
          break;
        case 'stop-take':
          s.setIsRecording(false);
          break;
        case 'cancel-count-in':
          // Ends the take first (nothing was recorded), then undoes the play press.
          s.setIsRecording(false);
          store().setIsPlaying(false);
          break;
        case null:
          break;
      }
    });
    return () => {
      unsubscribe();
      // Leaving the Studio mid-take drops it; nothing is written.
      runs.current++;
      clearTimers();
      const session = sessionRef.current;
      sessionRef.current = null;
      releaseLive();
      if (session?.enabledTyping) store().setTypingKeyboardEnabled(false);
      if (store().recordPhase !== 'idle') store().setRecordPhase('idle');
      if (store().isRecording) store().setIsRecording(false);
    };
  }, [feed]);

  // The chosen MIDI input feeds the same recorder; it is only bound once the member has allowed MIDI access.
  const midiStatus = useLiveMidi((s) => s.status);
  const midiInputs = useLiveMidi((s) => s.inputs);
  const midiName = useStudioStore((s) => s.settings.midiInputName);
  useEffect(() => {
    if (midiStatus !== 'ready') return;
    selectLiveInput(midiName, (e, timeStamp) => {
      const late = typeof performance !== 'undefined' && timeStamp > 0 ? (performance.now() - timeStamp) / 1000 : 0;
      feed(e.kind, e.pitch, e.velocity, late);
    });
    return () => {
      selectLiveInput(null, () => undefined);
    };
  }, [midiStatus, midiInputs, midiName, feed]);
  useEffect(
    () => () => {
      useLiveMidi.getState().disable();
    },
    [],
  );

  return useMemo(
    () => ({
      noteOn: (pitch: number, velocity: number) => feed('on', pitch, velocity),
      noteOff: (pitch: number) => feed('off', pitch, 0),
    }),
    [feed],
  );
}
