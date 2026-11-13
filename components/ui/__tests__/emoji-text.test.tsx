/**
 * `EmojiText` is the React-owned way to draw user text with Twemoji (a profile status, a
 * name, a bio line). The emoji become images whose `alt` is the emoji; everything else stays
 * the text it was.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmojiText, splitEmoji } from '../emoji';
import { StatusBadge } from '@/components/feed/StatusBadge';

const html = (text: string) => renderToStaticMarkup(<EmojiText>{text}</EmojiText>);

describe('EmojiText', () => {
  it('leaves plain text untouched', () => {
    expect(html('Playing tonight, 3 of us (c) 2026')).toBe(
      '<span data-no-twemoji="true">Playing tonight, 3 of us (c) 2026</span>',
    );
    expect(splitEmoji('just words')).toEqual([{ emoji: false, value: 'just words' }]);
  });

  it('draws an emoji as its Twemoji image, sized to the text, with the emoji as alt', () => {
    const out = html('Playing 🎲 tonight');
    expect(out).toContain('Playing <img');
    expect(out).toContain('/assets/svg/1f3b2.svg');
    expect(out).toContain('alt="🎲"');
    expect(out).toContain('draggable="false"');
    expect(out).toContain('width:1em');
    expect(out).toContain(' tonight</span>');
  });

  it('keeps a sequence whole: flags, skin tones, ZWJ families, keycaps, variation selectors', () => {
    const values = (s: string) => splitEmoji(s).filter((p) => p.emoji).map((p) => p.value);
    expect(values('🇵🇹 and 👍🏽 and 👩‍👩‍👧 and 1️⃣ and 🛠️')).toEqual(['🇵🇹', '👍🏽', '👩‍👩‍👧', '1️⃣', '🛠️']);
    expect(html('🇵🇹')).toContain('/1f1f5-1f1f9.svg');
    expect(html('🛠️')).toContain('/1f6e0.svg');
  });

  it('does not turn text-presentation characters or digits into images', () => {
    for (const text of ['© 2026', 'a ↪ b', '5 # *', 'TM™']) {
      expect(html(text), text).not.toContain('<img');
    }
  });

  it('never injects markup from the text', () => {
    expect(html('<b>hi</b> 🎮')).toContain('&lt;b&gt;hi&lt;/b&gt; ');
    expect(readFileSync(join(process.cwd(), 'components/ui/emoji.tsx'), 'utf8')).not.toMatch(
      /dangerouslySetInnerHTML=/,
    );
  });
});

describe('a profile status', () => {
  it('renders its emoji and the emoji in its text as Twemoji', () => {
    const out = renderToStaticMarkup(
      <StatusBadge status={{ emoji: '🎮', text: 'Grinding 🚀 the pass' }} />,
    );
    expect(out).toContain('/1f3ae.svg');
    expect(out).toContain('/1f680.svg');
    expect(out).toContain('Grinding ');
    expect(out).not.toMatch(/>🎮</);
  });
});

describe('the root provider', () => {
  it('watches portalled UI, which mounts outside its wrapper', () => {
    expect(readFileSync(join(process.cwd(), 'app/routes/__root.tsx'), 'utf8')).toMatch(
      /<TwemojiProvider portals>/,
    );
  });
});
