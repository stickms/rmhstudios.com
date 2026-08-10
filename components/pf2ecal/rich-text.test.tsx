/**
 * The assistant's Markdown subset.
 *
 * In the suite for one reason above the others: this renders MODEL OUTPUT, and
 * model output is only a step removed from user input — session titles, notes
 * and announcements all reach the prompt. The safety property being pinned is
 * structural (React elements with string children, never `innerHTML`), and a
 * future "just use dangerouslySetInnerHTML, it's only the assistant" would turn
 * an unlisted page into stored XSS. These assertions are what makes that a
 * failing test rather than a code review someone might skip.
 *
 * The formatting cases are here because the bug that prompted them shipped: the
 * bubble rendered `**Wed, Aug 12**` with the asterisks visible.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichText } from './rich-text';

const html = (text: string) => renderToStaticMarkup(<RichText text={text} />);

describe('RichText — formatting', () => {
  it('renders bold', () => {
    expect(html('The next session is **Wednesday**.')).toContain('<strong>Wednesday</strong>');
  });

  it('leaves no stray asterisks behind — the bug that prompted this', () => {
    const out = html('It is **Wed, Aug 12, 8:00 PM Eastern** to **midnight**.');
    expect(out).not.toContain('*');
    expect(out).toContain('<strong>Wed, Aug 12, 8:00 PM Eastern</strong>');
    expect(out).toContain('<strong>midnight</strong>');
  });

  it('renders italic in both spellings', () => {
    expect(html('*maybe*')).toContain('<em>maybe</em>');
    expect(html('_maybe_')).toContain('<em>maybe</em>');
  });

  it('does not mistake bold for two italics', () => {
    // A greedy single-asterisk rule eats the first two characters of a bold run
    // and leaves one behind; the alternation is ordered to stop that.
    const out = html('**in**');
    expect(out).toContain('<strong>in</strong>');
    expect(out).not.toContain('<em>');
  });

  it('renders inline code and does not re-parse its contents', () => {
    const out = html('use `**not bold**` here');
    expect(out).toContain('**not bold**');
    expect(out).not.toContain('<strong>');
  });

  it('turns a single newline into a break and a blank line into a paragraph', () => {
    expect(html('one\ntwo')).toContain('<br/>');
    const two = html('one\n\ntwo');
    expect(two.match(/<p/g)).toHaveLength(2);
  });

  it('renders a bullet list', () => {
    const out = html('- Wednesday\n- Friday');
    expect(out).toContain('<ul');
    expect(out.match(/<li>/g)).toHaveLength(2);
    expect(out).toContain('<li>Wednesday</li>');
  });

  it('leaves ordinary prose alone', () => {
    const out = html('The next session is Wednesday at 8pm.');
    expect(out).toContain('The next session is Wednesday at 8pm.');
    expect(out).not.toContain('<strong>');
  });

  it('survives unbalanced markers rather than swallowing text', () => {
    // An unmatched marker stays the literal character it is; nothing is
    // consumed or dropped.
    for (const input of ['**unclosed', '`tick', '__', '***']) {
      expect(html(input), input).toContain(input);
    }
  });

  it('needs the delimiter to hug its text, so loose asterisks stay literal', () => {
    // CommonMark's flanking rule. Without it "a * b * c" renders as
    // "a <em> b </em> c" and any sentence containing a stray asterisk — a
    // footnote marker, "8 * 3" — silently turns italic mid-line.
    for (const input of ['a * b * c', '8 * 3 = 24', 'in * out']) {
      const out = html(input);
      expect(out, input).toContain(input);
      expect(out, input).not.toContain('<em>');
    }
  });
});

describe('RichText — safety', () => {
  /**
   * Every one of these is text a model could emit, and could be steered into
   * emitting by a session note. None may become markup.
   *
   * The assertion is that the ANGLE BRACKETS are escaped, not that the words
   * are absent: `onerror` surviving as visible text is correct — it is a string
   * the user typed and it renders as one. A first pass asserted
   * `not.toContain('onerror')`, which failed against output that was already
   * safe and would have been "fixed" by filtering the word. What makes a
   * payload inert is that no tag was ever constructed.
   */
  it.each([
    ['a script tag', '<script>alert(1)</script>'],
    ['an img onerror', '<img src=x onerror="alert(1)">'],
    ['an iframe', '<iframe src="javascript:alert(1)"></iframe>'],
    ['a bold-wrapped tag', '**<script>alert(1)</script>**'],
    ['a tag inside code', '`<script>alert(1)</script>`'],
    ['an svg onload', '<svg onload=alert(1)>'],
  ])('escapes %s', (_label, payload) => {
    const out = html(payload);
    // No element the payload asked for was created…
    expect(out).not.toMatch(/<(script|img|iframe|svg)\b/i);
    // …because every `<` in it became an entity.
    expect(out).toContain('&lt;');
    expect(out).not.toContain('<script');
  });

  it('never emits a raw-HTML sink', () => {
    // The property that makes the cases above true by construction rather than
    // by filtering: the module contains no `innerHTML` sink at all.
    //
    // Comments are stripped first. The module's own doc comment explains that
    // it does not use `dangerouslySetInnerHTML`, and a naive substring search
    // matched that sentence — the same trap the design gate hits when a comment
    // names the thing it forbids.
    const source = readFileSync(new URL('./rich-text.tsx', import.meta.url), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('dangerouslySetInnerHTML');
    expect(code).not.toContain('innerHTML');
    // Guards the stripper itself: if it ever ate the whole file, the two
    // assertions above would pass vacuously.
    expect(code).toContain('export function RichText');
  });
});
