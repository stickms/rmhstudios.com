/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, BookOpen, Plus, Sparkles, X, Globe, Lock, Layers } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ColumnHeader } from './ColumnHeader';
import { StudyTabs } from '@/components/feed/StudyTabs';
import { ReminderSettings } from '@/components/study/ReminderSettings';
import { DeckDue, ReviewAllLink } from '@/components/study/DueCount';
import { api } from '@/lib/contract/client';
import { createDeckApi, listDecksApi } from '@/lib/study/decks.contract';
import { useArrival } from '@/components/ui/arrive';
import { DeckFolderList } from '@/components/study/DeckFolderList';
import type { DeckFolderSummary } from '@/lib/study/folders';
import type { DeckInvitation, SharedDeckSummary } from '@/lib/study/deck-editors';

interface Deck {
  id: string;
  title: string;
  description: string | null;
  isPublic?: boolean;
  /** The owner's private folder (own decks only). */
  folderId?: string | null;
  cardCount: number;
  /** Cards due today (own decks only; suspended cards are left out). */
  dueCount?: number;
  user?: { name: string | null; handle: string | null };
  /** Accepted editors besides the owner of a public deck (s11-10); no names. */
  editorCount?: number;
}

/** The member's IANA zone; undefined when the browser will not say. */
function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function FlashcardsColumn({
  initialData,
}: {
  /** Deck list prefetched by the route loader; `null`when signed out. */
  initialData?: {
    mine: Deck[];
    /** Decks the member edits but does not own (s11-10). */
    shared?: SharedDeckSummary[];
    invitations?: DeckInvitation[];
    popular: Deck[];
    folders?: DeckFolderSummary[];
    signedIn: boolean;
    reviewAllCount?: number;
    paced?: boolean;
  } | null;
} = {}) {
  const { t } = useTranslation('feed');
  const refusalText = useRefusalText();
  const navigate = useNavigate();
  // Seed from the loader when provided so the list paints immediately.
  const seeded = useRef(initialData != null);
  const [mine, setMine] = useState<Deck[]>(initialData?.mine ?? []);
  const [popular, setPopular] = useState<Deck[]>(initialData?.popular ?? []);
  const [shared, setShared] = useState<SharedDeckSummary[]>(initialData?.shared ?? []);
  const [invitations, setInvitations] = useState<DeckInvitation[]>(initialData?.invitations ?? []);
  const [folders, setFolders] = useState<DeckFolderSummary[]>(initialData?.folders ?? []);
  const [signedIn, setSignedIn] = useState(initialData?.signedIn ?? false);
  const [reviewAllCount, setReviewAllCount] = useState(initialData?.reviewAllCount ?? 0);
  const [loading, setLoading] = useState(!initialData);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Steel M9: decks fetched here replace the spinner; the loader's are there on first paint.
  const arrival = useArrival(!loading);
  const [form, setForm] = useState({
    title: '',
    description: '',
    isPublic: false,
    generateTopic: '',
  });

  const load = useCallback(async () => {
    try {
      const tz = viewerTimeZone();
      const data = await api(listDecksApi, tz ? { query: { tz } } : undefined);
      setMine(data.mine ?? []);
      setPopular(data.popular ?? []);
      setShared(data.shared ?? []);
      setInvitations(data.invitations ?? []);
      setFolders(data.folders ?? []);
      setSignedIn(!!data.signedIn);
      setReviewAllCount(data.reviewAllCount ?? 0);
    } catch {
      /* a failed load leaves the lists as they were */
    }
  }, []);

  // The loader counts a paced deck's new cards in UTC (the server does not know the member's zone); the
  // session counts them in the member's own, so fetch the badges again in that zone once (s10-03).
  const correctZone = initialData?.paced === true;
  useEffect(() => {
    if (correctZone && viewerTimeZone() !== 'UTC') void load();
  }, [correctZone, load]);

  useEffect(() => {
    if (seeded.current) return;
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const data = await api(createDeckApi, {
        body: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          isPublic: form.isPublic,
          generateTopic: form.generateTopic.trim() || undefined,
        },
      });
      navigate({ to: `/study/${data.id}` as string });
    } catch (err) {
      setError(refusalText.maybe(err) ?? t('could-not-create', { defaultValue: 'Could not create' }));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center px-4 pt-4 pb-12">
        <Spinner />
      </div>
    );
  }

  const DeckCard = (d: Deck, showOwner = false) => (
    <Link
      key={d.id}
      to={`/study/${d.id}` as string}
      className={`row-hover rule-row flex min-w-0 items-center gap-3 py-3`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-site bg-site-accent/12 text-site-accent">
        <Layers className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-site-text">{d.title}</p>
        {d.description && <p dir="auto" className="truncate text-xs text-site-text-muted">{d.description}</p>}
        <p className="mt-0.5 text-xs text-site-text-muted">
          {t('card-count', {
            count: d.cardCount,
            defaultValue: '{{count}} card',
            defaultValue_other: '{{count}} cards',
          })}
          {showOwner && d.user
            ? t('deck-by-owner', {
                owner: d.user.name || d.user.handle || t('someone', { defaultValue: 'Someone' }),
                defaultValue: '· by {{owner}}',
              })
            : ''}
          {showOwner && d.user && (d.editorCount ?? 0) > 0
            ? ` ${t('deck-with-editors', {
                ns: 'deck-coeditors',
                count: d.editorCount,
                defaultValue_one: 'with {{count}} editor',
                defaultValue: 'with {{count}} editors',
              })}`
            : ''}
          {d.isPublic ? t('deck-public-suffix', { defaultValue: '· public' }) : ''}{' '}
          <DeckDue count={d.dueCount ?? 0} />
        </p>
      </div>
    </Link>
  );

  return (
    <div className={arrival}>
      <ColumnHeader
        icon={BookOpen}
        title={t('flashcards-title', { defaultValue: 'Flashcards' })}
        actions={
          <>
            {/* The "Browse" text link that used to sit here is now one half of
                the StudyTabs strip below — the crossing to /study/browse was a
                link one way and a back-arrow the other, which is a tab strip
                spelled two different ways. */}
            {signedIn && (
              <Button
                size="sm"
                variant="default"
                className="gap-1"
                onClick={() => setShowForm((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" /> {t('new-deck', { defaultValue: 'New deck' })}
              </Button>
            )}
          </>
        }
      />

      <StudyTabs active="/study" />
      {signedIn && reviewAllCount > 0 && <ReviewAllLink count={reviewAllCount} />}
      {signedIn && <ReminderSettings />}

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">
              {t('new-deck', { defaultValue: 'New deck' })}
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-site-text-muted hover:text-site-text"
              aria-label={t('close', { defaultValue: 'Close' })}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input aria-label={t('field-deck-title', { defaultValue: 'Deck title' })}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('deck-title-placeholder', { defaultValue: 'Deck title' })}
              maxLength={100}
              className="surface-field border w-full rounded-site-sm px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <input aria-label={t('field-deck-description', { defaultValue: 'Deck description' })}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('description-placeholder', { defaultValue: 'Description (optional)' })}
              maxLength={500}
              className="surface-field border w-full rounded-site-sm px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <div className="rounded-site-sm border border-site-accent/30 bg-site-accent/5 p-2">
              <label htmlFor="flashcards-generate-topic" className="mb-1 flex items-center gap-1 text-xs font-semibold text-site-accent">
                <Sparkles className="h-3 w-3" />
                {''}
                {t('ai-tutor-label', { defaultValue: 'AI tutor — auto-generate cards' })}
              </label>
              <input id="flashcards-generate-topic"
                value={form.generateTopic}
                onChange={(e) => setForm((f) => ({ ...f, generateTopic: e.target.value }))}
                placeholder={t('generate-topic-placeholder', {
                  defaultValue: "Topic, e.g.'French Revolution causes'(optional)",
                })}
                maxLength={200}
                className="surface-field border w-full rounded-site-sm px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                className="inline-flex items-center gap-1.5 rounded-site-sm border border-site-border px-2.5 py-1.5 text-xs font-medium text-site-text-muted hover:text-site-text"
              >
                {form.isPublic ? (
                  <Globe className="h-3.5 w-3.5" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                {form.isPublic
                  ? t('public', { defaultValue: 'Public' })
                  : t('private', { defaultValue: 'Private' })}
              </button>
              {error && <p className="text-xs text-site-danger">{error}</p>}
              <Button
                size="sm"
                variant="default"
                disabled={busy || form.title.trim().length < 1}
                onClick={create}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t('create-deck', { defaultValue: 'Create deck' })
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 py-4">
        {(mine.length > 0 || folders.length > 0 || shared.length > 0 || invitations.length > 0) && (
          <section>
            <h2 className="site-section-label mb-2">
              {t('your-decks', { defaultValue: 'Your decks' })}
            </h2>
            <DeckFolderList
              decks={mine}
              folders={folders}
              renderDeck={(d) => DeckCard(d)}
              shared={shared}
              renderShared={(d) => DeckCard({ ...d, user: d.owner }, true)}
              invitations={invitations}
              onChanged={() => void load()}
            />
          </section>
        )}
        <section>
          <h2 className="site-section-label mb-2">
            {t('public-decks', { defaultValue: 'Public decks' })}
          </h2>
          {popular.length === 0 ? (
            /* Canonical EmptyState with a way forward, rather than a bare <p>. */
            <EmptyState
              icon={Layers}
              title={t('no-public-decks', { defaultValue: 'No public decks yet' })}
              description={t('no-public-decks-hint', {
                defaultValue: 'Decks shared by the community will show up here.',
              })}
              action={
                signedIn ? (
                  <Button variant="default" className="gap-1" onClick={() => setShowForm(true)}>
                    <Plus className="h-4 w-4" aria-hidden />{' '}
                    {t('new-deck', { defaultValue: 'New deck' })}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div>{popular.map((d) => DeckCard(d, true))}</div>
          )}
        </section>
      </div>
    </div>
  );
}
