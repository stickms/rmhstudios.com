/**
 * Harmonic's in-game HUD: health, cold, ammo, Tuner charge, the layer indicator, the hint line and
 * the subtitle stack. It draws a `HarmonicHudState` (lib/harmonic-game/client/hud-state.ts) and hides
 * every field that state leaves undefined. Cold whites on a dark scrim (readable over snow and over
 * dark interiors); amber appears only for "in phase". Pointer-events are off, so it never takes a
 * click from the game. Styles: harmonic.css (`.harmonic-hud`).
 */
'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Radio, Snowflake, Waves } from 'lucide-react';
import type { HarmonicHudState } from '@/lib/harmonic-game/client/hud-state';
import type { SubtitleSize } from '@/lib/harmonic-game/client/prefs';

function Meter({
  value,
  max,
  label,
  tone,
}: {
  value: number;
  max: number;
  label: string;
  tone?: 'phase' | 'low';
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div
      className="harmonic-meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      data-tone={tone}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Speaker display names: literal t() calls so extraction sees every key. */
function speakerLabel(t: TFunction, id: string | undefined, fallback: string): string {
  switch (id) {
    case 'ines':
      return t('harmonic:speaker_ines', { defaultValue: 'Ines' });
    case 'odile':
      return t('harmonic:speaker_odile', { defaultValue: 'Odile' });
    case 'sana':
      return t('harmonic:speaker_sana', { defaultValue: 'Sana' });
    case 'voss':
      return t('harmonic:speaker_voss', { defaultValue: 'Voss' });
    case 'lind':
      return t('harmonic:speaker_lind', { defaultValue: 'Lind' });
    case 'pavel':
      return t('harmonic:speaker_pavel', { defaultValue: 'Pavel' });
    default:
      return fallback;
  }
}

export default function HarmonicHud({
  hud,
  now,
  subtitleSize,
  showSubtitles,
}: {
  hud: HarmonicHudState;
  /** The HUD clock (`HudState.now`): subtitles show until their `until`. */
  now: number;
  subtitleSize: SubtitleSize;
  showSubtitles: boolean;
}) {
  const { t } = useTranslation('harmonic');
  const lines = showSubtitles ? hud.subtitles.filter((s) => s.until > now) : [];
  const low = hud.health <= hud.maxHealth * 0.25;
  const inPhase = !!hud.tuner?.listening || hud.layer === 'past';

  return (
    <div className="harmonic-hud" data-dead={hud.dead || undefined}>
      {hud.layer ? (
        <div className="harmonic-hud-panel harmonic-hud-layer" data-phase={inPhase || undefined}>
          <Waves className="size-4" aria-hidden />
          <span>
            {hud.layer === 'past'
              ? t('harmonic:hud_layer_past', { defaultValue: 'Past' })
              : t('harmonic:hud_layer_present', { defaultValue: 'Present' })}
          </span>
        </div>
      ) : null}

      <div className="harmonic-hud-panel harmonic-hud-vitals">
        <div className="harmonic-hud-row">
          <span className="harmonic-hud-label">
            {t('harmonic:hud_health', { defaultValue: 'Health' })}
          </span>
          <span className="harmonic-hud-value" data-low={low || undefined}>
            {hud.health}
          </span>
        </div>
        <Meter
          value={hud.health}
          max={hud.maxHealth}
          label={t('harmonic:hud_health', { defaultValue: 'Health' })}
          tone={low ? 'low' : undefined}
        />
        {hud.cold ? (
          <>
            <div className="harmonic-hud-row">
              <span className="harmonic-hud-label">
                <Snowflake className="size-3.5" aria-hidden />
                {t('harmonic:hud_cold', { defaultValue: 'Cold' })}
              </span>
              <span className="harmonic-hud-value">
                {hud.cold.sheltered
                  ? t('harmonic:hud_sheltered', { defaultValue: 'Sheltered' })
                  : Math.round((hud.cold.value / Math.max(1, hud.cold.max)) * 100)}
              </span>
            </div>
            <Meter
              value={hud.cold.value}
              max={hud.cold.max}
              label={t('harmonic:hud_cold', { defaultValue: 'Cold' })}
            />
          </>
        ) : null}
      </div>

      {hud.weapon || hud.tuner ? (
        <div className="harmonic-hud-panel harmonic-hud-gear">
          {hud.weapon ? (
            <div className="harmonic-hud-row">
              <span className="harmonic-hud-label">
                {hud.weapon.reloading
                  ? t('harmonic:hud_reloading', { defaultValue: 'Reloading' })
                  : t('harmonic:hud_ammo', { defaultValue: 'Ammo' })}
              </span>
              <span className="harmonic-hud-value">
                {hud.weapon.ammo}
                <span className="harmonic-hud-reserve"> / {hud.weapon.reserve}</span>
              </span>
            </div>
          ) : null}
          {hud.tuner ? (
            <>
              <div className="harmonic-hud-row">
                <span className="harmonic-hud-label">
                  {t('harmonic:hud_tuner', { defaultValue: 'Tuner' })}
                </span>
                <span className="harmonic-hud-value">
                  {hud.tuner.listening
                    ? t('harmonic:hud_listening', { defaultValue: 'Listening' })
                    : Math.round((hud.tuner.charge / Math.max(1, hud.tuner.max)) * 100)}
                </span>
              </div>
              <Meter
                value={hud.tuner.charge}
                max={hud.tuner.max}
                label={t('harmonic:hud_tuner', { defaultValue: 'Tuner' })}
                tone={hud.tuner.listening ? 'phase' : undefined}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <span className="harmonic-hud-crosshair" aria-hidden />

      {hud.hint ? (
        <p className="harmonic-hud-panel harmonic-hud-hint" role="status">
          {t(hud.hint.key, { defaultValue: hud.hint.defaultValue })}
        </p>
      ) : null}

      {lines.length ? (
        <div
          className="harmonic-hud-subtitles"
          data-size={subtitleSize}
          role="log"
          aria-live="polite"
          aria-label={t('harmonic:hud_subtitles', { defaultValue: 'Subtitles' })}
        >
          {lines.map((s) => (
            <p
              key={`${s.speakerId ?? s.speaker}:${s.key}`}
              className="harmonic-hud-panel harmonic-hud-subtitle"
              data-speaker={s.speakerId}
              data-channel={s.channel}
            >
              {s.speaker ? (
                <b>
                  {s.channel === 'radio' ? (
                    <Radio
                      className="harmonic-hud-radio-glyph size-3.5"
                      aria-label={t('harmonic:hud_radio', { defaultValue: 'Radio' })}
                      role="img"
                    />
                  ) : null}
                  {speakerLabel(t, s.speakerId, s.speaker)}:{' '}
                </b>
              ) : null}
              {t(s.key, { defaultValue: s.defaultValue })}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
