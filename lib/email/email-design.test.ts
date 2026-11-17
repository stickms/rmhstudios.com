/**
 * AI-designed emails: whatever DeepSeek or Kimi returns, the mailing keeps the
 * site's rules. The model picks structure; these tests pin what it cannot do.
 */
import { describe, expect, it } from 'vitest';
import { allowedButtonUrl, sanitizeDesign, urlsIn } from '@/lib/email/design';
import { renderDesignedEmail } from '@/lib/email/design-render';
import { BRAND, brandBrief, contrast, inkOn } from '@/lib/email/brand';
import { emailDesignSchema, type EmailDesign } from '@/lib/email/campaign-schema';
import { SITE_URL } from '@/lib/seo';

const base: EmailDesign = {
  theme: 'light',
  accent: 'ink',
  logo: true,
  blocks: [{ type: 'text', text: 'Hello' }],
};

describe('sanitizeDesign', () => {
  it('keeps site links and links from the message, drops invented ones', () => {
    const body = 'Read https://example.org/notes for details.';
    const out = sanitizeDesign(
      {
        ...base,
        blocks: [
          { type: 'text', text: 'Hi' },
          { type: 'button', label: 'Open', url: `${SITE_URL}/news` },
          { type: 'button', label: 'Read', url: 'https://example.org/notes' },
          { type: 'button', label: 'Win', url: 'https://phish.example/login' },
          { type: 'button', label: 'Run', url: 'javascript:alert(1)' },
          { type: 'button', label: 'Path', url: '/settings' },
        ],
      },
      { body, imageCount: 0 },
    );
    const urls = out.blocks.flatMap((b) => (b.type === 'button' ? [b.url] : []));
    expect(urls).toEqual([`${SITE_URL}/news`, 'https://example.org/notes', `${SITE_URL}/settings`]);
  });

  it('uses each attached picture once, drops unknown ones, and appends the ones left out', () => {
    const out = sanitizeDesign(
      {
        ...base,
        blocks: [
          { type: 'image', image: 1 },
          { type: 'image', image: 1 },
          { type: 'image', image: 3 },
          { type: 'text', text: 'Hi' },
        ],
      },
      { body: 'Hi', imageCount: 2 },
    );
    expect(out.blocks.filter((b) => b.type === 'image')).toEqual([
      { type: 'image', image: 1 },
      { type: 'image', image: 0 },
    ]);
  });

  it('never leaves an email without words, and trims stray rules', () => {
    const out = sanitizeDesign(
      { ...base, blocks: [{ type: 'divider' }, { type: 'button', label: 'Go', url: 'https://x.example' }, { type: 'divider' }] },
      { body: 'The whole message.', imageCount: 0 },
    );
    expect(out.blocks).toEqual([{ type: 'text', text: 'The whole message.' }]);
  });

  it('finds the links in a message the way the plain layout links them', () => {
    expect(urlsIn('See https://rmhstudios.com/a, and http://b.example/c.')).toEqual([
      'https://rmhstudios.com/a',
      'http://b.example/c',
    ]);
    expect(allowedButtonUrl('//evil.example', [])).toBeNull();
  });
});

describe('the design schema', () => {
  it('accepts only brand themes and accents, and no raw HTML block', () => {
    expect(emailDesignSchema.safeParse(base).success).toBe(true);
    expect(emailDesignSchema.safeParse({ ...base, accent: '#ff00ff' }).success).toBe(false);
    expect(emailDesignSchema.safeParse({ ...base, theme: 'neon' }).success).toBe(false);
    expect(
      emailDesignSchema.safeParse({ ...base, blocks: [{ type: 'html', html: '<script></script>' }] }).success,
    ).toBe(false);
  });
});

describe('renderDesignedEmail', () => {
  const render = (design: EmailDesign, imageUrls: string[] = []) =>
    renderDesignedEmail({
      subject: 'News for {{name}}',
      design,
      name: 'Ada',
      reason: 'Because.',
      unsubscribeUrl: 'https://rmhstudios.com/api/email/unsubscribe?token=t&list=announcements',
      settingsUrl: 'https://rmhstudios.com/settings/notifications',
      imageUrls,
      logoUrl: `${SITE_URL}${BRAND.logoPath}`,
    });

  it('escapes everything the model wrote and personalises it', () => {
    const out = render({
      ...base,
      eyebrow: '<b>x</b>',
      blocks: [
        { type: 'heading', text: 'Hi {{name}} <img src=x onerror=alert(1)>' },
        { type: 'button', label: '"><script>', url: 'https://rmhstudios.com/a?b="c"' },
      ],
    });
    expect(out.subject).toBe('News for Ada');
    expect(out.html).not.toContain('<script>');
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('Hi Ada &lt;img');
    expect(out.html).toContain('href="https://rmhstudios.com/a?b=&quot;c&quot;"');
  });

  it('draws with the brand: the logo, the theme colours, and a readable button', () => {
    const out = render({ ...base, theme: 'dark', accent: 'purple', blocks: [{ type: 'button', label: 'Play', url: 'https://rmhstudios.com' }] });
    expect(out.html).toContain(`src="${SITE_URL}${BRAND.logoPath}"`);
    expect(out.html).toContain(BRAND.themes.dark.card);
    expect(out.html).toContain(`bgcolor="${BRAND.logoPurple}"`);
    expect(contrast(BRAND.logoPurple, inkOn(BRAND.logoPurple))).toBeGreaterThanOrEqual(4.5);
    expect(out.html).toContain('Unsubscribe');
  });

  it('falls back to the ink when an accent would vanish into the card', () => {
    const out = render({ ...base, theme: 'dark', accent: 'ink', blocks: [{ type: 'button', label: 'Go', url: 'https://rmhstudios.com' }] });
    expect(out.html).toContain(`bgcolor="${BRAND.themes.dark.ink}"`);
  });

  it('shows only https pictures', () => {
    const out = render({ ...base, blocks: [{ type: 'image', image: 0 }, { type: 'image', image: 1 }] }, [
      'https://rmhstudios.com/api/feed/image/a.png',
      'http://insecure.example/b.png',
    ]);
    expect(out.html).toContain('https://rmhstudios.com/api/feed/image/a.png');
    expect(out.html).not.toContain('insecure.example');
  });
});

describe('the brand brief', () => {
  it('gives the designer the logo, the palette and the voice', () => {
    const brief = brandBrief();
    expect(brief).toContain(BRAND.logoPurple);
    expect(brief).toContain('Steel');
    expect(brief).toContain('No exclamation marks');
  });
});
