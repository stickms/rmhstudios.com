/**
 * What a card side's sound looks and reads like (s10-02), rendered to static markup: a play button that names its
 * side, described by the transcript (the sound's text alternative) for assistive technology at all times, and a
 * visible transcript only once the answer is revealed. No audio element exists until the button is pressed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));

import { CardSound } from '../CardSound';

const sound = { url: '/api/study/card-sound/me-abc.webm', transcript: 'Hola, ¿cómo estás?', durationMs: 4200 };
const root = join(__dirname, '..', '..', '..');

/** The element with this id, as markup. */
const byId = (html: string, id: string) =>
  new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>[^<]*</[a-z]+>`).exec(html)?.[0] ?? '';

describe('CardSound', () => {
  it('names the side on the button and describes it with the transcript', () => {
    const html = renderToStaticMarkup(<CardSound sound={sound} side="front" showTranscript={false} />);
    expect(html).toContain('aria-label="Play the front’s sound"');
    const described = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(described).toBeTruthy();
    const description = byId(html, described!);
    expect(description).toContain('Transcript: Hola, ¿cómo estás?');
    expect(description).toContain('sr-only');
    expect(description).toContain('dir="auto"');
    expect(renderToStaticMarkup(<CardSound sound={sound} side="back" showTranscript={false} />)).toContain(
      'aria-label="Play the back’s sound"',
    );
  });

  it('shows the length beside the button', () => {
    expect(renderToStaticMarkup(<CardSound sound={sound} side="back" showTranscript={false} />)).toContain('0:04');
  });

  it('keeps the transcript off the page until the answer is revealed', () => {
    const hidden = renderToStaticMarkup(<CardSound sound={sound} side="front" showTranscript={false} />);
    expect(hidden).not.toContain('data-card-sound-transcript');
    // Only the assistive-technology description carries the text.
    expect(hidden.split('Hola, ¿cómo estás?')).toHaveLength(2);
    const shown = renderToStaticMarkup(<CardSound sound={sound} side="front" showTranscript />);
    expect(shown).toContain('data-card-sound-transcript');
    expect(shown).toMatch(/<p dir="auto"[^>]*data-card-sound-transcript[^>]*>Hola, ¿cómo estás\?<\/p>/);
  });

  it('creates no audio element and loads nothing at rest', () => {
    const html = renderToStaticMarkup(<CardSound sound={sound} side="front" showTranscript />);
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('src=');
    expect(html).not.toContain('autoplay');
  });
});

describe('review', () => {
  const review = readFileSync(join(root, 'components/study/ReviewAll.tsx'), 'utf8');

  it('shows the front transcript only once revealed, and the back’s only on the revealed side', () => {
    expect(review).toMatch(/side="front"\s+showTranscript=\{revealed\}/);
    // The back sound sits inside the revealed branch, with its transcript.
    const revealedBranch = review.slice(review.indexOf('{revealed && ('));
    expect(revealedBranch).toMatch(/<CardSound sound=\{card\.backSound\} side="back" showTranscript/);
  });

  it('binds p to the current side’s sound only while review is mounted, never to a text field', () => {
    expect(review).toMatch(/e\.key === 'p'/);
    expect(review.indexOf("tag === 'INPUT'")).toBeLessThan(review.indexOf("e.key === 'p'"));
    // Nothing plays by itself.
    expect(review).not.toMatch(/autoPlay|autoplay/);
  });
});
