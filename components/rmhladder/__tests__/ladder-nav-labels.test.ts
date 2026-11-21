/**
 * Every RMH Ladder sub-navigation tab has its name written out as a literal
 * `t()` call (so `pnpm i18n:extract` sees it), keyed by the lower-cased English
 * label. Offers and Insights are translated in the shell from their own
 * namespaces. A tab added to a nav list without an entry here would ship
 * untranslated in every locale but English.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { ladderNavLabels } from '@/components/rmhladder/ladder-nav-labels';
import { ADMIN_NAV, PERSONAL_NAV, PUBLIC_NAV } from '@/components/rmhladder/RmhLadderShell';

const OWN_NAMESPACE = new Set(['offers', 'insights']);

describe('ladder nav labels', () => {
  it('covers every tab of the shell with the same English', () => {
    const { t, calls } = recordingT();
    const labels = ladderNavLabels(t);
    const tabs = [...PUBLIC_NAV, ...PERSONAL_NAV, ...ADMIN_NAV].filter((n) => !OWN_NAMESPACE.has(n.label.toLowerCase()));
    expect(Object.keys(labels).sort()).toEqual(tabs.map((n) => n.label.toLowerCase()).sort());
    for (const tab of tabs) expect(labels[tab.label.toLowerCase()], tab.label).toBe(tab.label);
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(
      tabs.map((n) => `ladder.nav.${n.label.toLowerCase()}`).sort(),
    );
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['site']));
  });
});
