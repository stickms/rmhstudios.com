'use client';

/**
 * GlassClarityControl (§5.46) — the frosted↔clear glass slider that replaces the
 * old reduce-transparency toggle. One axis, five stops:
 *   0 Opaque · 1 Calm · 2 Default · 3 Airy · 4 Clear.
 * Stop 0 IS the reduce-transparency mechanism (html.reduce-transparency); stops
 * 1/3/4 set the two inline user factors the glass classes consume; stop 2 is the
 * shipped default. Dragging updates the bounded mini preview; releasing applies
 * the selected material to the page and commits it (store + PUT). Keeping the
 * global backdrop graph out of pointer-move prevents mobile compositor stalls.
 * The OS `prefers-reduced-transparency` query still forces opaque regardless.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { useThemeStore } from '@/stores/themeStore';
import { GLASS_LEVELS, GLASS_LEVEL_VARS, applyGlassLevel } from '@/lib/appearance/prefs';

async function persistGlassLevel(level: number) {
  await fetch('/api/preferences/appearance', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    // reduceTransparency mirrors stop 0 so older clients / the boolean column
    // stay coherent with the slider.
    body: JSON.stringify({ glassLevel: level, reduceTransparency: level === 0 }),
  }).catch(() => {});
}

export function GlassClarityControl() {
  const { t } = useTranslation('feed');
  const glassLevel = useThemeStore((s) => s.glassLevel);
  const setGlassLevel = useThemeStore((s) => s.setGlassLevel);
  const setReduceTransparency = useThemeStore((s) => s.setReduceTransparency);

  // `draft` follows the pointer inside the bounded preview, then commits on
  // release. A cancelled touch restores the last committed stop.
  // Re-sync when the committed level changes elsewhere (account sync).
  const [draft, setDraft] = useState(glassLevel);
  useEffect(() => setDraft(glassLevel), [glassLevel]);

  const [osReduced, setOsReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const update = () => setOsReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const labels: Record<number, string> = {
    0: t('settings-glass-0', { defaultValue: 'Opaque' }),
    1: t('settings-glass-1', { defaultValue: 'Calm' }),
    2: t('settings-glass-2', { defaultValue: 'Default' }),
    3: t('settings-glass-3', { defaultValue: 'Airy' }),
    4: t('settings-glass-4', { defaultValue: 'Clear' }),
  };

  function preview(v: number) {
    setDraft(v);
  }
  function commit(v: number) {
    // Apply once at the interaction boundary. Recomputing every backdrop-filter
    // on each touchmove can pin mobile compositors and strand ambient animation.
    applyGlassLevel(document.documentElement, v);
    setGlassLevel(v);
    setReduceTransparency(v === 0);
    void persistGlassLevel(v);
  }
  function recoverDraft() {
    setDraft(useThemeStore.getState().glassLevel);
  }

  // The mini preview's glass reflects the DRAFT stop via locally-scoped vars
  // (stop 0 forces opaque; stop 2 uses the base tokens).
  const factors = GLASS_LEVEL_VARS[draft];
  const paneStyle: CSSProperties =
    draft === 0
      ? {
          background: 'var(--site-surface-opaque)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          borderColor: 'var(--site-border)',
        }
      : factors
        ? ({
            '--glass-user-blur': factors.blur,
            '--glass-user-tint': factors.tint,
          } as CSSProperties)
        : {};

  return (
    <div>
      <p className="text-sm font-medium text-site-text">
        {t('settings-glass-clarity', { defaultValue: 'Glass clarity' })}
      </p>
      <p className="mb-3 text-xs text-site-text-muted">
        {t('settings-glass-clarity-hint', {
          defaultValue: 'How much of the scene shows through the frosted glass.',
        })}
      </p>

      {/* Live preview — mini aurora swatch with a glass pane over it (reuses the
          --site-canvas mini-canvas pattern) that re-renders at the dragged stop. */}
      <div
        aria-label={t('settings-glass-preview-label', { defaultValue: 'Glass clarity preview' })}
        role="img"
        className="relative mb-3 h-20 overflow-hidden rounded-site-sm border border-site-border"
        style={{ background: 'var(--site-canvas, var(--site-bg))' }}
      >
        <div className=" absolute inset-3 rounded-site-sm p-2.5" style={paneStyle}>
          <div className="h-1.5 w-2/5 rounded-full bg-site-text opacity-90" />
          <div className="mt-1.5 h-1.5 w-3/5 rounded-full bg-site-text-dim" />
          <div className="mt-2 h-3 w-8 rounded-full bg-site-accent" />
        </div>
      </div>

      <Slider
        min={0}
        max={4}
        step={1}
        value={[draft]}
        onValueChange={([v]) => preview(v)}
        onValueCommit={([v]) => commit(v)}
        onPointerCancel={recoverDraft}
        aria-label={t('settings-glass-clarity', { defaultValue: 'Glass clarity' })}
      />

      <div className="mt-2 flex justify-between text-[11px] text-site-text-dim">
        {GLASS_LEVELS.map((lvl) => (
          <span key={lvl} className={lvl === draft ? 'font-semibold text-site-accent' : undefined}>
            {labels[lvl]}
          </span>
        ))}
      </div>

      {osReduced && (
        <p className="mt-2 text-xs text-site-text-dim">
          {t('settings-glass-os-note', {
            defaultValue:
              'Your device is set to reduce transparency, so glass stays opaque regardless of this setting.',
          })}
        </p>
      )}
    </div>
  );
}
