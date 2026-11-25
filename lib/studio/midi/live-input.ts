/**
 * Live MIDI input for recording. Web MIDI access is requested only when the member asks (`requestMidiAccess`),
 * never on load. Message parsing is pure (`parseMidiMessages`); the rest is a thin shell over the browser API.
 * Client-only: `navigator` is read inside functions, so the module is safe to load on the server.
 */

export interface LiveNoteEvent {
  kind: 'on' | 'off';
  pitch: number;
  velocity: number;
  /** 0-15. Every channel is recorded. */
  channel: number;
}

export interface LiveMidiInput {
  id: string;
  name: string;
}

/**
 * Decode raw MIDI bytes into note events. Handles running status (data bytes with no status byte repeat the last
 * channel message), note-on with velocity 0 as note-off, and skips every other message: system messages (0xF0+)
 * are ignored and do not disturb running status, except that system common messages cancel it as the spec says.
 * `running` carries the running status between calls for one input.
 */
export function parseMidiMessages(
  data: ArrayLike<number>,
  running: { status: number } = { status: 0 },
): LiveNoteEvent[] {
  const out: LiveNoteEvent[] = [];
  let i = 0;
  while (i < data.length) {
    const byte = data[i] ?? 0;
    let status: number;
    if (byte & 0x80) {
      if (byte >= 0xf8) {
        // Real-time (clock, start, stop): may appear anywhere and never changes running status.
        i += 1;
        continue;
      }
      if (byte >= 0xf0) {
        // System exclusive and system common: skip to the next status byte and drop running status.
        running.status = 0;
        i += 1;
        while (i < data.length && !((data[i] ?? 0) & 0x80)) i += 1;
        continue;
      }
      status = byte;
      running.status = byte;
      i += 1;
    } else {
      status = running.status;
      if (!status) {
        i += 1;
        continue;
      }
    }
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    // Program change and channel pressure carry one data byte; every other channel message carries two.
    const length = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
    if (i + length > data.length) break;
    const d1 = (data[i] ?? 0) & 0x7f;
    const d2 = length === 2 ? (data[i + 1] ?? 0) & 0x7f : 0;
    i += length;
    if (kind === 0x90) out.push({ kind: d2 === 0 ? 'off' : 'on', pitch: d1, velocity: d2, channel });
    else if (kind === 0x80) out.push({ kind: 'off', pitch: d1, velocity: d2, channel });
  }
  return out;
}

export function isMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

export interface LiveMidiSession {
  /** The inputs connected right now. */
  inputs(): LiveMidiInput[];
  /** Listen to one input by name (the setting stores the name); null stops listening. Returns false if absent. */
  select(name: string | null, onNote: (e: LiveNoteEvent, timeStamp: number) => void): boolean;
  /** Called when a controller is plugged in or removed. */
  onChange(listener: () => void): () => void;
  /** Stop listening and release the handlers. */
  close(): void;
}

/** Ask the browser for MIDI access. Rejects when the member or the browser refuses. Sysex is not requested. */
export async function requestMidiAccess(): Promise<LiveMidiSession> {
  if (!isMidiSupported()) throw new Error('midi-unsupported');
  const access = await navigator.requestMIDIAccess({ sysex: false });
  let bound: MIDIInput | null = null;
  let running = { status: 0 };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  access.onstatechange = notify;

  const list = (): MIDIInput[] => {
    const all: MIDIInput[] = [];
    access.inputs.forEach((i) => {
      if (i.state !== 'disconnected') all.push(i);
    });
    return all;
  };
  const unbind = () => {
    if (bound) bound.onmidimessage = null;
    bound = null;
    running = { status: 0 };
  };

  return {
    inputs: () => list().map((i) => ({ id: i.id, name: i.name ?? i.id })),
    select(name, onNote) {
      unbind();
      if (name === null) return true;
      const found = list().find((i) => (i.name ?? i.id) === name);
      if (!found) return false;
      bound = found;
      found.onmidimessage = (e: MIDIMessageEvent) => {
        if (!e.data) return;
        for (const ev of parseMidiMessages(e.data, running)) onNote(ev, e.timeStamp);
      };
      return true;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      unbind();
      access.onstatechange = null;
      listeners.clear();
    },
  };
}
