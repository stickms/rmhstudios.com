/**
 * MidiEngine — handles WebMIDI API for hardware controller input.
 */
export class MidiEngine {
  private access: MIDIAccess | null = null;
  private onNoteOn: ((note: number, velocity: number, channel: number) => void) | null = null;
  private onNoteOff: ((note: number, channel: number) => void) | null = null;
  private onCC: ((cc: number, value: number, channel: number) => void) | null = null;

  async initialize(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      console.warn('WebMIDI not supported in this browser');
      return false;
    }

    try {
      this.access = await navigator.requestMIDIAccess();
      this.setupInputs();

      // Listen for new devices
      this.access.onstatechange = () => this.setupInputs();
      return true;
    } catch (err) {
      console.warn('MIDI access denied:', err);
      return false;
    }
  }

  setOnNoteOn(cb: (note: number, velocity: number, channel: number) => void) {
    this.onNoteOn = cb;
  }

  setOnNoteOff(cb: (note: number, channel: number) => void) {
    this.onNoteOff = cb;
  }

  setOnCC(cb: (cc: number, value: number, channel: number) => void) {
    this.onCC = cb;
  }

  getInputs(): { id: string; name: string }[] {
    if (!this.access) return [];
    const inputs: { id: string; name: string }[] = [];
    this.access.inputs.forEach((input) => {
      inputs.push({ id: input.id, name: input.name || 'Unknown MIDI Device' });
    });
    return inputs;
  }

  dispose() {
    if (this.access) {
      this.access.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
    }
    this.access = null;
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.onCC = null;
  }

  private setupInputs() {
    if (!this.access) return;

    this.access.inputs.forEach((input) => {
      input.onmidimessage = (e: MIDIMessageEvent) => {
        const data = e.data;
        if (!data || data.length < 2) return;

        const status = data[0] & 0xF0;
        const channel = data[0] & 0x0F;

        switch (status) {
          case 0x90: // Note On
            if (data[2] > 0) {
              this.onNoteOn?.(data[1], data[2], channel);
            } else {
              this.onNoteOff?.(data[1], channel);
            }
            break;
          case 0x80: // Note Off
            this.onNoteOff?.(data[1], channel);
            break;
          case 0xB0: // Control Change
            this.onCC?.(data[1], data[2], channel);
            break;
        }
      };
    });
  }
}
