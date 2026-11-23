/**
 * What the Appearance settings do for the reader's fonts and the per-device sync switch (owner, 2026-11-23; design:
 * docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md). The store change is what paints the
 * page (components/Providers applies fonts, the cookie and the switch); these add the account side.
 *
 * Kept apart from the panel so the rules are testable without rendering it.
 */
import { withoutStamp, useThemeStore, SITE_STYLES, type SiteStyle } from '@/stores/themeStore';
import { isColorVisionMode, isJellyMotion } from '@/lib/appearance/prefs';
import { FONT_KEYS, isFontFor, type FontChoice, type FontSlot } from '@/lib/appearance/fonts';
import { COLOR_VISION_KEY, JELLY_MOTION_KEY } from '@/lib/appearance/prefs';
import { readString } from '@/lib/core/persist';
import { appearanceChangedAt, mergeOnSyncEnable, type AppearanceFields } from '@/lib/appearance/sync-merge';
import type { AppearancePrefs, AppearancePrefsInput } from '@/lib/preferences/preferences.contract';
import { loadFontFace } from '@/lib/appearance/apply-fonts';

interface Deps {
  persist: (body: AppearancePrefsInput) => Promise<void>;
}

const COLUMN = { main: 'fontMain', reading: 'fontReading', mono: 'fontMono' } as const;

/**
 * Choose a face for one slot; saved to the account only while this device syncs appearance. The face is loaded before
 * the page switches to it (lib/appearance/apply-fonts#loadFontFace).
 */
export async function chooseFont<S extends FontSlot>(
  slot: S,
  id: FontChoice[S],
  { persist, loadFace = loadFontFace }: Deps & { loadFace?: (id: FontChoice[S]) => Promise<void> },
): Promise<void> {
  await loadFace(id);
  const st = useThemeStore.getState();
  st.setFont(slot, id);
  if (st.appearanceSync) await persist({ [COLUMN[slot]]: id });
}

/** This device stops taking and sending appearance. */
export function disableAppearanceSync(): void {
  useThemeStore.getState().setAppearanceSync(false);
}

/** A stored value, or null when this device never chose one (a default is expressed by absence). */
const stored = (key: string): string | null => readString(key);

/**
 * This device syncs appearance again: the most recent side wins, field by field, BEFORE the switch flips, so the
 * normal account pull that follows (which lets the account win) finds the two already agreeing.
 *
 * Returns whether sync is now on. A failed read of the account is NOT "no account": nothing is pushed and the switch
 * stays off (a push then would overwrite every other device). A failed save also leaves it off, or the pull that
 * follows would apply the older account over this newer device. Only what this device actually stored is pushed:
 * pushing an untouched default would reset what the other devices chose (final review, 2026-11-23).
 */
export async function enableAppearanceSync({
  get,
  persist,
}: Deps & { get: () => Promise<AppearancePrefs | null> }): Promise<boolean> {
  const st = useThemeStore.getState();
  let remote: AppearancePrefs | null;
  try {
    remote = await get();
  } catch {
    return false;
  }
  const device: AppearanceFields = {
    style: st.styleFromDevice ? null : st.style,
    readableFont: st.readableFont,
    colorVision: stored(COLOR_VISION_KEY),
    jellyMotion: stored(JELLY_MOTION_KEY),
    fontMain: stored(FONT_KEYS.main),
    fontReading: stored(FONT_KEYS.reading),
    fontMono: stored(FONT_KEYS.mono),
  };
  const { push, apply } = mergeOnSyncEnable({
    device,
    deviceChangedAt: appearanceChangedAt(),
    account: remote,
    accountUpdatedAt: remote?.updatedAt ?? null,
  });
  if (Object.keys(push).length) {
    try {
      await persist(push as AppearancePrefsInput);
    } catch {
      return false;
    }
  }
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
  return true;
}
