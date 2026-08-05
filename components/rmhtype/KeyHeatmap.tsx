'use client';

/**
 * The per-key heatmap: which letters you are slow on, and which you miss.
 *
 * ## Why it paints in the site's semantic tokens
 *
 * A red→green heatmap is the canonical accessibility failure, and red–green is
 * the most common colour-vision deficiency there is — for those viewers, the
 * "you are fast here" green and the "you are weak here" red are the same colour,
 * so the entire picture says nothing. This site already solved that: the
 * colour-vision modes in Settings → Appearance retint `--site-success`,
 * `--site-warning` and `--site-danger` to an Okabe–Ito palette that stays
 * separable under deuteranopia, protanopia and tritanopia (see
 * `lib/appearance/prefs.ts` and the COLOUR-VISION MODES block in
 * `app/globals.css`). Painting the scale in those three tokens — and in nothing
 * else — is what makes the heatmap inherit that work instead of re-introducing
 * the failure it was built to fix. `lib/rmhtype/keystats.ts` owns the mapping and
 * explains why the middle of the scale is deliberately colourless.
 *
 * Colour is never the only carrier either way: every key prints its own
 * millisecond figure, and every key carries a screen-reader sentence naming its
 * level in words.
 *
 * The keys are data marks rather than surfaces, so they are plain elements with
 * a token-derived tint; the panel around them is the glass one.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  HEAT_LEVELS,
  HEAT_TOKENS,
  KEYBOARD_ROWS,
  SPACE_KEY,
  heatLevel,
  type HeatLevel,
  type KeyMetrics,
  type TypingLayout,
} from '@/lib/rmhtype/keystats';

/** How strongly a level tints its key. Weak keys read loudest on purpose. */
const INTENSITY: Record<HeatLevel, number> = {
  untested: 0,
  strong: 26,
  ok: 0,
  slow: 34,
  weak: 46,
};

function tintFor(level: HeatLevel): string | undefined {
  const token = HEAT_TOKENS[level];
  if (!token) return undefined;
  return `color-mix(in oklab, var(${token}) ${INTENSITY[level]}%, transparent)`;
}

function useLevelLabels() {
  const { t } = useTranslation('c-rmhtype');
  return {
    strong: t('heat-strong', { defaultValue: 'Fast' }),
    ok: t('heat-ok', { defaultValue: 'Steady' }),
    slow: t('heat-slow', { defaultValue: 'Slow' }),
    weak: t('heat-weak', { defaultValue: 'Weak' }),
    untested: t('heat-untested', { defaultValue: 'Not enough data' }),
  } satisfies Record<HeatLevel, string>;
}

interface KeyHeatmapProps {
  keys: KeyMetrics[];
  layout: TypingLayout;
  className?: string;
}

export function KeyHeatmap({ keys, layout, className }: KeyHeatmapProps) {
  const { t } = useTranslation('c-rmhtype');
  const labels = useLevelLabels();
  const byKey = new Map(keys.map((metric) => [metric.key, metric]));
  const rows = KEYBOARD_ROWS[layout] ?? KEYBOARD_ROWS.qwerty;

  const renderKey = (key: string, wide = false) => {
    const metric = byKey.get(key);
    const level: HeatLevel = metric ? heatLevel(metric) : 'untested';
    const ms = metric && level !== 'untested' ? Math.round(metric.msPerKey) : null;

    return (
      <div
        key={key}
        style={{ background: tintFor(level) }}
        className={cn(
          'flex h-11 shrink-0 flex-col items-center justify-center rounded-site border text-site-text',
          wide ? 'w-40' : 'w-11',
          level === 'untested' ? 'border-dashed border-site-border' : 'border-site-border',
        )}
      >
        <span aria-hidden className="font-mono text-sm leading-none">
          {key === SPACE_KEY ? '␣' : key}
        </span>
        <span
          aria-hidden
          className="mt-0.5 font-mono text-[10px] leading-none text-site-text-muted tabular-nums"
        >
          {ms === null ? '·' : ms}
        </span>
        <span className="sr-only">
          {t('key-reading', {
            defaultValue: '{{key}}: {{ms}} ms, {{errors}}% errors, {{level}}',
            key: key === SPACE_KEY ? t('space-key', { defaultValue: 'space' }) : key,
            ms: ms ?? 0,
            errors: metric ? Math.round(metric.errorRate * 100) : 0,
            level: labels[level],
          })}
        </span>
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* The keyboard is wider than a 360px phone, so IT scrolls — the page
          never does. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max flex-col items-center gap-1.5">
          {rows.map((row, index) => (
            <div key={index} className="flex gap-1.5" style={{ paddingLeft: index * 14 }}>
              {row.map((key) => renderKey(key))}
            </div>
          ))}
          <div className="flex gap-1.5">{renderKey(SPACE_KEY, true)}</div>
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {HEAT_LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5 text-xs text-site-text-muted">
            <span
              aria-hidden
              style={{ background: tintFor(level) }}
              className={cn(
                'size-3 rounded-site-sm border',
                level === 'untested' ? 'border-dashed border-site-border' : 'border-site-border',
              )}
            />
            {labels[level]}
          </li>
        ))}
      </ul>
    </div>
  );
}
