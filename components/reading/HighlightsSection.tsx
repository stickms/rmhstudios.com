'use client';

/**
 * The list under a document: your highlights, ones that no longer match the
 * text ("orphans" — listed rather than guessed at), readers' public notes, and a
 * legend for the dotted L8 underline. Also the keyboard route to highlighting
 * (select text, Tab here) alongside the floating toolbar.
 */

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Globe, Highlighter, Lock, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { resolveAnchor } from '@/lib/library/text-anchor';
import { MIN_READERS_TO_SHOW } from '@/lib/reading/passages';
import { useHighlightActions } from '@/lib/reading/client';
import type { HighlightView, PublicNoteView, ReadingDocKind } from '@/lib/reading/schema';
import type { useHighlightKit } from './useHighlightKit';

type Kit = ReturnType<typeof useHighlightKit>;

export function HighlightsSection({
  kind,
  docKey,
  unit,
  kit,
  publicNotes,
  signedIn,
  className,
}: {
  kind: ReadingDocKind;
  docKey: string;
  unit: string;
  kit: Kit;
  publicNotes: PublicNoteView[];
  signedIn: boolean;
  className?: string;
}) {
  const { t } = useTranslation('f-reading');
  const actions = useHighlightActions(kind, docKey);
  const [showAll, setShowAll] = useState(false);

  const text = kit.getText();
  const notes = useMemo(
    () =>
      publicNotes
        .filter((n) => n.unit === unit)
        .map((n) => {
          const hit = text ? resolveAnchor(text, n) : null;
          return { n, hit };
        }),
    [publicNotes, unit, text],
  );

  const shown = showAll ? kit.resolved : kit.resolved.slice(0, 5);

  async function dropOrphan(h: HighlightView) {
    try {
      await actions.remove(h.id);
    } catch {
      toast.error(t('highlight-failed', { defaultValue: 'Could not save that. Try again.' }));
    }
  }

  const nothing = kit.resolved.length === 0 && kit.orphans.length === 0 && notes.length === 0;

  return (
    <section
      data-rf-skip=""
      aria-label={t('highlights-section', { defaultValue: 'Highlights and notes' })}
      className={className ?? 'glass-fill mt-10 space-y-5 rounded-site p-4 text-sm'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-site-text">
          <Highlighter className="size-4 text-site-accent" aria-hidden />
          {t('highlights-heading', { defaultValue: 'Highlights and notes' })}
        </h2>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!kit.hasSelection}
            onClick={() => kit.beginFromSelection(false)}
          >
            {t('highlight-selection', { defaultValue: 'Highlight selection' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!kit.hasSelection}
            onClick={() => kit.beginFromSelection(true)}
          >
            <StickyNote aria-hidden />
            {t('note-selection', { defaultValue: 'Add note' })}
          </Button>
        </div>
      </div>

      {nothing ? (
        <p className="text-site-text-muted">
          {signedIn
            ? t('highlights-empty', {
                defaultValue:
                  'Select any passage to highlight it or attach a note. Only you see them unless you make a note public.',
              })
            : t('highlights-signed-out', {
                defaultValue: 'Sign in to highlight passages and keep notes.',
              })}
        </p>
      ) : null}

      {!kit.paints && kit.resolved.length > 0 ? (
        <p role="note" className="text-site-text-muted">
          {t('no-paint', {
            defaultValue:
              'This browser cannot draw highlights on the page, so they are listed here instead.',
          })}
        </p>
      ) : null}

      {kit.resolved.length > 0 ? (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.h.id} className="flex items-start gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-site-sm px-2 py-1 text-start hover:bg-site-surface-hover focus-visible:ring-2 focus-visible:ring-site-accent"
                onClick={() => kit.scrollTo(r.start, r.end)}
              >
                <span className="line-clamp-2 text-site-text">“{r.h.exact}”</span>
                {r.h.note ? (
                  <span className="mt-0.5 block text-site-text-muted">{r.h.note}</span>
                ) : null}
              </button>
              <span
                className="mt-1.5 text-site-text-dim"
                title={
                  r.h.isPublic
                    ? t('public', { defaultValue: 'Public' })
                    : t('private', { defaultValue: 'Private' })
                }
              >
                {r.h.isPublic ? (
                  <Globe className="size-4" aria-hidden />
                ) : (
                  <Lock className="size-4" aria-hidden />
                )}
                <span className="sr-only">
                  {r.h.isPublic
                    ? t('public', { defaultValue: 'Public' })
                    : t('private', { defaultValue: 'Private' })}
                </span>
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('edit-highlight', { defaultValue: 'Edit highlight' })}
                onClick={() => kit.editSaved(r)}
              >
                <Pencil aria-hidden />
              </Button>
            </li>
          ))}
          {kit.resolved.length > 5 ? (
            <li>
              <Button type="button" size="xs" variant="ghost" onClick={() => setShowAll((s) => !s)}>
                {showAll
                  ? t('show-fewer', { defaultValue: 'Show fewer' })
                  : t('show-all-n', { n: kit.resolved.length, defaultValue: 'Show all {{n}}' })}
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {kit.orphans.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-semibold text-site-text">
            {t('orphans-heading', {
              count: kit.orphans.length,
              defaultValue: '{{count}} highlight no longer matches the text',
              defaultValue_other: '{{count}} highlights no longer match the text',
            })}
          </h3>
          <p className="text-site-text-muted">
            {t('orphans-hint', {
              defaultValue:
                'The passage was edited or removed. We list these rather than guess where they belong.',
            })}
          </p>
          <ul className="space-y-2">
            {kit.orphans.map((h) => (
              <li key={h.id} className="flex items-start gap-2">
                <span className="min-w-0 flex-1 px-2 py-1">
                  <span className="line-clamp-2 text-site-text">“{h.exact}”</span>
                  {h.note ? (
                    <span className="mt-0.5 block text-site-text-muted">{h.note}</span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('remove-highlight', { defaultValue: 'Remove highlight' })}
                  onClick={() => void dropOrphan(h)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-semibold text-site-text">
            {t('public-notes', { defaultValue: 'Notes from readers' })}
          </h3>
          <ul className="space-y-3">
            {notes.map(({ n, hit }) => (
              <li key={n.id} className="flex items-start gap-2">
                <UserAvatar
                  src={n.author.image}
                  alt={n.author.name ?? ''}
                  size={24}
                  fallbackName={n.author.name ?? undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-site-text-muted">
                    <Link
                      to="/u/$userid"
                      params={{ userid: n.author.handle || n.author.id }}
                      className="font-medium text-site-text hover:underline"
                    >
                      {n.author.name ??
                        n.author.handle ??
                        t('someone', { defaultValue: 'Someone' })}
                    </Link>
                  </p>
                  <p className="text-site-text">{n.note}</p>
                  {hit ? (
                    <button
                      type="button"
                      className="mt-0.5 line-clamp-1 text-start text-site-text-dim underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-site-accent"
                      onClick={() => kit.scrollTo(hit.start, hit.end)}
                    >
                      “{n.exact}”
                    </button>
                  ) : (
                    <p className="line-clamp-1 text-site-text-dim">“{n.exact}”</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {kit.popularShown > 0 ? (
        <p className="text-site-text-dim">
          {t('popular-legend', {
            n: MIN_READERS_TO_SHOW,
            defaultValue: 'Dotted underlines mark passages at least {{n}} readers highlighted.',
          })}
        </p>
      ) : null}
    </section>
  );
}
