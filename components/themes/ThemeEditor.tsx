'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { relativeLuminance } from '@/lib/appearance/contrast';
import {
  DEFAULT_THEME_TOKENS,
  THEME_PRICE_MIN,
  THEME_PRICE_MAX,
  TINT_ALPHA_MIN,
  TINT_ALPHA_MAX_DARK,
  TINT_ALPHA_MAX_LIGHT,
  clampTintAlpha,
  lintThemeContrast,
  deriveAppliedTheme,
  type ThemeTokens,
  type UserThemeView,
} from '@/lib/themes/tokens';
import { useThemeStore } from '@/stores/themeStore';
import { ThemeMiniShell } from './ThemeMiniShell';

type ColorKey =
  | 'canvasBase'
  | 'glow1'
  | 'glow2'
  | 'glow3'
  | 'tint'
  | 'text'
  | 'textMuted'
  | 'accent'
  | 'accentFg'
  | 'border';

const SCENE_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'canvasBase', label: 'Canvas base' },
  { key: 'glow1', label: 'Aurora glow 1' },
  { key: 'glow2', label: 'Aurora glow 2' },
  { key: 'glow3', label: 'Aurora glow 3' },
];
const INK_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentFg', label: 'Accent text' },
  { key: 'border', label: 'Border' },
];

// Friendly fallbacks for the (dynamic) contrast-pair keys — i18next uses these
// when the per-locale translation is absent.
const CONTRAST_LABEL: Record<string, string> = {
  'text-on-glass': 'Text on glass',
  'muted-on-glass': 'Muted text on glass',
  'accentFg-on-accent': 'Accent label on accent',
};

export function ThemeEditor({
  initial,
  onDone,
}: {
  initial: UserThemeView | null;
  onDone: () => void;
}) {
  const { t } = useTranslation('theme-studio');
  const isNew = initial === null;
  const [name, setName] = useState(initial?.name ?? 'My theme');
  const [tokens, setTokens] = useState<ThemeTokens>(initial?.tokens ?? DEFAULT_THEME_TOKENS);
  const [price, setPrice] = useState(initial?.priceCoins ?? 500);
  const [busy, setBusy] = useState(false);
  const [themeId, setThemeId] = useState(initial?.id ?? null);

  const setUserThemePreview = useThemeStore((s) => s.setUserThemePreview);

  const published = initial?.status === 'PUBLISHED';
  const editable = !published; // token map is immutable once published
  const issues = lintThemeContrast(tokens);

  const tintMax =
    relativeLuminance(tokens.canvasBase) >= 0.5 ? TINT_ALPHA_MAX_LIGHT : TINT_ALPHA_MAX_DARK;

  function setColor(key: ColorKey, value: string) {
    setTokens((prev) => {
      const next = { ...prev, [key]: value };
      // Changing the base can shrink the legal tint-alpha ceiling (§14.1).
      if (key === 'canvasBase') next.tintAlpha = clampTintAlpha(next.tintAlpha, value);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      if (isNew && !themeId) {
        const res = await fetch('/api/themes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, tokens }),
        });
        if (!res.ok) throw new Error(await errorCode(res));
        const { id } = (await res.json()) as { id: string };
        setThemeId(id);
      } else {
        const res = await fetch(`/api/themes/${themeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editable ? { name, tokens } : { name }),
        });
        if (!res.ok) throw new Error(await errorCode(res));
      }
      toast.success(t('saved', { defaultValue: 'Saved' }));
    } catch (e) {
      toast.error(saveError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (issues.length > 0) {
      toast.error(t('gate-failed', { defaultValue: 'Fix the contrast warnings first' }));
      return;
    }
    if (!themeId) {
      toast.error(t('save-first', { defaultValue: 'Save the theme first' }));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/themes/${themeId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceCoins: price }),
      });
      if (!res.ok) throw new Error(await errorCode(res));
      toast.success(t('published', { defaultValue: 'Published to the shop' }));
      onDone();
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === 'CONTRAST_GATE'
          ? t('gate-failed', { defaultValue: 'Fix the contrast warnings first' })
          : saveError(e, t),
      );
    } finally {
      setBusy(false);
    }
  }

  function previewOnSite() {
    setUserThemePreview({ ...deriveAppliedTheme(themeId ?? 'draft', tokens), name });
    toast.success(
      t('preview-on-site-toast', {
        defaultValue: 'Previewing on the whole site — use the bar to exit',
      }),
    );
  }

  function done() {
    setUserThemePreview(null); // drop any transient site preview this editor started
    onDone();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      {/* Live preview (§14.3): sticky on top below md, right column on desktop. */}
      <div className="md:order-2">
        <div className="site-sticky-secondary space-y-3">
          <ThemeMiniShell tokens={tokens} size="lg" />

          {/* Contrast guardrails */}
          {issues.length > 0 ? (
            <ul className="rounded-site border border-site-warning/40 bg-site-warning/5 p-3 text-xs text-site-warning">
              {issues.map((i) => (
                <li key={i.pair}>
                  {t(`contrast-${i.pair}`, { defaultValue: CONTRAST_LABEL[i.pair] ?? i.pair })}:{' '}
                  {i.ratio}:1 ({t('contrast-need', { defaultValue: 'need' })} {i.need}:1)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-site-success">
              {t('gate-pass', { defaultValue: 'Passes contrast checks ✓' })}
            </p>
          )}

          <Button variant="outline" size="sm" onClick={previewOnSite} className="w-full">
            <Eye className="h-4 w-4" aria-hidden />
            {t('preview-on-site', { defaultValue: 'Preview on the whole site' })}
          </Button>
        </div>
      </div>

      {/* Controls (accordion sections; thumb-friendly inputs) */}
      <div className="space-y-3 md:order-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          aria-label={t('theme-name', { defaultValue: 'Theme name' })}
          placeholder={t('theme-name', { defaultValue: 'Theme name' })}
        />

        {editable ? (
          <>
            <Section title={t('section-scene', { defaultValue: 'Scene' })}>
              <div className="grid grid-cols-2 gap-3">
                {SCENE_FIELDS.map((f) => (
                  <ColorField
                    key={f.key}
                    field={f}
                    value={tokens[f.key]}
                    onChange={setColor}
                    t={t}
                  />
                ))}
              </div>
            </Section>

            <Section title={t('section-material', { defaultValue: 'Glass material' })}>
              <div className="grid grid-cols-2 gap-3">
                <ColorField
                  field={{ key: 'tint', label: 'Glass tint' }}
                  value={tokens.tint}
                  onChange={setColor}
                  t={t}
                />
              </div>
              <RangeRow
                label={t('tint-alpha', { defaultValue: 'Tint strength' })}
                min={TINT_ALPHA_MIN}
                max={tintMax}
                step={0.01}
                value={tokens.tintAlpha}
                display={tokens.tintAlpha.toFixed(2)}
                onChange={(v) =>
                  setTokens((p) => ({ ...p, tintAlpha: clampTintAlpha(v, p.canvasBase) }))
                }
              />
              <RangeRow
                label={t('glint-strength', { defaultValue: 'Rim / glint' })}
                min={0}
                max={1}
                step={0.05}
                value={tokens.glintStrength}
                display={tokens.glintStrength.toFixed(2)}
                onChange={(v) => setTokens((p) => ({ ...p, glintStrength: v }))}
              />
            </Section>

            <Section title={t('section-ink', { defaultValue: 'Ink & accent' })}>
              <div className="grid grid-cols-2 gap-3">
                {INK_FIELDS.map((f) => (
                  <ColorField
                    key={f.key}
                    field={f}
                    value={tokens[f.key]}
                    onChange={setColor}
                    t={t}
                  />
                ))}
              </div>
              <RangeRow
                label={t('radius', { defaultValue: 'Radius' })}
                min={0}
                max={32}
                step={1}
                value={tokens.radius}
                display={`${tokens.radius}px`}
                onChange={(v) => setTokens((p) => ({ ...p, radius: Math.round(v) }))}
              />
            </Section>
          </>
        ) : (
          <p className="text-sm text-site-text-muted">
            {t('published-note', {
              defaultValue: 'Published themes are locked. Delist to edit colors.',
            })}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="accent" size="sm" onClick={save} loading={busy}>
            {t('save', { defaultValue: 'Save draft' })}
          </Button>
          {!published ? (
            <>
              <Input
                type="number"
                inputMode="numeric"
                min={THEME_PRICE_MIN}
                max={THEME_PRICE_MAX}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                aria-label={t('price', { defaultValue: 'Price in coins' })}
                className="w-24"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={publish}
                disabled={busy || issues.length > 0}
              >
                {t('publish', { defaultValue: 'Publish' })}
              </Button>
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={done}>
            {t('done', { defaultValue: 'Done' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

async function errorCode(res: Response): Promise<string> {
  const d = (await res.json().catch(() => null)) as { error?: string } | null;
  return d?.error ?? 'ERROR';
}

function saveError(e: unknown, t: (k: string, o?: { defaultValue: string }) => string): string {
  return e instanceof Error && e.message === 'MEMBERS_ONLY'
    ? t('members-only', { defaultValue: 'Creating themes needs a membership' })
    : t('error', { defaultValue: 'Something went wrong' });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="glass-fill rounded-site">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-site-text select-none">
        {title}
      </summary>
      <div className="space-y-3 px-3 pt-1 pb-3">{children}</div>
    </details>
  );
}

function ColorField({
  field,
  value,
  onChange,
  t,
}: {
  field: { key: ColorKey; label: string };
  value: string;
  onChange: (key: ColorKey, value: string) => void;
  t: (k: string, o?: { defaultValue: string }) => string;
}) {
  const label = t(field.key, { defaultValue: field.label });
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm text-site-text">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-site-sm border border-site-border bg-transparent"
        aria-label={label}
      />
      <span className="truncate">{label}</span>
    </label>
  );
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm text-site-text">
      <span className="w-24 shrink-0">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
        className="flex-1"
      />
      <span className="w-12 text-end text-xs tabular-nums text-site-text-muted">{display}</span>
    </div>
  );
}
