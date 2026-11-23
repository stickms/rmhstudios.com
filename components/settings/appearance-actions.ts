/**
 * What the Appearance settings do for the reader's fonts and the per-device sync switch (owner, 2026-11-23; design:
 * docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md). The store change is what paints the
 * page (components/Providers applies fonts, the cookie and the switch); these add the account side.
 *
 * Kept apart from the panel so the rules are testable without rendering it.
 */
import { withoutStamp, useThemeStore, SITE_STYLES, type SiteStyle } from '@/stores/themeStore';
import { isColorVisionMode, isJellyMotion } from '@/lib/appearance/prefs';
import { isFontFor, type FontChoice, type FontSlot } from '@/lib/appearance/fonts';
import { appearanceChangedAt, mergeOnSyncEnable, type AppearanceFields } from '@/lib/appearance/sync-merge';
import type { AppearancePrefs, AppearancePrefsInput } from '@/lib/preferences/preferences.contract';

interface Deps {
  persist: (body: AppearancePrefsInput) => Promise<void>;
}

const COLUMN = { main: 'fontMain', reading: 'fontReading', mono: 'fontMono' } as const;

/** Choose a face for one slot; saved to the account only while this device syncs appearance. */
export async function chooseFont<S extends FontSlot>(slot: S, id: FontChoice[S], { persist }: Deps): Promise<void> {
  const st = useThemeStore.getState();
  st.setFont(slot, id);
  if (st.appearanceSync) await persist({ [COLUMN[slot]]: id });
}

/** This device stops taking and sending appearance. */
export function disableAppearanceSync(): void {
  useThemeStore.getState().setAppearanceSync(false);
}

/**
 * This device syncs appearance again: the most recent side wins, field by field, BEFORE the switch flips, so the
 * normal account pull that follows (which lets the account win) finds the two already agreeing.
 */
export async function enableAppearanceSync({
  get,
  persist,
}: Deps & { get: () => Promise<AppearancePrefs | null> }): Promise<void> {
  const st = useThemeStore.getState();
  const remote = await get().catch(() => null);
  const device: AppearanceFields = {
    style: st.styleFromDevice ? null : st.style,
    readableFont: st.readableFont,
    colorVision: st.colorVision,
    jellyMotion: st.jellyMotion,
    fontMain: st.fonts.main,
    fontReading: st.fonts.reading,
    fontMono: st.fonts.mono,
  };
  const { push, apply } = mergeOnSyncEnable({
    device,
    deviceChangedAt: appearanceChangedAt(),
    account: remote,
    accountUpdatedAt: remote?.updatedAt ?? null,
  });
  if (Object.keys(push).length) await persist(push as AppearancePrefsInput);
  withoutStamp(() => {
    const s = useThemeStore.getState();
    if (apply.style && SITE_STYLES.some((x) => x.id === apply.style)) s.setStyle(apply.style as SiteStyle);
    if (typeof apply.readableFont === 'boolean') s.setReadableFont(apply.readableFont);
    if (isColorVisionMode(apply.colorVision)) s.setColorVision(apply.colorVision);
    if (isJellyMotion(apply.jellyMotion)) s.setJellyMotion(apply.jellyMotion);
    if (isFontFor('main', apply.fontMain)) s.setFont('main', apply.fontMain as FontChoice['main']);
    if (isFontFor('reading', apply.fontReading)) s.setFont('reading', apply.fontReading as FontChoice['reading']);
    if (isFontFor('mono', apply.fontMono)) s.setFont('mono', apply.fontMono as FontChoice['mono']);
  });
  useThemeStore.getState().setAppearanceSync(true);
}
