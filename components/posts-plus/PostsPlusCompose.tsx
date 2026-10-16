'use client';

import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Check, Hourglass, MessageCircleQuestion, Package, X } from 'lucide-react';
import { useQotdAnswering } from '@/lib/posts-plus/qotd-store';
import type { PostTtl } from '@/lib/posts-plus/constants';

/**
 * posts-plus composer pieces: post expiry (X8), add-to-series (X5), the
 * question-of-the-day tag (X4) and the time-capsule entry (Z7).
 *
 * This file is what the (hot) composer imports, so it stays small: the state
 * hook, three menu rows and three chips. The dialogs - which fetch series and
 * seal capsules - are a separate chunk that loads the first time one is opened.
 */

const PostsPlusPanels = lazy(() => import('./PostsPlusPanels'));

export type PostsPlusPanel = 'ttl' | 'series' | 'capsule';

export interface PostsPlusCompose {
  ttl: PostTtl | null;
  setTtl: (t: PostTtl | null) => void;
  series: { id: string; title: string } | null;
  setSeries: (s: { id: string; title: string } | null) => void;
  panel: PostsPlusPanel | null;
  setPanel: (p: PostsPlusPanel | null) => void;
  answering: { dayKey: string; text: string } | null;
  clearAnswering: () => void;
  /** Extra fields for POST /api/rmharks. */
  bodyFields: Record<string, unknown>;
  /** Clear everything after a successful post. */
  reset: () => void;
  /** Put a snapshot back (the optimistic post failed and the draft is restored). */
  restore: (d: {
    ttl: PostTtl | null;
    series: { id: string; title: string } | null;
    answering: { dayKey: string; text: string } | null;
  }) => void;
}

export function usePostsPlusCompose(): PostsPlusCompose {
  const [ttl, setTtl] = useState<PostTtl | null>(null);
  const [series, setSeries] = useState<{ id: string; title: string } | null>(null);
  const [panel, setPanel] = useState<PostsPlusPanel | null>(null);
  const answering = useQotdAnswering((s) => s.answering);
  const clearAnswering = useQotdAnswering((s) => s.clear);

  const bodyFields = useMemo<Record<string, unknown>>(
    () => ({
      ...(ttl ? { ttl } : {}),
      ...(series ? { seriesId: series.id } : {}),
      ...(answering ? { qotdDay: answering.dayKey } : {}),
    }),
    [ttl, series, answering],
  );

  const reset = useCallback(() => {
    setTtl(null);
    setSeries(null);
    setPanel(null);
    clearAnswering();
  }, [clearAnswering]);

  const startAnswering = useQotdAnswering((s) => s.start);
  const restore = useCallback<PostsPlusCompose['restore']>(
    (d) => {
      setTtl(d.ttl);
      setSeries(d.series);
      if (d.answering) startAnswering(d.answering);
    },
    [startAnswering],
  );

  return {
    ttl,
    setTtl,
    series,
    setSeries,
    panel,
    setPanel,
    answering,
    clearAnswering,
    bodyFields,
    reset,
    restore,
  };
}

const rowClass =
  'flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors';

/** Rows for the composer's (+) menu. `onPick` closes the menu. */
export function PostsPlusMenuItems({ pp, onPick }: { pp: PostsPlusCompose; onPick: () => void }) {
  const { t } = useTranslation('f-posts-plus');
  const open = (p: PostsPlusPanel) => () => {
    pp.setPanel(p);
    onPick();
  };
  return (
    <>
      <button type="button" onClick={open('ttl')} aria-pressed={!!pp.ttl} className={rowClass}>
        <Hourglass className={`w-4 h-4 ${pp.ttl ? 'text-site-accent' : 'text-site-text-dim'}`} />
        <span className="flex-1 text-left">
          {t('menu-expiry', { defaultValue: 'Auto-delete after…' })}
        </span>
        {pp.ttl && <Check className="w-4 h-4 text-site-accent" />}
      </button>
      <button
        type="button"
        onClick={open('series')}
        aria-pressed={!!pp.series}
        className={rowClass}
      >
        <BookOpen className={`w-4 h-4 ${pp.series ? 'text-site-accent' : 'text-site-text-dim'}`} />
        <span className="flex-1 text-left">
          {t('menu-series', { defaultValue: 'Add to a series…' })}
        </span>
        {pp.series && <Check className="w-4 h-4 text-site-accent" />}
      </button>
      <button type="button" onClick={open('capsule')} className={rowClass}>
        <Package className="w-4 h-4 text-site-text-dim" />
        <span className="flex-1 text-left">
          {t('menu-capsule', { defaultValue: 'Seal as a time capsule…' })}
        </span>
      </button>
    </>
  );
}

function Chip({
  icon: Icon,
  label,
  removeLabel,
  onRemove,
}: {
  icon: typeof Hourglass;
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-site-accent/40 bg-site-accent/10 px-3 py-1 text-xs font-medium text-site-accent transition-colors hover:bg-site-accent/20"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      <X className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">{removeLabel}</span>
    </button>
  );
}

/** Removable chips under the text for whatever is set. */
export function PostsPlusChips({ pp }: { pp: PostsPlusCompose }) {
  const { t } = useTranslation('f-posts-plus');
  if (!pp.ttl && !pp.series && !pp.answering) return null;
  const ttlLabel: Record<PostTtl, string> = {
    '1h': t('ttl-1h', { defaultValue: '1 hour' }),
    '24h': t('ttl-24h', { defaultValue: '24 hours' }),
    '7d': t('ttl-7d', { defaultValue: '7 days' }),
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {pp.answering && (
        <Chip
          icon={MessageCircleQuestion}
          label={t('chip-answering', {
            defaultValue: 'Answering: {{question}}',
            question: pp.answering.text,
          })}
          removeLabel={t('chip-answering-remove', { defaultValue: 'Stop answering the question' })}
          onRemove={pp.clearAnswering}
        />
      )}
      {pp.ttl && (
        <Chip
          icon={Hourglass}
          label={t('chip-expiry', {
            defaultValue: 'Deletes in {{after}}',
            after: ttlLabel[pp.ttl],
          })}
          removeLabel={t('chip-expiry-remove', { defaultValue: 'Remove auto-delete' })}
          onRemove={() => pp.setTtl(null)}
        />
      )}
      {pp.series && (
        <Chip
          icon={BookOpen}
          label={t('chip-series', { defaultValue: 'Series: {{title}}', title: pp.series.title })}
          removeLabel={t('chip-series-remove', { defaultValue: 'Remove from series' })}
          onRemove={() => pp.setSeries(null)}
        />
      )}
    </div>
  );
}

/** The dialogs. Mounts (and fetches its chunk) only once one has been opened. */
export function PostsPlusDialogs({
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
  if (!pp.panel) return null;
  return (
    <Suspense fallback={null}>
      <PostsPlusPanels pp={pp} getBody={getBody} canSubmit={canSubmit} onSealed={onSealed} />
    </Suspense>
  );
}
