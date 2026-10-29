/**
 * TEST SUPPORT ONLY: a fake AudioContext with just what the AudioEngine uses. AudioParams take
 * scheduled values at once, sources record start/stop and end when the test says so, and
 * decodeAudioData makes a buffer whose length is 100 frames per input byte (mono, 44.1 kHz).
 */

export class FakeParam {
  constructor(public value: number) {}
  setTargetAtTime(v: number): this {
    this.value = v;
    return this;
  }
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeNode {
  outputs: FakeNode[] = [];
  connect<T extends FakeNode>(node: T): T {
    this.outputs.push(node);
    return node;
  }
  disconnect(): void {
    this.outputs = [];
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}

export class FakePanner extends FakeNode {
  panningModel = 'equalpower';
  distanceModel = 'inverse';
  rolloffFactor = 1;
  positionX = new FakeParam(0);
  positionY = new FakeParam(0);
  positionZ = new FakeParam(0);
}

export class FakeBuffer {
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {}
  get duration(): number {
    return this.length / this.sampleRate;
  }
}

export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  playbackRate = new FakeParam(1);
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stopped = false;
  start(when = 0): void {
    this.startedAt = when;
  }
  stop(): void {
    this.stopped = true;
  }
  /** The sound reached its end. */
  finish(): void {
    this.onended?.();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState | 'interrupted' = 'suspended';
  sampleRate = 44100;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  panners: FakePanner[] = [];
  resumes = 0;
  suspends = 0;
  decodes = 0;
  listener = {
    positionX: new FakeParam(0),
    positionY: new FakeParam(0),
    positionZ: new FakeParam(0),
    forwardX: new FakeParam(0),
    forwardY: new FakeParam(0),
    forwardZ: new FakeParam(-1),
    upX: new FakeParam(0),
    upY: new FakeParam(1),
    upZ: new FakeParam(0),
  };
  createGain(): FakeGain {
    return new FakeGain();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createPanner(): FakePanner {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    return new FakeBuffer(channels, length, rate);
  }
  decodeAudioData(bytes: ArrayBuffer): Promise<FakeBuffer> {
    this.decodes++;
    return Promise.resolve(new FakeBuffer(1, bytes.byteLength * 100, 44100));
  }
  resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  /** Sources that are playing (started, not stopped, not finished by the test). */
  live(): FakeSource[] {
    return this.sources.filter((s) => s.startedAt !== null && !s.stopped);
  }
  asContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

/** A path from a source to the destination, as node kinds. */
export function chainOf(node: FakeNode): string[] {
  const out: string[] = [];
  let n: FakeNode | undefined = node;
  while (n) {
    out.push(n.constructor.name);
    n = n.outputs[0];
  }
  return out;
}

/** Let pending promise callbacks (fetch + decode) run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
