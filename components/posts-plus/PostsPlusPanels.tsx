'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  DAY_MS,
  MAX_SERIES_TITLE,
  POST_TTLS,
  capsuleDateError,
  type PostTtl,
} from '@/lib/posts-plus/constants';
import type { PostsPlusCompose } from './PostsPlusCompose';

/** The composer dialogs for posts-plus. Default export so the composer can lazy-load it. */
export default function PostsPlusPanels({
  pp,
  getBody,
  canSubmit,
  onSealed,
}: {
  pp: PostsPlusCompose;
  getBody: () => Record<string, unknown>;
  canSubmit: boolean;
  onSealed: () => void;
}) {
  const close = () => pp.setPanel(null);
  return (
    <>
      {pp.panel === 'ttl' && <TtlDialog pp={pp} onClose={close} />}
      {pp.panel === 'series' && <SeriesDialog pp={pp} onClose={close} />}
      {pp.panel === 'capsule' && (
        <CapsuleDialog
          getBody={getBody}
          canSubmit={canSubmit}
          onSealed={onSealed}
          onClose={close}
        />
      )}
    </>
  );
}

const optionClass = (active: boolean) =>
  cn(
    'flex w-full items-center gap-2 rounded-site-sm px-3 py-2 text-sm transition-colors hover:bg-site-surface-hover',
    active ? 'text-site-accent' : 'text-site-text',
  );

/* ----------------------------- X8 · expiry -------------------------------- */

function TtlDialog({ pp, onClose }: { pp: PostsPlusCompose; onClose: () => void }) {
  const { t } = useTranslation('f-posts-plus');
  const labels: Record<PostTtl, string> = {
    '1h': t('ttl-1h', { defaultValue: '1 hour' }),
    '24h': t('ttl-24h', { defaultValue: '24 hours' }),
    '7d': t('ttl-7d', { defaultValue: '7 days' }),
  };
  const pick = (v: PostTtl | null) => {
    pp.setTtl(v);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('ttl-title', { defaultValue: 'Auto-delete this post' })}</DialogTitle>
          <DialogDescription>
            {t('ttl-hint', {
              defaultValue:
                'The post disappears after the time you pick. It lands in your recycle bin, where you can bring it back.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div role="listbox" aria-label={t('ttl-title', { defaultValue: 'Auto-delete this post' })}>
          <button
            type="button"
            role="option"
            aria-selected={!pp.ttl}
            onClick={() => pick(null)}
            className={optionClass(!pp.ttl)}
          >
            <span className="flex-1 text-left">{t('ttl-never', { defaultValue: 'Keep it' })}</span>
            {!pp.ttl && <Check className="h-4 w-4" aria-hidden />}
          </button>
          {POST_TTLS.map((v) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={pp.ttl === v}
              onClick={() => pick(v)}
              className={optionClass(pp.ttl === v)}
            >
              <span className="flex-1 text-left">{labels[v]}</span>
              {pp.ttl === v && <Check className="h-4 w-4" aria-hidden />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- X5 · series -------------------------------- */

interface SeriesOption {
  id: string;
  title: string;
  postCount: number;
}

function SeriesDialog({ pp, onClose }: { pp: PostsPlusCompose; onClose: () => void }) {
  const { t } = useTranslation('f-posts-plus');
  const [mine, setMine] = useState<SeriesOption[] | null>(null);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/series', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { mine?: SeriesOption[] } | null) => {
        if (!cancelled) setMine(d?.mine ?? []);
      })
      .catch(() => {
        if (!cancelled) setMine([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (s: { id: string; title: string } | null) => {
    pp.setSeries(s);
    onClose();
  };

  const create = async () => {
    const name = title.trim();
    if (name.length < 2) return;
    setCreating(true);
    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !data?.id) {
        toast.error(
          data?.error ?? t('series-create-failed', { defaultValue: 'Could not create the series' }),
        );
        return;
      }
      choose({ id: data.id, title: name });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('series-title', { defaultValue: 'Add to a series' })}</DialogTitle>
          <DialogDescription>
            {t('series-hint', {
              defaultValue:
                'This post becomes the next part of the series. Only public posts can be part of a series.',
            })}
          </DialogDescription>
        </DialogHeader>

        {mine === null ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <div role="listbox" aria-label={t('series-title', { defaultValue: 'Add to a series' })}>
            <button
              type="button"
              role="option"
              aria-selected={!pp.series}
              onClick={() => choose(null)}
              className={optionClass(!pp.series)}
            >
              <span className="flex-1 text-left">
                {t('series-none', { defaultValue: 'No series' })}
              </span>
              {!pp.series && <Check className="h-4 w-4" aria-hidden />}
            </button>
            {mine.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={pp.series?.id === s.id}
                onClick={() => choose({ id: s.id, title: s.title })}
                className={optionClass(pp.series?.id === s.id)}
              >
                <span className="min-w-0 flex-1 truncate text-left">{s.title}</span>
                <span className="text-xs text-site-text-dim">
                  {t('series-parts', { defaultValue: '{{n}} parts', n: s.postCount })}
                </span>
                {pp.series?.id === s.id && <Check className="h-4 w-4" aria-hidden />}
              </button>
            ))}
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_SERIES_TITLE))}
            placeholder={t('series-new-placeholder', { defaultValue: 'Name a new series' })}
            aria-label={t('series-new-placeholder', { defaultValue: 'Name a new series' })}
          />
          <Button
            type="submit"
            variant="accent"
            disabled={title.trim().length < 2}
            loading={creating}
          >
            <Plus aria-hidden />
            {t('series-create', { defaultValue: 'Create' })}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Z7 · time capsule ---------------------------- */

/** `datetime-local` value for `ms` from now, in the viewer's wall clock. */
function localValueIn(ms: number): string {
  const d = new Date(Date.now() + ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function CapsuleDialog({
  getBody,
  canSubmit,
  onSealed,
  onClose,
}: {
  getBody: () => Record<string, unknown>;
  canSubmit: boolean;
  onSealed: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('f-posts-plus');
  const [value, setValue] = useState('');
  const [min, setMin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolved after mount: the server's clock and zone are not the viewer's.
  useEffect(() => {
    setMin(localValueIn(DAY_MS + 5 * 60_000));
    setValue(localValueIn(7 * DAY_MS));
  }, []);

  const quick: { key: string; label: string; ms: number }[] = [
    { key: 'w', label: t('capsule-1w', { defaultValue: 'In a week' }), ms: 7 * DAY_MS },
    { key: 'm', label: t('capsule-1m', { defaultValue: 'In a month' }), ms: 30 * DAY_MS },
    { key: '6m', label: t('capsule-6m', { defaultValue: 'In 6 months' }), ms: 182 * DAY_MS },
    { key: 'y', label: t('capsule-1y', { defaultValue: 'In a year' }), ms: 365 * DAY_MS },
  ];

  const seal = async () => {
    const openAt = new Date(value);
    const problem = capsuleDateError(openAt);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/scheduled', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...getBody(), scheduledAt: openAt.toISOString(), capsule: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          data?.error ?? t('capsule-failed', { defaultValue: 'Could not seal the capsule' }),
        );
        return;
      }
      toast.success(
        t('capsule-sealed', {
          defaultValue: 'Sealed. It opens on {{date}}.',
          date: openAt.toLocaleDateString(),
        }),
      );
      onSealed();
      onClose();
    } catch {
      setError(t('capsule-failed', { defaultValue: 'Could not seal the capsule' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('capsule-title', { defaultValue: 'Seal as a time capsule' })}
          </DialogTitle>
          <DialogDescription>
            {t('capsule-hint', {
              defaultValue:
                'Only you can see it until the date you pick, then it posts itself. A capsule stays sealed for at least a day and cannot be edited, but you can cancel it from Drafts.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Button
              key={q.key}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setValue(localValueIn(q.ms))}
            >
              {q.label}
            </Button>
          ))}
        </div>

        <label className="block text-sm text-site-text-muted">
          <span className="mb-1 block">{t('capsule-open-on', { defaultValue: 'Opens on' })}</span>
          <Input
            type="datetime-local"
            value={value}
            min={min}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </label>

        {!canSubmit && (
          <p className="text-sm text-site-text-muted">
            {t('capsule-empty', {
              defaultValue: 'Write something first - there is nothing to seal yet.',
            })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-site-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type="button"
            variant="accent"
            disabled={!canSubmit || !value}
            loading={busy}
            onClick={() => void seal()}
          >
            {t('capsule-seal', { defaultValue: 'Seal capsule' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
