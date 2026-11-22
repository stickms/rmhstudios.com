/**
 * Member text keeps its own direction (sprint 09, feature 20): the post body is a `dir="auto"` block, and a display
 * name in a header sits in a `<bdi>` so the words around it cannot reorder it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => createElement('a', null, children as never),
}));
vi.mock('@/components/safety/SafeLink', () => ({
  SafeLink: ({ children }: { children?: unknown }) => createElement('a', null, children as never),
}));

const { RMHarkContent } = await import('../RMHarkContent');
const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('RMHarkContent direction', () => {
  it('renders the body element with dir="auto"', () => {
    const out = renderToStaticMarkup(createElement(RMHarkContent, { text: 'Is this ready?', className: 't-post' }));
    expect(out).toMatch(/^<p dir="auto" class="t-post">/);
  });

  it('keeps Arabic text and a trailing question mark inside the one block', () => {
    const out = renderToStaticMarkup(createElement(RMHarkContent, { text: 'مرحبا بالعالم؟' }));
    expect(out).toContain('dir="auto"');
    expect(out).toContain('مرحبا بالعالم؟');
  });

  it('keeps the block direction when the text is only a link or a spoiler-free run', () => {
    const out = renderToStaticMarkup(createElement(RMHarkContent, { text: '**bold** مرحبا' }));
    expect(out.match(/dir="auto"/g)).toHaveLength(1);
  });
});

describe('names in headers', () => {
  it('the post header wraps the display name in <bdi>', () => {
    expect(read('components/feed/FeedRow.tsx')).toMatch(/<bdi[^>]*>\s*\{displayName\}\s*<\/bdi>/);
  });

  it('the comment header wraps the display name and the handle in <bdi>', () => {
    const src = read('components/feed/CommentItem.tsx');
    expect(src).toMatch(/<bdi[^>]*>\{displayName\}<\/bdi>/);
    expect(src).toContain('<bdi>{`@${freshCommentUser.handle}`}</bdi>');
  });

  it('"replying to" isolates the handle it interpolates', () => {
    expect(read('components/feed/CommentItem.tsx')).toContain('handle: isolateText(replyingTo)');
  });
});
