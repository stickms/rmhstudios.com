// @vitest-environment node
/**
 * Settings → Appearance shows the reader's three font pickers and, signed in, the per-device switch for appearance
 * sync (owner, 2026-11-23). Server-rendered and read as text, as the other settings tests do.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';

const session = vi.hoisted(() => ({ value: { user: { id: 'u1' } } as unknown }));
vi.mock('@/components/Providers', () => ({ useSession: () => ({ data: session.value, isPending: false }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => String(o?.defaultValue ?? k) }),
}));
vi.mock('@/components/settings/ThemePicker', () => ({ ThemePicker: () => null }));
vi.mock('@/components/settings/TiltEffectsRow', () => ({ TiltEffectsRow: () => null }));

import { AppearancePanel } from '../AppearancePanel';

const html = () => renderToString(createElement(AppearancePanel));

describe('Appearance panel: fonts and sync', () => {
  it('offers the three font pickers, each previewing its current face', () => {
    const out = html();
    for (const label of ['Main font', 'Reading font', 'Mono font']) expect(out).toContain(label);
    // The shared Select renders its options and value text on the client only, so the server markup is the rows.
    // Each picker previews its current face in a line set in that slot's variable.
    for (const v of ['--site-font-body', '--site-font-reading', '--site-font-mono']) {
      expect(out).toContain(`font-family:var(${v})`);
    }
  });

  it('signed in, shows the per-device sync switch', () => {
    session.value = { user: { id: 'u1' } };
    expect(html()).toContain('Sync appearance across devices');
  });

  it('signed out, there is nothing to sync with, so no switch', () => {
    session.value = null;
    expect(html()).not.toContain('Sync appearance across devices');
  });
});
