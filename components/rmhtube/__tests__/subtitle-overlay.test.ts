import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SubtitleOverlay, { SubtitleCueText } from '@/components/rmhtube/SubtitleOverlay';
import { createPositionBus } from '@/lib/rmhtube/subtitle-prefs';

const cues = [
  { start: 0, end: 1000, text: 'Hello' },
  { start: 1000, end: 2000, text: 'World' },
];

describe('the overlay', () => {
  it('renders a cue as escaped text, never as markup', () => {
    const html = renderToStaticMarkup(
      createElement(SubtitleCueText, {
        cue: { start: 0, end: 1, text: '<b>bold</b><img src=x onerror=1>' },
        size: 'medium',
      }),
    );
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;&lt;img src=x onerror=1&gt;');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<img');
    expect(html).toContain('dir="auto"');
  });

  it('renders nothing without a cue, and nothing on the server before a position arrives', () => {
    expect(renderToStaticMarkup(createElement(SubtitleCueText, { cue: null, size: 'small' }))).toBe('');
    expect(
      renderToStaticMarkup(createElement(SubtitleOverlay, { cues, bus: createPositionBus(), size: 'large' })),
    ).toBe('');
  });

  it('never reaches for innerHTML, dangerouslySetInnerHTML or a track element', () => {
    const src = readFileSync(path.resolve(__dirname, '../SubtitleOverlay.tsx'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/dangerouslySetInnerHTML|innerHTML|<track/);
  });
});
