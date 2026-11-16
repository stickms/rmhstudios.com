import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';

/**
 * Every visibility setting can be found in one place (Phase 6, plan 1.1): the site's Privacy page
 * carries an "RMH Music" group with the same two switches as the app, reading and writing the SAME
 * endpoint, so the two can never disagree. Source-level, as components run in node without a DOM.
 */
const root =
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
  );
const read =
  (
    p: string,
  ) =>
    readFileSync(
      join(
        root,
        p,
      ),
      'utf8',
    );

describe('the RMH Music group on the Privacy page', () => {
  const controls =
    read(
      'components/settings/MusicPrivacyControls.tsx',
    );

  it('is on the signed-in Privacy page', () => {
    const page =
      read(
        'app/routes/_site/settings/privacy.tsx',
      );
    expect(
      page,
    ).toContain(
      '<MusicPrivacyControls',
    );
  });

  it("mirrors the app's switches: the same contracts, both switches", () => {
    expect(
      controls,
    ).toContain(
      'musicSocialApi',
    );
    expect(
      controls,
    ).toContain(
      'setMusicSocialApi',
    );
    expect(
      controls,
    ).toMatch(
      /board:/,
    );
    expect(
      controls,
    ).toMatch(
      /friends:/,
    );
  });

  it('is a site-tier group in the Privacy page namespace, on the site Switch', () => {
    expect(
      controls,
    ).toContain(
      "useTranslation('feed')",
    );
    expect(
      controls,
    ).toContain(
      "from '@/components/ui/switch'",
    );
    expect(
      controls,
    ).not.toMatch(
      /app-|rmm-/,
    );
  });
});
