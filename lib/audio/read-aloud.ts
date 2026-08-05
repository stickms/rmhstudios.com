/**
 * Read-aloud over the Web Speech API (plan A11).
 *
 * Turns an article — the blog, news, a library page, a long post — into speech,
 * reporting which paragraph is being spoken so the page can highlight it and
 * scroll along. No network, no audio pipeline, no licence: the voice is the
 * one the reader's OS already has, which is also the one their screen reader
 * uses and the one they have tuned.
 *
 * Client-only. `createReader` returns `null` where speech synthesis does not
 * exist (SSR, older WebViews, hardened browsers) — a null return is the "no
 * read-aloud button here" signal, which is better than a button that does
 * nothing.
 */

export type ReaderState = 'idle' | 'playing' | 'paused' | 'ended';

export interface ReaderOptions {
  /**
   * Fires when a new paragraph starts, with its index in the array passed to
   * `createReader` — the caller's own paragraph indices, so highlighting is a
   * direct lookup.
   */
  onParagraph?: (index: number, text: string) => void;
  /** Fires on every state transition (drives the play/pause button). */
  onStateChange?: (state: ReaderState) => void;
  /** 0.1–10, default 1. */
  rate?: number;
  /** 0–2, default 1. */
  pitch?: number;
  /** 0–1, default 1. */
  volume?: number;
}

export interface Reader {
  /** Start, or resume from a pause. `from` restarts at that paragraph index. */
  play: (from?: number) => void;
  pause: () => void;
  /** Stop and rewind to the top. */
  stop: () => void;
  /** Current state. */
  readonly state: ReaderState;
  /** Paragraph index currently being spoken, or -1 when idle. */
  readonly index: number;
  /** Stop and drop all listeners. Call from a component's cleanup. */
  destroy: () => void;
}

/**
 * Longest utterance we queue. Chrome silently stops synthesising after roughly
 * fifteen seconds of a single utterance — a mid-article paragraph is well past
 * that — so paragraphs are split into sentence-sized chunks instead. Chunking
 * is the structural fix; the widely-copied `pause()/resume()` watchdog only
 * masks it and makes the audio stutter.
 */
const MAX_CHUNK_CHARS = 180;

/** One queued utterance: the text to speak plus the paragraph it came from. */
interface Chunk {
  paragraph: number;
  text: string;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Split a paragraph on sentence boundaries, packing chunks up to the cap. */
function chunkParagraph(text: string, paragraph: number): Chunk[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return [];
  if (flat.length <= MAX_CHUNK_CHARS) return [{ paragraph, text: flat }];

  // Keep the terminator on the sentence so the voice keeps its intonation.
  const sentences = flat.match(/[^.!?…]+[.!?…]*\s*/g) ?? [flat];
  const chunks: Chunk[] = [];
  let buffer = '';
  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length > MAX_CHUNK_CHARS) {
      chunks.push({ paragraph, text: buffer.trim() });
      buffer = '';
    }
    // A single sentence longer than the cap is spoken whole — breaking mid
    // clause sounds worse than risking the cutoff, and it is rare in prose.
    buffer += sentence;
  }
  if (buffer.trim()) chunks.push({ paragraph, text: buffer.trim() });
  return chunks;
}

/**
 * Pick a voice for `lang`. Exact locale first (`pt-BR` over `pt-PT`), then the
 * base language, then whatever the browser defaults to.
 */
function pickVoice(synth: SpeechSynthesis, lang: string): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices.length) return null; // still loading — the default voice is fine
  const wanted = lang.toLowerCase();
  const base = wanted.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === wanted) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(`${base}-`)) ??
    voices.find((v) => v.lang.toLowerCase() === base) ??
    null
  );
}

export function createReader(
  paragraphs: readonly string[],
  { onParagraph, onStateChange, rate = 1, pitch = 1, volume = 1 }: ReaderOptions = {},
): Reader | null {
  if (!speechSupported()) return null;
  const synth = window.speechSynthesis;

  const chunks = paragraphs.flatMap((text, i) => chunkParagraph(text, i));
  if (!chunks.length) return null;

  let state: ReaderState = 'idle';
  let cursor = 0;
  /** Last paragraph announced, so `onParagraph` fires once per paragraph. */
  let announced = -1;
  let destroyed = false;

  const setState = (next: ReaderState) => {
    if (state === next) return;
    state = next;
    onStateChange?.(next);
  };

  const speak = (at: number) => {
    if (destroyed || at >= chunks.length) {
      cursor = chunks.length;
      announced = -1;
      setState('ended');
      return;
    }
    cursor = at;
    const chunk = chunks[at];
    const utterance = new SpeechSynthesisUtterance(chunk.text);

    // The document's language, read at speak time — NOT a constant. i18next
    // swaps `<html lang>` when the visitor changes locale, and a hardcoded
    // 'en-US' here would read Arabic, Japanese and Turkish articles with an
    // English voice, i.e. as gibberish.
    const lang = document.documentElement.lang || 'en';
    utterance.lang = lang;
    const voice = pickVoice(synth, lang);
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    utterance.onstart = () => {
      if (destroyed) return;
      setState('playing');
      if (chunk.paragraph !== announced) {
        announced = chunk.paragraph;
        onParagraph?.(chunk.paragraph, paragraphs[chunk.paragraph]);
      }
    };
    utterance.onend = () => {
      // `cancel()` also fires `onend`; the state check keeps a stop from
      // immediately starting the next chunk.
      if (destroyed || state !== 'playing') return;
      speak(at + 1);
    };
    utterance.onerror = () => {
      if (destroyed) return;
      setState('idle');
    };

    synth.speak(utterance);
  };

  const stop = () => {
    setState('idle');
    cursor = 0;
    announced = -1;
    synth.cancel();
  };

  return {
    play: (from?: number) => {
      if (destroyed) return;
      if (from === undefined && state === 'paused') {
        synth.resume();
        setState('playing');
        return;
      }
      // Safari and Chrome keep ONE global utterance queue per document, so a
      // second reader (or a re-play) has to clear whatever is still queued or
      // the two articles interleave.
      synth.cancel();
      const start = from === undefined ? 0 : chunks.findIndex((c) => c.paragraph >= from);
      announced = -1;
      setState('playing');
      speak(start === -1 ? 0 : start);
    },
    pause: () => {
      if (destroyed || state !== 'playing') return;
      synth.pause();
      setState('paused');
    },
    stop,
    get state() {
      return state;
    },
    get index() {
      if (state === 'idle' || state === 'ended') return -1;
      return chunks[cursor]?.paragraph ?? -1;
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      // Guaranteed: an unmounted article must not keep talking.
      synth.cancel();
      state = 'idle';
    },
  };
}
