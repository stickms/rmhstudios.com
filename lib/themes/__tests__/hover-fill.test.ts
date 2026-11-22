import { describe, expect, it } from 'vitest';
import { OFFICIAL_SITE_THEMES } from '@/lib/themes/official';
import { themeCssVars } from '@/lib/themes/tokens';
import { contrastRatio } from '@/lib/appearance/contrast';

// The hover fill (`--site-bg-subtle`) has to be visible on the page under every theme: every light theme's white tint
// once derived it at 1.01:1, so ghost buttons had no hover there. Day's own step (#fafafa -> #f0f2f4) is the floor.
const DAY_STEP = contrastRatio('#f0f2f4', '#fafafa');

describe('theme hover fill', () => {
  it.each(Object.entries(OFFICIAL_SITE_THEMES))('%s: the fill stands off the page at least as far as Day', (_, th) => {
    const vars = themeCssVars(th.tokens);
    expect(contrastRatio(vars['--site-bg-subtle']!, th.tokens.canvasBase)).toBeGreaterThanOrEqual(DAY_STEP);
  });
});
