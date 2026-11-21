/**
 * Every settings destination has its translated label and hint written out as a
 * literal `t()` call (so `pnpm i18n:extract` sees it), with the same English the
 * destination list carries. A destination added to `lib/settings-nav.ts` without
 * an entry here would ship untranslated in every locale but English.
 */
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { SETTINGS_DESTINATIONS } from '@/lib/settings-nav';
import { settingsNavText } from '@/components/settings/settings-nav-labels';

const echoDefault = ((_key: string, opts: { defaultValue: string }) => opts.defaultValue) as unknown as TFunction;

describe('settings hub labels', () => {
  it('covers every destination with the same English label and hint', () => {
    const text = settingsNavText(echoDefault);
    for (const d of SETTINGS_DESTINATIONS) {
      expect(text[d.id], d.id).toEqual({ label: d.label, hint: d.hint });
    }
    expect(Object.keys(text).sort()).toEqual(SETTINGS_DESTINATIONS.map((d) => d.id).sort());
  });

  it('lists Blocked and muted under account, signed-in only', () => {
    const d = SETTINGS_DESTINATIONS.find((x) => x.id === 'blocked');
    expect(d).toMatchObject({ to: '/settings/blocked', group: 'account', requiresAuth: true, label: 'Blocked and muted' });
    expect(settingsNavText(echoDefault)['blocked']).toEqual({ label: d!.label, hint: d!.hint });
  });
});
