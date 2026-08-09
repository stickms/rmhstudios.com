'use client';

/**
 * Settings — audio, assists, and how the controls behave.
 *
 * The device-picker at the top is a native `<select>`, not a tab strip. It is a
 * PICKER (four device profiles, one at a time), and the repo's rule is that a
 * switcher belongs on `LiquidTabs` — which paints from `--site-*` tokens the
 * game route deliberately suppresses, so it would render as grey glass on
 * cream paper. A `<select>` is the honest control for this: it is a form
 * control, it carries its own keyboard and screen-reader behaviour, and on a
 * phone it opens the platform's own wheel instead of a row of 40px targets.
 *
 * Every assist is listed with what it does, not with whether it is "cheating"
 * (§4.7). The remap table lives on its own screen because it is long, and this
 * one links to it.
 */

import { useTranslation } from 'react-i18next';
import { Gamepad2, Keyboard } from 'lucide-react';
import type { Assists, GameSettings } from '@/lib/bums-rush/types';
import { clampDeadzone, clampSaturation, type PadBrand } from '@/lib/bums-rush/input';
import { PaperCard } from '../paper/PaperSurface';
import { InkButton, InkToggle } from '../paper/InkControls';
import { useNumberFormat } from '../hooks';
import { InkSlider } from './InkSlider';
import { ScreenFrame } from './ScreenFrame';

interface SettingsScreenProps {
  settings: GameSettings;
  onPatch: (patch: Partial<GameSettings>) => void;
  onPatchAssists: (patch: Partial<Assists>) => void;
  onBindings: () => void;
  onBack: () => void;
}

const PAD_BRANDS: readonly ('auto' | PadBrand)[] = ['auto', 'xbox', 'playstation', 'nintendo', 'generic'];

export function SettingsScreen({
  settings,
  onPatch,
  onPatchAssists,
  onBindings,
  onBack,
}: SettingsScreenProps) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const pct = (value: number) => `${nf.format(Math.round(value * 100))}%`;

  return (
    <ScreenFrame
      title={t('settings.title', { defaultValue: 'Settings' })}
      width="medium"
      onBack={onBack}
      backLabel={t('nav.back', { defaultValue: 'Back' })}
    >
      <div className="space-y-[clamp(0.75rem,2vmin,1.25rem)]">
        <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('settings.audio', { defaultValue: 'Sound' })}
          </h2>
          <p className="mt-1 text-xs text-bum-graphite">
            {t('settings.audio-hint', {
              defaultValue: 'Every sound has a visual twin, so the game is fully playable muted.',
            })}
          </p>
          <InkSlider
            label={t('settings.music', { defaultValue: 'Music' })}
            value={settings.music}
            min={0}
            max={1}
            step={0.05}
            display={pct(settings.music)}
            onChange={(music) => onPatch({ music })}
          />
          <InkSlider
            label={t('settings.sfx', { defaultValue: 'Effects' })}
            value={settings.sfx}
            min={0}
            max={1}
            step={0.05}
            display={pct(settings.sfx)}
            onChange={(sfx) => onPatch({ sfx })}
          />
          <InkSlider
            label={t('settings.ui-volume', { defaultValue: 'Menus' })}
            value={settings.ui}
            min={0}
            max={1}
            step={0.05}
            display={pct(settings.ui)}
            onChange={(ui) => onPatch({ ui })}
          />
        </PaperCard>

        <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('settings.controls', { defaultValue: 'Controls' })}
          </h2>

          <div className="mt-3">
            <label htmlFor="bums-touch-scheme" className="block text-sm font-medium text-bum-ink">
              {t('settings.touch-scheme', { defaultValue: 'Touch layout' })}
            </label>
            <select
              id="bums-touch-scheme"
              value={settings.touchScheme}
              onChange={(event) =>
                onPatch({ touchScheme: event.currentTarget.value as GameSettings['touchScheme'] })
              }
              className="mt-1 w-full rounded-bum border-2 border-bum-ink bg-bum-surface px-3 py-2 text-sm text-bum-ink"
            >
              <option value="auto-grab">
                {t('settings.touch-auto', { defaultValue: 'Auto-Grab — one thumb per arm (recommended)' })}
              </option>
              <option value="two-stick">
                {t('settings.touch-two-stick', { defaultValue: 'Two sticks + grab pads (advanced)' })}
              </option>
            </select>
            <p className="mt-1 text-xs text-bum-graphite">
              {settings.touchScheme === 'auto-grab'
                ? t('settings.touch-auto-hint', {
                    defaultValue: 'Finger down reaches and holds; finger up lets go. The hand grips on contact.',
                  })
                : t('settings.touch-two-stick-hint', {
                    defaultValue: 'Fixed sticks in the corners, with separate grab buttons. The full verb set.',
                  })}
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="bums-pad-brand" className="block text-sm font-medium text-bum-ink">
              {t('settings.pad-brand', { defaultValue: 'Controller glyphs' })}
            </label>
            <select
              id="bums-pad-brand"
              value={settings.padBrand}
              onChange={(event) =>
                onPatch({ padBrand: event.currentTarget.value as GameSettings['padBrand'] })
              }
              className="mt-1 w-full rounded-bum border-2 border-bum-ink bg-bum-surface px-3 py-2 text-sm text-bum-ink"
            >
              {PAD_BRANDS.map((brand) => (
                <option key={brand} value={brand}>
                  {t(`settings.brand-${brand}`, { defaultValue: BRAND_LABELS[brand] })}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-bum-graphite">
              {t('settings.pad-brand-hint', {
                defaultValue: 'Detection is a hint, not a lock. Override it if your pad reports something odd.',
              })}
            </p>
          </div>

          <InkSlider
            label={t('settings.deadzone', { defaultValue: 'Stick deadzone' })}
            value={settings.deadzone}
            min={0.05}
            max={0.4}
            step={0.01}
            display={pct(settings.deadzone)}
            hint={t('settings.deadzone-hint', {
              defaultValue: 'Raise it if a resting stick drifts; worn sticks are common.',
            })}
            onChange={(value) => onPatch({ deadzone: clampDeadzone(value) })}
          />
          <InkSlider
            label={t('settings.saturation', { defaultValue: 'Stick saturation' })}
            value={settings.saturation}
            min={0.5}
            max={0.98}
            step={0.01}
            display={pct(settings.saturation)}
            hint={t('settings.saturation-hint', {
              defaultValue: 'Lower it if your stick cannot quite reach full deflection on the diagonals.',
            })}
            onChange={(value) => onPatch({ saturation: clampSaturation(value, settings.deadzone) })}
          />
          <InkSlider
            label={t('settings.rumble', { defaultValue: 'Rumble' })}
            value={settings.rumble}
            min={0}
            max={1}
            step={0.05}
            display={pct(settings.rumble)}
            onChange={(rumble) => onPatch({ rumble })}
          />

          <InkToggle
            id="bums-tags"
            checked={settings.alwaysShowTags}
            onChange={(alwaysShowTags) => onPatch({ alwaysShowTags })}
            label={t('settings.tags', { defaultValue: 'Always show name tags' })}
            hint={t('settings.tags-hint', {
              defaultValue: 'Pins every player’s name over their head, on top of their colour and mark.',
            })}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <InkButton onClick={onBindings}>
              <Keyboard className="size-4" aria-hidden="true" />
              <Gamepad2 className="size-4" aria-hidden="true" />
              {t('settings.remap', { defaultValue: 'Remap every button' })}
            </InkButton>
          </div>
        </PaperCard>

        <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('settings.assists', { defaultValue: 'Assists' })}
          </h2>
          <p className="mt-1 text-xs text-bum-graphite">
            {t('settings.assists-hint', {
              defaultValue:
                'All of these are yours alone and none of them are hidden — your seat shows what is on.',
            })}
          </p>

          <InkToggle
            id="bums-assist-grab"
            checked={settings.assists.grabAssist}
            onChange={(grabAssist) => onPatchAssists({ grabAssist })}
            label={t('assist.grab', { defaultValue: 'Grab assist' })}
            hint={t('assist.grab-hint', { defaultValue: 'A slightly bigger reach around each hand.' })}
          />
          <InkToggle
            id="bums-assist-sticky"
            checked={settings.assists.stickyGrip}
            onChange={(stickyGrip) => onPatchAssists({ stickyGrip })}
            label={t('assist.sticky', { defaultValue: 'Sticky grip' })}
            hint={t('assist.sticky-hint', { defaultValue: 'Your grip never tears — you only let go on purpose.' })}
          />
          <InkToggle
            id="bums-assist-analog"
            checked={settings.assists.analogTriggers}
            onChange={(analogTriggers) => onPatchAssists({ analogTriggers })}
            label={t('assist.analog', { defaultValue: 'Analog triggers' })}
            hint={t('assist.analog-hint', {
              defaultValue: 'Off means a trigger grips at full strength the moment it is pressed.',
            })}
          />
          <InkToggle
            id="bums-assist-checkpoints"
            checked={settings.assists.extraCheckpoints}
            onChange={(extraCheckpoints) => onPatchAssists({ extraCheckpoints })}
            label={t('assist.checkpoints', { defaultValue: 'Extra checkpoints' })}
            hint={t('assist.checkpoints-hint', { defaultValue: 'Turns on the optional checkpoints levels carry.' })}
          />
          <InkToggle
            id="bums-assist-nofall"
            checked={settings.assists.noFallDamage}
            onChange={(noFallDamage) => onPatchAssists({ noFallDamage })}
            label={t('assist.nofall', { defaultValue: 'No fall damage' })}
            hint={t('assist.nofall-hint', { defaultValue: 'Hazards and falling out of the level still get you.' })}
          />
          <InkToggle
            id="bums-assist-slowmo"
            checked={settings.assists.slowMo}
            onChange={(slowMo) => onPatchAssists({ slowMo })}
            label={t('assist.slowmo', { defaultValue: 'Slow motion' })}
            hint={t('assist.slowmo-hint', { defaultValue: 'Practice at three-quarter speed. Solo only.' })}
          />
          <InkToggle
            id="bums-assist-onehand"
            checked={settings.assists.oneHanded}
            onChange={(oneHanded) => onPatchAssists({ oneHanded })}
            label={t('assist.onehanded', { defaultValue: 'One-handed mode' })}
            hint={t('assist.onehanded-hint', {
              defaultValue: 'Both arms from one stick; the grab button swaps which arm you are moving.',
            })}
          />
          <InkSlider
            label={t('assist.smoothing', { defaultValue: 'Aim smoothing' })}
            value={settings.assists.aimSmoothing}
            min={0}
            max={1}
            step={0.05}
            display={pct(settings.assists.aimSmoothing)}
            hint={t('assist.smoothing-hint', { defaultValue: 'Softens a shaky hand or a worn stick.' })}
            onChange={(aimSmoothing) => onPatchAssists({ aimSmoothing })}
          />

          <div className="mt-3">
            <label htmlFor="bums-cat" className="block text-sm font-medium text-bum-ink">
              {t('settings.cat', { defaultValue: 'Send the cat after' })}
            </label>
            <select
              id="bums-cat"
              value={String(settings.catAfterWipes)}
              onChange={(event) =>
                onPatch({ catAfterWipes: Number(event.currentTarget.value) as GameSettings['catAfterWipes'] })
              }
              className="mt-1 w-full rounded-bum border-2 border-bum-ink bg-bum-surface px-3 py-2 text-sm text-bum-ink"
            >
              <option value="3">{t('settings.cat-3', { defaultValue: 'Three splats' })}</option>
              <option value="6">{t('settings.cat-6', { defaultValue: 'Six splats' })}</option>
              <option value="0">{t('settings.cat-0', { defaultValue: 'Never' })}</option>
            </select>
          </div>
        </PaperCard>
      </div>
    </ScreenFrame>
  );
}

const BRAND_LABELS: Record<'auto' | PadBrand, string> = {
  auto: 'Detect automatically',
  xbox: 'Xbox (A B X Y)',
  playstation: 'PlayStation (✕ ○ □ △)',
  nintendo: 'Nintendo (B A Y X)',
  generic: 'Generic',
};
