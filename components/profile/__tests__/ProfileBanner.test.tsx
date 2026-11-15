/**
 * The banner box draws, in order: the uploaded picture; else the equipped point-shop
 * cosmetic (a BANNER, or a THEME's backdrop); else nothing. Steel phase 5 removed the
 * element that drew the cosmetic while the profile still computed it, so a bought banner
 * or theme changed nothing; this pins the box to all three.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveEquippedCosmetics } from '@/lib/shop/equipped';
import { ProfileBanner } from '../ProfileBanner';

const DUSK = 'linear-gradient(135deg,#f97316,#db2777)';

describe('ProfileBanner', () => {
  it('draws an equipped cosmetic as the box picture when there is no image', () => {
    const html = renderToStaticMarkup(<ProfileBanner src={null} backdrop={DUSK} />);
    expect(html).toContain('background:linear-gradient(135deg,#f97316,#db2777)');
    expect(html).toContain('aspect-ratio:3');
    expect(html).not.toContain('<img');
  });

  it('the uploaded picture wins over the cosmetic', () => {
    const html = renderToStaticMarkup(<ProfileBanner src="/b.webp" backdrop={DUSK} />);
    expect(html).toContain('<img');
    expect(html).not.toContain('linear-gradient');
  });

  it('the shop catalog still resolves a banner and a theme to a backdrop', () => {
    expect(resolveEquippedCosmetics(['banner.dusk']).banner?.gradient).toBe(DUSK);
    const theme = resolveEquippedCosmetics(['theme.vapor']).theme;
    expect(theme?.gradient).toMatch(/^linear-gradient\(/);
    expect(theme?.accent).toMatch(/^#/);
  });

  it('the profile hands the cosmetic to the box, and a themed profile marks its column', () => {
    const hero = readFileSync(join(process.cwd(), 'components/profile/ProfileHero.tsx'), 'utf8');
    expect(hero).toMatch(/<ProfileBanner[\s\S]*?backdrop=\{headerBackdrop\}/);
    const column = readFileSync(join(process.cwd(), 'components/feed/ProfileColumn.tsx'), 'utf8');
    expect(column).toMatch(/cosmetics\?\.theme && 'profile-themed'/);
  });
});
