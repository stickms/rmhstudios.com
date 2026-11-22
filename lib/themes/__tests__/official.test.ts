import { describe, expect, it } from 'vitest';
import { OFFICIAL_SITE_THEMES, officialThemeView, OFFICIAL_ID_PREFIX } from '@/lib/themes/official';
import { validateThemeForPublish } from '@/lib/themes/validate';
import { getShopItem, SHOP_ITEMS } from '@/lib/shop/catalog';

// Official site themes are sold in the store and applied to the whole site, so each must clear the same safety and
// contrast gate a marketplace theme has to pass before it can be sold.
describe('official site themes', () => {
  it('has a handful of themes, each passing the publish gate', () => {
    const ids = Object.keys(OFFICIAL_SITE_THEMES);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const id of ids) {
      const r = validateThemeForPublish(OFFICIAL_SITE_THEMES[id]!.tokens);
      expect(r.ok, `${id}: ${r.ok ? '' : r.message}`).toBe(true);
    }
  });

  it('every official theme is a SITE_THEME store item, and every SITE_THEME item names an official theme', () => {
    const siteItems = SHOP_ITEMS.filter((i) => i.kind === 'SITE_THEME');
    expect(siteItems.map((i) => i.data.siteThemeId).sort()).toEqual(Object.keys(OFFICIAL_SITE_THEMES).sort());
    for (const item of siteItems) expect(getShopItem(item.id)?.kind).toBe('SITE_THEME');
  });

  it('views an owned official theme under a prefixed id that cannot collide with a marketplace theme', () => {
    const [id] = Object.keys(OFFICIAL_SITE_THEMES);
    const view = officialThemeView(id!);
    expect(view?.id).toBe(`${OFFICIAL_ID_PREFIX}${id}`);
    expect(view?.tokens).toEqual(OFFICIAL_SITE_THEMES[id!]!.tokens);
  });
});
