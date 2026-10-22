'use client';

import { useEffect, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Hourglass } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AUTO_DELETE_MONTHS, type AutoDeleteMonths } from '@/lib/posts-plus/constants';

/**
 * X8 - "Auto-delete my posts older than N months", in Settings > Content.
 *
 * Off by default. Posts go to the recycle bin (restorable); pinned posts and
 * posts you have bookmarked are always kept, and so is anything you restore.
 * Choosing a window first shows how many posts it would take, because the first
 * run is the one that surprises people.
 */
export function AutoDeleteSetting() {
  const { t } = useTranslation('f-posts-plus');
  const confirm = useConfirm();
  const labelId = useId();
  const hintId = useId();
  const [months, setMonths] = useState<AutoDeleteMonths | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/auto-delete', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { months?: AutoDeleteMonths | null } | null) => {
        if (cancelled) return;
        setMonths(d?.months ?? null);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: AutoDeleteMonths | null) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/auto-delete', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMonths(next);
    } catch {
      toast.error(t('autodelete-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(false);
    }
  };

  const change = async (value: string) => {
    if (!value) {
      await save(null);
      return;
    }
    const next = Number(value) as AutoDeleteMonths;
    let eligible = 0;
    try {
      const res = await fetch(`/api/settings/auto-delete?preview=${next}`, {
        credentials: 'include',
      });
      if (res.ok) eligible = ((await res.json()) as { eligible?: number }).eligible ?? 0;
    } catch {
      /* the confirmation still explains the rule without a number */
    }
    const ok = await confirm({
      title: t('autodelete-confirm-title', {
        defaultValue: 'Auto-delete posts older than {{n}} months?',
        n: next,
      }),
      description:
        eligible > 0
          ? t('autodelete-confirm-count', {
              defaultValue:
                '{{n}} of your posts are older than that. They move to your recycle bin tonight; pinned and bookmarked posts stay.',
              n: eligible >= 1000 ? '1000+' : eligible,
            })
          : t('autodelete-confirm-none', {
              defaultValue:
                'None of your posts are that old yet. From now on older posts move to your recycle bin; pinned and bookmarked posts stay.',
            }),
      confirmLabel: t('autodelete-confirm', { defaultValue: 'Turn on' }),
      danger: true,
    });
    if (ok) await save(next);
  };

  return (
    <section className="glass-fill mb-6 flex flex-col gap-3 rounded-site p-4 sm:flex-row sm:items-start">
      <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-site-text-dim" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 id={labelId} className="text-sm font-semibold text-site-text">
          {t('autodelete-title', { defaultValue: 'Auto-delete old posts' })}
        </h2>
        <p id={hintId} className="mt-0.5 text-sm text-site-text-muted">
          {t('autodelete-hint', {
            defaultValue:
              'Move your posts to the recycle bin once they are older than the window you pick. Pinned posts, posts you bookmarked, and posts you restore are always kept.',
          })}{' '}
          <Link to="/trash" className="text-site-accent underline-offset-2 hover:underline">
            {t('autodelete-trash', { defaultValue: 'Open recycle bin' })}
          </Link>
        </p>
      </div>
      <Select
        value={months ? String(months) : ''}
        onChange={(e) => void change(e.target.value)}
        disabled={!ready || saving}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="sm:w-44"
      >
        <option value="">{t('autodelete-off', { defaultValue: 'Off' })}</option>
        {AUTO_DELETE_MONTHS.map((m) => (
          <option key={m} value={String(m)}>
            {t('autodelete-option', { defaultValue: 'Older than {{n}} months', n: m })}
          </option>
        ))}
      </Select>
    </section>
  );
}
