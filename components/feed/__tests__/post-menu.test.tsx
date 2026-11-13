/**
 * The three dots (owner, 2026-11-13): every post on the home feed has a menu behind them, every "More" that opens a
 * menu is the same trigger, and the feed row does not pay for the menu until one is opened.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostMenuTrigger } from '../PostMenuTrigger';

const read = (name: string) => readFileSync(join(__dirname, '..', name), 'utf8');

describe('the post menu trigger', () => {
  it('is an icon-only button that names itself and says it opens a menu', () => {
    const out = renderToString(createElement(PostMenuTrigger, { label: 'Post actions', open: false }));
    expect(out).toMatch(/^<button type="button" aria-label="Post actions" title="Post actions" aria-haspopup="menu" aria-expanded="false"/);
    // The glyph is decoration; the name is the label.
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(out).not.toMatch(/>More</);
    expect(renderToString(createElement(PostMenuTrigger, { label: 'Post actions', open: true }))).toContain(
      'aria-expanded="true"',
    );
  });

  it('keeps a 44px hit area without making its line taller', () => {
    const css = read('feed.css');
    expect(css).toMatch(/\.feed-actions \.feed-action::after,\s*\.feed-action--icon::after \{\s*inset: -14px;/);
    expect(css).toMatch(/\.feed-action__icon \{[^}]*inline-size: 16px;\s*block-size: 16px;/);
  });
});

describe('where the dots are', () => {
  it('on the home feed row, the post card, the post page and a reply: one trigger', () => {
    for (const file of ['FeedRow.tsx', 'RMHarkOverflowMenu.tsx', 'CommentItem.tsx']) {
      expect(read(file), file).toContain('<PostMenuTrigger');
    }
    // No menu is opened by the word any more.
    for (const file of ['RMHarkOverflowMenu.tsx', 'CommentItem.tsx', 'FeedRow.tsx']) {
      expect(read(file), file).not.toContain("t('action-more'");
    }
  });

  it('the feed row fetches the menu on first use, never with the feed', () => {
    const row = read('FeedRow.tsx');
    expect(row).toMatch(/const loadFeedRowMenu = \(\) => import\('@\/components\/feed\/FeedRowMenu'\);/);
    expect(row).not.toMatch(/from '[^']*RMHarkOverflowMenu'/);
    expect(row).not.toMatch(/from '[^']*FeedRowMenu'/);
  });

  it('ends each group with the row that cannot be undone, in the danger tone', () => {
    const menu = read('RMHarkOverflowMenu.tsx');
    const at = (needle: string) => {
      const i = menu.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    expect(at('icon={Pin}')).toBeLessThan(at('icon={Trash2} tone="danger"'));
    expect(at('icon={Flag}')).toBeLessThan(at('icon={VolumeX}'));
    expect(at('icon={VolumeX}')).toBeLessThan(at('icon={Ban} tone="danger"'));
  });
});

describe('the action row leads with icons and keeps its names (K8 as amended)', () => {
  it('Like, Repost and Reply are an icon, a hidden word and a count', () => {
    const src = read('RMHarkActions.tsx');
    for (const [icon, label] of [
      ['Heart', 'likeLabel'],
      ['Repeat2', 'repostLabel'],
      ['MessageCircle', 'replyLabel'],
    ]) {
      expect(src).toMatch(
        new RegExp(`<${icon} className="feed-action__icon"[^>]*aria-hidden />\\s*<span className="sr-only">\\{${label}\\}</span>`),
      );
    }
  });
});
