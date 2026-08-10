'use client';

/**
 * "What happened" — the write-up for one session, inside its sheet.
 *
 * Several accounts per night rather than one shared field, because the GM
 * remembers the plot and a player remembers their character nearly dying, and a
 * single box means whoever types second overwrites the first. The AI summary
 * sits above them as the "previously on" paragraph; the accounts stay
 * underneath, attributed, because the summary is a convenience and the words
 * people wrote are the record.
 *
 * The entries load when the sheet opens, not with the board — most sessions are
 * never opened, and thirty nights of write-ups in every page load to render a
 * panel behind a tap is the wrong trade. That means this component owns a
 * fetch, so it also owns the three states a fetch has: loading, failed with a
 * retry, and empty.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecapDTO } from '@/lib/pf2ecal/types';
import { RECAP_MAX } from '@/lib/pf2ecal/types';
import { api } from './state';
import { EASE, TRANSITION } from './motion';

interface RecapPanelProps {
  sessionId: string;
  /** Whether the session has already happened — it changes what we invite. */
  isPast: boolean;
  canEdit: boolean;
  /** From the board, so the panel can show something before its own fetch lands. */
  knownSummary: string | null;
  knownCount: number;
  /** Lets the page refresh the board's count once an entry is added. */
  onAdded?: () => void;
}

function formatWhen(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function RecapPanel({
  sessionId,
  isPast,
  canEdit,
  knownSummary,
  knownCount,
  onAdded,
}: RecapPanelProps) {
  const { t } = useTranslation('r-pf2ecal');
  const [entries, setEntries] = useState<RecapDTO[] | null>(null);
  const [summary, setSummary] = useState<string | null>(knownSummary);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setFailed(false);
      api
        .recap(sessionId, signal)
        .then((data) => {
          setEntries(data.entries);
          // The summary is regenerated server-side on this read, so the fresh
          // one wins over whatever the board was carrying.
          setSummary(data.summary);
        })
        .catch(() => {
          if (!signal?.aborted) setFailed(true);
        });
    },
    [sessionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setEntries(null);
    setSummary(knownSummary);
    load(controller.signal);
    return () => controller.abort();
    // `knownSummary` deliberately absent: it is the seed for this session's
    // panel, and re-running on a board refetch would refire the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, sessionId]);

  const submit = () => {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    api
      .addRecap(sessionId, body)
      .then((data) => {
        setEntries((current) => [...(current ?? []), data.entry]);
        setDraft('');
        setWriting(false);
        onAdded?.();
      })
      .catch(() => setFailed(true))
      .finally(() => setSaving(false));
  };

  const count = entries?.length ?? knownCount;

  return (
    <div>
      <p className="pf2e-mono-label mb-1.5 flex items-center gap-1.5">
        <BookOpen size={13} aria-hidden />
        {t('what-happened', { defaultValue: 'What happened' })}
      </p>

      {summary && (
        <>
          <p className="pf2e-body break-words">{summary}</p>
          <p className="pf2e-caption mt-1.5">
            {t('recap-summary-note', {
              defaultValue: 'Summarised by AI from the notes below.',
            })}
          </p>
        </>
      )}

      {/* Loading is only shown when there is nothing else to look at. Once the
          board has handed over a summary, a spinner under it would be noise
          about a request whose result the reader already has. */}
      {entries === null && !summary && !failed && (
        <p className="pf2e-caption flex items-center gap-1.5">
          <Loader2 size={13} aria-hidden className="animate-spin" />
          {t('recap-loading', { defaultValue: 'Loading the write-up…' })}
        </p>
      )}

      {failed && (
        <p className="pf2e-caption" role="status">
          {t('recap-failed', { defaultValue: 'Could not load the write-up.' })}{' '}
          <button type="button" className="underline" onClick={() => load()}>
            {t('try-again', { defaultValue: 'Try again' })}
          </button>
        </p>
      )}

      {entries !== null && entries.length === 0 && !summary && !failed && (
        <p className="pf2e-caption">
          {isPast
            ? t('recap-empty-past', {
                defaultValue: 'Nobody has written this one up yet.',
              })
            : t('recap-empty-future', {
                defaultValue: 'Nothing here yet — this is where the write-up goes afterwards.',
              })}
        </p>
      )}

      {entries !== null && entries.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li
                key={entry.id}
                className="pf2e-card-flat p-3"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={TRANSITION}
              >
                <p className="pf2e-body whitespace-pre-wrap break-words">{entry.body}</p>
                <p className="pf2e-caption mt-1.5">
                  {entry.authorName ?? t('someone', { defaultValue: 'Someone' })}
                  <span aria-hidden> · </span>
                  <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {canEdit && (
        <div className="mt-3">
          <AnimatePresence initial={false} mode="wait">
            {writing ? (
              <motion.div
                key="composer"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="flex flex-col gap-2 overflow-hidden"
              >
                <label className="pf2e-sr-only" htmlFor={`pf2e-recap-${sessionId}`}>
                  {t('what-happened', { defaultValue: 'What happened' })}
                </label>
                <textarea
                  id={`pf2e-recap-${sessionId}`}
                  className="pf2e-field"
                  rows={4}
                  autoFocus
                  value={draft}
                  maxLength={RECAP_MAX}
                  placeholder={t('recap-placeholder', {
                    defaultValue: 'What the party did, who they met, what went wrong…',
                  })}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm"
                    onClick={() => {
                      setWriting(false);
                      setDraft('');
                    }}
                  >
                    {t('cancel', { defaultValue: 'Cancel' })}
                  </button>
                  <button
                    type="button"
                    className="pf2e-btn pf2e-btn-primary pf2e-btn-sm"
                    disabled={!draft.trim() || saving}
                    onClick={submit}
                  >
                    {saving
                      ? t('saving', { defaultValue: 'Saving…' })
                      : t('add-recap', { defaultValue: 'Add to the write-up' })}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="open"
                type="button"
                className="pf2e-btn pf2e-btn-secondary pf2e-btn-sm"
                onClick={() => setWriting(true)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={TRANSITION}
              >
                {count > 0
                  ? t('add-your-account', { defaultValue: 'Add your own account' })
                  : t('write-it-up', { defaultValue: 'Write up what happened' })}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
