'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ImageOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

/**
 * X12 — the "Require alt text" switch, in Settings → Content preferences.
 *
 * Off by default. When on, the composer will not publish (or schedule) a post
 * with an image that has no description, and neither will the server, so the
 * rule holds from any client. The read is deferred to the effect and the row
 * renders its off state meanwhile — a failed read just leaves it off.
 */
export function RequireAltTextSetting() {
  const { t } = useTranslation('f-feed-plus');
  const labelId = useId();
  const hintId = useId();
  const [value, setValue] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/alt-text', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { requireAltText?: boolean } | null) => {
        if (cancelled) return;
        setValue(d?.requireAltText ?? false);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const change = async (next: boolean) => {
    setSaving(true);
    const prev = value;
    setValue(next);
    try {
      const res = await fetch('/api/settings/alt-text', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requireAltText: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setValue(prev);
      toast.error(t('alt-setting-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-fill mb-6 flex items-start gap-3 rounded-site p-4">
      <ImageOff className="mt-0.5 h-5 w-5 shrink-0 text-site-text-dim" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 id={labelId} className="text-sm font-semibold text-site-text">
          {t('alt-setting-title', { defaultValue: 'Require alt text' })}
        </h2>
        <p id={hintId} className="mt-0.5 text-sm text-site-text-muted">
          {t('alt-setting-hint', {
            defaultValue:
              'Block your own posts that have an image without a description, so everything you share can be read with a screen reader.',
          })}
        </p>
      </div>
      <Switch
        checked={value}
        onCheckedChange={(v) => void change(v)}
        disabled={!ready || saving}
        aria-labelledby={labelId}
        aria-describedby={hintId}
      />
    </section>
  );
}
