import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReader, speechSupported, type ReaderState } from '../read-aloud';

class FakeUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

/** A synth that plays the head of its queue when `tick()` is called. */
function makeSynth(voices: Array<{ voiceURI: string; lang: string }> = []) {
  const queue: FakeUtterance[] = [];
  const spoken: FakeUtterance[] = [];
  const synth = {
    speak: vi.fn((u: FakeUtterance) => queue.push(u)),
    cancel: vi.fn(() => {
      queue.length = 0;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => voices,
  };
  return {
    synth,
    spoken,
    /** Start the next queued utterance and finish it. */
    tick() {
      const u = queue.shift();
      if (!u) return undefined;
      spoken.push(u);
      u.onstart?.();
      u.onend?.();
      return u;
    },
    /** Start the next queued utterance without finishing it. */
    start() {
      const u = queue.shift();
      u?.onstart?.();
      return u;
    },
  };
}

function install(fake: ReturnType<typeof makeSynth>, lang = 'en') {
  vi.stubGlobal('window', { speechSynthesis: fake.synth });
  vi.stubGlobal('document', { documentElement: { lang } });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
}

describe('read-aloud', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('returns null without the API, and for no text', () => {
    vi.stubGlobal('window', {});
    expect(speechSupported()).toBe(false);
    expect(createReader(['Hello'])).toBeNull();
    install(makeSynth());
    expect(createReader([])).toBeNull();
    expect(createReader(['   '])).toBeNull();
  });

  it('announces paragraphs once, in order, and ends', () => {
    const fake = makeSynth();
    install(fake);
    const seen: Array<[number, string]> = [];
    const states: ReaderState[] = [];
    const reader = createReader(['One.', 'Two.', 'Three.'], {
      onParagraph: (i, text) => seen.push([i, text]),
      onStateChange: (s) => states.push(s),
    })!;
    reader.play();
    fake.tick();
    fake.tick();
    fake.tick();
    expect(seen).toEqual([
      [0, 'One.'],
      [1, 'Two.'],
      [2, 'Three.'],
    ]);
    expect(states).toEqual(['playing', 'ended']);
    expect(reader.index).toBe(-1);
  });

  it('announces a long paragraph once although it is spoken in chunks', () => {
    const fake = makeSynth();
    install(fake);
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const seen: number[] = [];
    createReader([long, 'Next.'], { onParagraph: (i) => seen.push(i) })!.play();
    while (fake.tick());
    expect(fake.spoken.length).toBeGreaterThan(2);
    expect(seen).toEqual([0, 1]);
  });

  it('pauses, resumes and stops', () => {
    const fake = makeSynth();
    install(fake);
    const reader = createReader(['One.', 'Two.'])!;
    reader.play();
    fake.start();
    expect(reader.state).toBe('playing');
    fake.synth.resume.mockClear();
    reader.pause();
    expect(reader.state).toBe('paused');
    expect(fake.synth.pause).toHaveBeenCalled();
    reader.play();
    expect(reader.state).toBe('playing');
    expect(fake.synth.resume).toHaveBeenCalledTimes(1);
    reader.stop();
    expect(reader.state).toBe('idle');
    expect(reader.index).toBe(-1);
    expect(fake.synth.cancel).toHaveBeenCalled();
  });

  it('a stale end from a cancelled chain does not advance the new one', () => {
    const fake = makeSynth();
    install(fake);
    const reader = createReader(['One.', 'Two.', 'Three.'])!;
    reader.play();
    const first = fake.start()!;
    reader.play(2);
    first.onend?.();
    expect(fake.synth.speak).toHaveBeenCalledTimes(2);
    fake.start();
    expect(reader.index).toBe(2);
  });

  it('applies a new rate and voice from the next utterance', () => {
    const fake = makeSynth([
      { voiceURI: 'a', lang: 'en-US' },
      { voiceURI: 'b', lang: 'en-GB' },
    ]);
    install(fake);
    const reader = createReader(['One.', 'Two.'], { rate: 1 })!;
    reader.play();
    const first = fake.start()!;
    expect(first.rate).toBe(1);
    expect((first.voice as { voiceURI: string }).voiceURI).toBe('a');
    reader.setRate(1.5);
    reader.setVoice('b');
    first.onend?.();
    const second = fake.start()!;
    expect(second.rate).toBe(1.5);
    expect((second.voice as { voiceURI: string }).voiceURI).toBe('b');
  });

  it('speaks in the page language and falls back when a saved voice is missing', () => {
    const fake = makeSynth([{ voiceURI: 'ar1', lang: 'ar-SA' }]);
    install(fake, 'ar');
    const reader = createReader(['مرحبا'], { voiceURI: 'gone' })!;
    reader.play();
    const u = fake.tick()!;
    expect(u.lang).toBe('ar');
    expect((u.voice as { voiceURI: string }).voiceURI).toBe('ar1');
  });

  it('an explicit lang picks the voice and the utterance language, whatever the page says', () => {
    const fake = makeSynth([
      { voiceURI: 'en1', lang: 'en-US' },
      { voiceURI: 'es-es', lang: 'es-ES' },
      { voiceURI: 'es-mx', lang: 'es-MX' },
    ]);
    install(fake, 'en');
    const reader = createReader(['Hola'], { lang: 'es-MX' })!;
    reader.play();
    const u = fake.tick()!;
    expect(u.lang).toBe('es-MX');
    expect((u.voice as { voiceURI: string }).voiceURI).toBe('es-mx');
  });

  it('an explicit lang falls back to the base language, and a saved voice still wins when installed', () => {
    const fake = makeSynth([
      { voiceURI: 'en1', lang: 'en-US' },
      { voiceURI: 'es-es', lang: 'es-ES' },
    ]);
    install(fake, 'en');
    const first = createReader(['Hola'], { lang: 'es-MX' })!;
    first.play();
    expect((fake.tick()!.voice as { voiceURI: string }).voiceURI).toBe('es-es');
    const second = createReader(['Hola'], { lang: 'es-MX', voiceURI: 'en1' })!;
    second.play();
    expect((fake.tick()!.voice as { voiceURI: string }).voiceURI).toBe('en1');
  });

  it('without a lang the document language is read at speak time, as before', () => {
    const fake = makeSynth([{ voiceURI: 'en1', lang: 'en-US' }]);
    install(fake, 'en');
    const reader = createReader(['One.', 'Two.'])!;
    reader.play();
    const first = fake.start()!;
    expect(first.lang).toBe('en');
    // The visitor changes locale between the two utterances: the next one follows.
    vi.stubGlobal('document', { documentElement: { lang: 'fr' } });
    first.onend?.();
    expect(fake.start()!.lang).toBe('fr');
  });

  it('play(from) starts at that paragraph and destroy silences the voice', () => {
    const fake = makeSynth();
    install(fake);
    const seen: number[] = [];
    const reader = createReader(['A.', 'B.', 'C.'], { onParagraph: (i) => seen.push(i) })!;
    reader.play(1);
    fake.start();
    expect(seen).toEqual([1]);
    reader.destroy();
    expect(reader.state).toBe('idle');
    expect(fake.synth.cancel).toHaveBeenCalled();
    reader.play();
    expect(fake.synth.speak).toHaveBeenCalledTimes(1);
  });
});
