/**
 * Web MIDI input: any connected keyboard or controller becomes note events.
 * Thin on purpose — message decoding is `parseMidiMessage`. Client-only:
 * `navigator` is read inside functions, never at module load, so SSR is safe
 * (and `isMidiSupported()` is false there). Sysex is not requested, which also
 * keeps the browser permission prompt as light as it can be.
 */
import { createDeviceRunner } from './device-runner';
import type {
  InputAdapter,
  NoteEvent,
  NoteListener,
} from './events';
import { parseMidiMessage } from './midi-parse';

export function isMidiSupported(): boolean {
  return (
    typeof navigator !==
      'undefined' &&
    typeof navigator.requestMIDIAccess ===
      'function'
  );
}

export interface MidiDevice {
  id: string;
  name: string;
}

export type MidiInputAdapter =
  InputAdapter & {
    devices(): MidiDevice[];
    onDevicesChange(
      l: () => void,
    ): () => void;
  };

export function createMidiInput(): MidiInputAdapter {
  const listeners =
    new Set<NoteListener>();
  const deviceListeners =
    new Set<
      () => void
    >();
  const emit =
    (
      e: NoteEvent,
    ) => {
      for (const l of [
        ...listeners,
      ])
        l(
          e,
        );
    };

  let access: MIDIAccess | null =
    null;
  let bound =
    new Set<MIDIInput>();
  /** Notes currently down, so stop() can release them. */
  const held =
    new Set<number>();

  const onMessage =
    (
      e: MIDIMessageEvent,
    ) => {
      if (
        !e.data
      )
        return;
      const ev =
        parseMidiMessage(
          e.data,
          performance.now(),
        );
      if (
        !ev
      )
        return;
      if (
        ev.type ===
        'on'
      )
        held.add(
          ev.midi,
        );
      else
        held.delete(
          ev.midi,
        );
      emit(
        ev,
      );
    };

  /** Point every current input at our handler and let go of vanished ones. */
  const bindInputs =
    () => {
      if (
        !access
      )
        return;
      const current =
        new Set<MIDIInput>();
      access.inputs.forEach(
        (
          input,
        ) => {
          input.onmidimessage =
            onMessage;
          current.add(
            input,
          );
        },
      );
      bound.forEach(
        (
          input,
        ) => {
          if (
            !current.has(
              input,
            )
          )
            input.onmidimessage =
              null;
        },
      );
      bound =
        current;
    };

  const onStateChange =
    () => {
      bindInputs();
      for (const l of [
        ...deviceListeners,
      ])
        l();
    };

  /** Acquire MIDI access for one run of the lifecycle; `wanted()` turns false when a stop() arrives. */
  const open =
    async (
      wanted: () => boolean,
    ): Promise<void> => {
      if (
        !isMidiSupported()
      )
        throw new Error(
          'Web MIDI is not supported in this browser.',
        );
      const granted =
        await navigator.requestMIDIAccess(
          {
            sysex: false,
          },
        );
      // stop() arrived while the permission prompt was open: bind nothing.
      if (
        !wanted()
      )
        return;
      access =
        granted;
      granted.addEventListener(
        'statechange',
        onStateChange,
      );
      bindInputs();
      for (const l of [
        ...deviceListeners,
      ])
        l();
    };

  const release =
    () => {
      if (
        !access
      )
        return;
      access.removeEventListener(
        'statechange',
        onStateChange,
      );
      bound.forEach(
        (
          input,
        ) => {
          input.onmidimessage =
            null;
        },
      );
      bound =
        new Set();
      access =
        null;
      const now =
        performance.now();
      for (const midi of held)
        emit(
          {
            type: 'off',
            midi,
            velocity: 0,
            time: now,
            source:
              'midi',
          },
        );
      held.clear();
      for (const l of [
        ...deviceListeners,
      ])
        l();
    };

  // Start/stop/cancel is the shared device lifecycle; this adapter only says how to open and release MIDI.
  const life =
    createDeviceRunner(
      {
        launch:
          (
            _run,
            wanted,
          ) =>
            open(
              wanted,
            ),
        stopDevice:
          release,
      },
    );

  const adapter: MidiInputAdapter =
    {
      source:
        'midi',
      start:
        () =>
          life.start(),
      stop: () =>
        life.stop(),

      subscribe(
        l,
      ) {
        listeners.add(
          l,
        );
        return () => {
          listeners.delete(
            l,
          );
        };
      },

      devices() {
        const out: MidiDevice[] =
          [];
        access?.inputs.forEach(
          (
            input,
          ) => {
            if (
              input.state !==
              'disconnected'
            )
              out.push(
                {
                  id: input.id,
                  name:
                    input.name ??
                    'MIDI device',
                },
              );
          },
        );
        return out;
      },

      onDevicesChange(
        l,
      ) {
        deviceListeners.add(
          l,
        );
        return () => {
          deviceListeners.delete(
            l,
          );
        };
      },
    };
  return adapter;
}
