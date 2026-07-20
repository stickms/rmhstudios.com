'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_THEME_TOKENS,
  applyThemeTokens,
  THEME_PRICE_MIN,
  THEME_PRICE_MAX,
  type ThemeTokens,
  type UserThemeView,
} from '@/lib/themes/tokens';
import { lintThemeContrast } from '@/lib/themes/validate';

const COLOR_FIELDS: { key: keyof ThemeTokens; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'surfaceHover', label: 'Surface hover' },
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
  { key: 'border', label: 'Border' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentFg', label: 'Accent text' },
];

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
  const previewRef = useRef<HTMLDivElement>(null);

  const published = initial?.status === 'PUBLISHED';
  const editable = !published; // token map is immutable once published

  useEffect(() => {
    if (previewRef.current) applyThemeTokens(previewRef.current, tokens);
  }, [tokens]);

  const issues = lintThemeContrast(tokens);

  function setColor(key: keyof ThemeTokens, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }));
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
        if (!res.ok) throw new Error();
        const { id } = (await res.json()) as { id: string };
        setThemeId(id);
      } else {
        const res = await fetch(`/api/themes/${themeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editable ? { name, tokens } : { name }),
        });
        if (!res.ok) throw new Error();
      }
      toast.success(t('saved', { defaultValue: 'Saved' }));
    } catch {
      toast.error(t('error', { defaultValue: 'Something went wrong' }));
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
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error);
      }
      toast.success(t('published', { defaultValue: 'Published to the shop' }));
      onDone();
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === 'CONTRAST_GATE'
          ? t('gate-failed', { defaultValue: 'Fix the contrast warnings first' })
          : t('error', { defaultValue: 'Something went wrong' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Controls */}
      <div className="space-y-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          aria-label={t('theme-name', { defaultValue: 'Theme name' })}
          placeholder={t('theme-name', { defaultValue: 'Theme name' })}
        />
        {editable ? (
          <div className="grid grid-cols-2 gap-3">
            {COLOR_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-site-text">
                <input
                  type="color"
                  value={tokens[f.key] as string}
                  onChange={(e) => setColor(f.key, e.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded-site-sm border border-site-border bg-transparent"
                  aria-label={t(f.key, { defaultValue: f.label })}
                />
                <span className="truncate">{t(f.key, { defaultValue: f.label })}</span>
              </label>
            ))}
            <label className="col-span-2 flex items-center gap-3 text-sm text-site-text">
              <span className="w-20 shrink-0">{t('radius', { defaultValue: 'Radius' })}</span>
              <input
                type="range"
                min={0}
                max={32}
                value={tokens.radius}
                onChange={(e) => setTokens((p) => ({ ...p, radius: Number(e.target.value) }))}
                className="flex-1 accent-[var(--site-accent)]"
              />
              <span className="w-8 text-end text-site-text-muted">{tokens.radius}</span>
            </label>
          </div>
        ) : (
          <p className="text-sm text-site-text-muted">
            {t('published-note', { defaultValue: 'Published themes are locked. Delist to edit colors.' })}
          </p>
        )}

        {/* Contrast lint */}
        {issues.length > 0 ? (
          <ul className="rounded-site border border-site-warning/40 bg-site-warning/5 p-3 text-xs text-site-warning">
            {issues.map((i) => (
              <li key={i.pair}>
                {i.pair}: {i.ratio}:1 (need {i.need}:1)
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-site-success">{t('gate-pass', { defaultValue: 'Passes contrast checks ✓' })}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
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
              <Button variant="outline" size="sm" onClick={publish} disabled={busy || issues.length > 0}>
                {t('publish', { defaultValue: 'Publish' })}
              </Button>
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onDone}>
            {t('done', { defaultValue: 'Done' })}
          </Button>
        </div>
      </div>

      {/* Live preview (scoped: tokens applied to this container only) */}
      <div ref={previewRef} className="glass-pane rounded-site p-4">
        <p className="mb-2 text-sm font-semibold text-site-text">{t('preview', { defaultValue: 'Preview' })}</p>
        <div className="glass-fill mb-3 rounded-site p-3">
          <p className="text-sm text-site-text">{t('sample-card', { defaultValue: 'A sample card' })}</p>
          <p className="text-xs text-site-text-muted">{t('sample-muted', { defaultValue: 'Muted supporting text' })}</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-site bg-site-accent px-3 py-1.5 text-sm text-site-accent-fg">
            {t('sample-button', { defaultValue: 'Button' })}
          </button>
          <button className="rounded-site border border-site-border px-3 py-1.5 text-sm text-site-text">
            {t('sample-outline', { defaultValue: 'Outline' })}
          </button>
        </div>
      </div>
    </div>
  );
}
