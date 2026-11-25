import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SortableList } from '@/components/ui/sortable-list';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CardForm, type CardFormValue } from '@/components/study/CardForm';
import { CardRow, type EditorCard } from '@/components/study/CardRow';
import { ExportMenu } from '@/components/study/ExportMenu';
import { ImportPanel } from '@/components/study/ImportPanel';
import { DeckSuggestions } from '@/components/study/DeckSuggestions';
import { useQuery } from '@tanstack/react-query';
import { api, apiQuery } from '@/lib/contract/client';
import { listSuggestionsApi } from '@/lib/study/suggestions.contract';
import { toast } from '@/lib/toast';
import { cardLabel } from '@/lib/study/card-types';
import type { ParsedCard } from '@/lib/study/import';
import { MAX_DECK_CARDS } from '@/lib/study/limits';
import { isDeckLanguageTag } from '@/lib/study/listen';
import {
  addDeckCardApi,
  deleteCardApi,
  getDeckApi,
  importCardsApi,
  reorderCardsApi,
  updateCardApi,
  updateDeckApi,
} from '@/lib/study/decks.contract';
import { DeckLanguages } from '@/components/study/DeckLanguages';
import type { DeckDetail } from '@/lib/study.server';

type TabId = 'cards' | 'suggestions' | 'import' | 'settings';

/** How long a deleted card can be brought back. */
const UNDO_MS = 8000;

/**
 * The editor for one deck: cards, import and export, and (for the owner) suggestions and deck settings. An editor
 * (s11-10) sees the cards and the import: no settings, no suggestions, no sound recorder.
 */
export function DeckEditor({ deckId, initial }: { deckId: string; initial: DeckDetail }) {
  const { t } = useTranslation('study-editor');
  const { t: ts } = useTranslation('flashcard-types');
  const base = useId();
  const [tab, setTab] = useState<TabId>('cards');
  const [meta, setMeta] = useState(initial.deck);
  const [cards, setCards] = useState<EditorCard[]>(initial.cards);
  // Authored cards are listed; the deck holds more rows than that (reverse and cloze cards are
  // generated) and the 2,000-card cap counts every row.
  const [counts, setCounts] = useState({ review: initial.reviewCount, rows: initial.rowCount });
  // Open suggestions from people who study the deck (s10-04): the tab's count (the panel reads the same query).
  const isOwner = initial.deck.isOwner;
  const suggestionsQuery = useQuery({
    ...apiQuery(listSuggestionsApi, { params: { id: deckId }, query: { scope: 'author' } }),
    retry: false,
    // Suggestions go to the owner only.
    enabled: isOwner,
  });
  const openSuggestions = suggestionsQuery.data?.author.length ?? null;

  // Order saves are coalesced: one in flight, the latest order waiting behind it.
  const savedOrder = useRef(initial.cards.map((c) => c.id));
  const nextOrder = useRef<string[] | null>(null);
  const saving = useRef(false);
  const orderVersion = useRef(0);
  // Cards whose delete is waiting on the undo toast. The server still has them,
  // so an order save names them too or it would not match the deck.
  const pendingDeletes = useRef(new Set<string>());

  const flushOrder = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    while (nextOrder.current) {
      const ids = nextOrder.current;
      nextOrder.current = null;
      try {
        await api(reorderCardsApi, {
          params: { id: deckId },
          body: { cardIds: [...ids, ...pendingDeletes.current] },
        });
        savedOrder.current = ids;
      } catch {
        nextOrder.current = null;
        toast.error(t('reorder-failed', { defaultValue: 'Could not save the new order' }));
        const rank = new Map(savedOrder.current.map((id, i) => [id, i]));
        setCards((prev) => [...prev].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)));
      }
    }
    saving.current = false;
  }, [deckId, t]);

  const saveOrder = useCallback(
    (ids: string[]) => {
      orderVersion.current += 1;
      nextOrder.current = ids;
      void flushOrder();
    },
    [flushOrder],
  );

  function reorder(next: EditorCard[]) {
    setCards(next);
    saveOrder(next.map((c) => c.id));
  }

  /** Generated cards come and go with an edit: read the counts back (the list itself is already right). */
  async function refreshCounts() {
    try {
      const fresh = await api(getDeckApi, { params: { id: deckId } });
      setCounts({ review: fresh.reviewCount, rows: fresh.rowCount });
    } catch {
      /* the counts catch up on the next change */
    }
  }

  async function saveCard(id: string, next: CardFormValue): Promise<boolean> {
    try {
      await api(updateCardApi, { params: { id }, body: next });
    } catch {
      toast.error(t('card-save-failed', { defaultValue: 'Could not save the card' }));
      return false;
    }
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...next } : c)));
    void refreshCounts();
    return true;
  }

  /** An accepted suggestion changed a card: read the list and the counts back. */
  async function reloadCards() {
    try {
      const fresh = await api(getDeckApi, { params: { id: deckId } });
      setCards(fresh.cards);
      setCounts({ review: fresh.reviewCount, rows: fresh.rowCount });
      savedOrder.current = fresh.cards.map((c) => c.id);
    } catch {
      /* the list catches up on the next change */
    }
  }

  async function addCard(card: CardFormValue): Promise<boolean> {
    try {
      const res = await api(addDeckCardApi, { params: { id: deckId }, body: card });
      setCards((prev) => [...prev, res.card]);
      savedOrder.current = [...savedOrder.current, res.card.id];
      void refreshCounts();
      return true;
    } catch {
      toast.error(t('card-add-failed', { defaultValue: 'Could not add the card' }));
      return false;
    }
  }

  function deleteCard(card: EditorCard) {
    const index = cards.findIndex((c) => c.id === card.id);
    const versionAtDelete = orderVersion.current;
    let undone = false;
    let sent = false;
    pendingDeletes.current.add(card.id);
    setCards((prev) => prev.filter((c) => c.id !== card.id));

    const restore = () => {
      let restored: string[] = [];
      setCards((prev) => {
        const next = prev.slice();
        next.splice(Math.min(Math.max(index, 0), next.length), 0, card);
        restored = next.map((c) => c.id);
        return next;
      });
      // The list was reordered while this card was waiting: its slot has to be saved again.
      queueMicrotask(() => {
        if (orderVersion.current !== versionAtDelete) saveOrder(restored);
      });
    };

    // The delete goes out when the toast closes without Undo.
    const send = async () => {
      if (undone || sent) return;
      sent = true;
      try {
        await api(deleteCardApi, { params: { id: card.id } });
        savedOrder.current = savedOrder.current.filter((id) => id !== card.id);
        pendingDeletes.current.delete(card.id);
        void refreshCounts();
      } catch {
        pendingDeletes.current.delete(card.id);
        restore();
        toast.error(t('card-delete-failed', { defaultValue: 'Could not delete the card' }));
      }
    };

    toast(t('card-deleted', { defaultValue: 'Card deleted' }), {
      duration: UNDO_MS,
      action: {
        label: t('undo', { defaultValue: 'Undo' }),
        onClick: () => {
          undone = true;
          pendingDeletes.current.delete(card.id);
          restore();
        },
      },
      onDismiss: () => void send(),
      onAutoClose: () => void send(),
    });
  }

  async function importCards(batch: ParsedCard[]): Promise<boolean> {
    try {
      const res = await api(importCardsApi, { params: { id: deckId }, body: { cards: batch } });
      const fresh = await api(getDeckApi, { params: { id: deckId } });
      setCards(fresh.cards);
      setMeta(fresh.deck);
      setCounts({ review: fresh.reviewCount, rows: fresh.rowCount });
      savedOrder.current = fresh.cards.map((c) => c.id);
      toast.success(
        t('imported', {
          count: res.created,
          defaultValue_one: 'Added {{count}} card',
          defaultValue: 'Added {{count}} cards',
        }),
      );
      setTab('cards');
      return true;
    } catch {
      toast.error(t('import-failed', { defaultValue: 'Could not import these cards' }));
      return false;
    }
  }

  // The tab is there for a public deck, and for any deck that still has suggestions to decide.
  const showSuggestions = isOwner && (meta.isPublic || (openSuggestions ?? 0) > 0);
  const tabs = [
    { id: 'cards', label: t('tab-cards', { defaultValue: 'Cards' }), count: cards.length },
    ...(showSuggestions
      ? [
          {
            id: 'suggestions',
            label: t('tab-suggestions', { ns: 'deck-suggestions', defaultValue: 'Suggestions' }),
            count: openSuggestions ?? 0,
          },
        ]
      : []),
    { id: 'import', label: t('tab-import', { defaultValue: 'Import' }) },
    ...(isOwner ? [{ id: 'settings', label: t('tab-settings', { defaultValue: 'Settings' }) }] : []),
  ];
  const panel = (id: TabId) => ({
    id: `${base}-panel-${id}`,
    role: 'tabpanel' as const,
    'aria-labelledby': `${base}-tab-${id}`,
    hidden: tab !== id,
  });

  return (
    <PageLayout
      title={t('title', { defaultValue: 'Edit deck' })}
      description={meta.title}
      wrapTitle
      backTo={`/study/${deckId}`}
      backLabel={t('back-to-deck', { defaultValue: 'Back to deck' })}
      headerRight={<ExportMenu deck={{ title: meta.title, description: meta.description, cards }} />}
    >
      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        idBase={base}
        sheet={false}
        aria-label={t('sections', { defaultValue: 'Deck sections' })}
      />

      <div className="pt-4">
        <section {...panel('cards')}>
          <div className="flex flex-col gap-4">
            <p className="t-meta">
              {ts('card-count', {
                count: cards.length,
                defaultValue_one: '{{count}} card',
                defaultValue: '{{count}} cards',
              })}
              {' · '}
              {ts('review-count', { count: counts.review, defaultValue: '{{count}} to review' })}
              {' · '}
              {ts('rows-left', {
                count: Math.max(0, MAX_DECK_CARDS - counts.rows),
                defaultValue_one: 'Room for {{count}} more card',
                defaultValue: 'Room for {{count}} more cards',
              })}
            </p>
            <div className="flex flex-col gap-2 border-b border-site-border pb-4">
              <h2 className="t-heading">{ts('add-card', { defaultValue: 'Add a card' })}</h2>
              <CardForm
                submitLabel={ts('add-card-submit', { defaultValue: 'Add card' })}
                resetOnSave
                allowSound={isOwner}
                onSubmit={addCard}
              />
            </div>
            {cards.length === 0 ? (
              <EmptyState
                title={t('no-cards', { defaultValue: 'No cards yet' })}
                description={t('no-cards-hint', {
                  defaultValue: 'Paste a list in Import, or add cards one at a time from the deck page.',
                })}
                action={
                  <Button variant="default" onClick={() => setTab('import')}>
                    {t('go-import', { defaultValue: 'Import cards' })}
                  </Button>
                }
              />
            ) : (
              <SortableList
                items={cards}
                onReorder={reorder}
                itemLabel={(c) => cardLabel(c)}
                className="gap-0 divide-y divide-site-border border-y border-site-border"
                renderItem={(card) => (
                  <CardRow card={card} allowSound={isOwner} onSave={saveCard} onDelete={deleteCard} />
                )}
              />
            )}
          </div>
        </section>

        {isOwner && (
          <section {...panel('suggestions')}>
            <DeckSuggestions
              deckId={deckId}
              acceptsSuggestions={meta.acceptsSuggestions}
              onAccepted={() => void reloadCards()}
            />
          </section>
        )}

        <section {...panel('import')}>
          <ImportPanel existingFronts={cards.map((c) => c.front)} cardCount={counts.rows} onImport={importCards} />
        </section>

        {isOwner && (
          <section {...panel('settings')}>
            <SettingsForm deckId={deckId} meta={meta} onSaved={(next) => setMeta((m) => ({ ...m, ...next }))} />
          </section>
        )}
      </div>
    </PageLayout>
  );
}

function SettingsForm({
  deckId,
  meta,
  onSaved,
}: {
  deckId: string;
  meta: DeckDetail['deck'];
  onSaved: (next: {
    title: string;
    description: string | null;
    isPublic: boolean;
    notifyUpdates: boolean;
    acceptsSuggestions: boolean;
    frontLang: string | null;
    backLang: string | null;
  }) => void;
}) {
  const { t } = useTranslation('study-editor');
  const uid = useId();
  const [notifyUpdates, setNotifyUpdates] = useState(meta.notifyUpdates);
  const [title, setTitle] = useState(meta.title);
  const [description, setDescription] = useState(meta.description ?? '');
  const [isPublic, setIsPublic] = useState(meta.isPublic);
  const [acceptsSuggestions, setAcceptsSuggestions] = useState(meta.acceptsSuggestions);
  const [frontLang, setFrontLang] = useState(meta.frontLang ?? '');
  const [backLang, setBackLang] = useState(meta.backLang ?? '');
  const [busy, setBusy] = useState(false);

  const dirty =
    title.trim() !== meta.title ||
    description.trim() !== (meta.description ?? '') ||
    isPublic !== meta.isPublic ||
    acceptsSuggestions !== meta.acceptsSuggestions ||
    frontLang !== (meta.frontLang ?? '') ||
    backLang !== (meta.backLang ?? '') ||
    (meta.isCopy && notifyUpdates !== meta.notifyUpdates);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await api(updateDeckApi, {
        params: { id: deckId },
        body: {
          title: title.trim(),
          description: description.trim(),
          isPublic,
          acceptsSuggestions,
          frontLang: isDeckLanguageTag(frontLang) ? frontLang : null,
          backLang: isDeckLanguageTag(backLang) ? backLang : null,
          ...(meta.isCopy ? { notifyUpdates } : {}),
        },
      });
      onSaved({
        title: title.trim(),
        description: description.trim() || null,
        isPublic,
        notifyUpdates,
        acceptsSuggestions,
        frontLang: frontLang || null,
        backLang: backLang || null,
      });
      toast.success(t('settings-saved', { defaultValue: 'Deck saved' }));
    } catch {
      toast.error(t('settings-failed', { defaultValue: 'Could not save the deck' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-title`}>{t('deck-title', { defaultValue: 'Title' })}</Label>
        <Input
          id={`${uid}-title`}
          dir="auto"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-description`}>{t('deck-description', { defaultValue: 'Description' })}</Label>
        <Textarea
          id={`${uid}-description`}
          dir="auto"
          rows={3}
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-y border-site-border py-3">
        <div className="min-w-0">
          <p id={`${uid}-public`} className="t-body font-medium">
            {t('deck-public', { defaultValue: 'Public deck' })}
          </p>
          <p id={`${uid}-public-hint`} className="t-meta">
            {t('deck-public-hint', {
              defaultValue: 'Anyone with the link can study, clone and export it.',
            })}
          </p>
        </div>
        <Switch
          checked={isPublic}
          onCheckedChange={setIsPublic}
          aria-labelledby={`${uid}-public`}
          aria-describedby={`${uid}-public-hint`}
        />
      </div>
      {isPublic && (
        <div className="flex items-center justify-between gap-3 border-b border-site-border pb-3">
          <div className="min-w-0">
            <p id={`${uid}-suggest`} className="t-body font-medium">
              {t('accepts-suggestions', {
                ns: 'deck-suggestions',
                defaultValue: 'Let people who study this deck suggest fixes',
              })}
            </p>
            <p id={`${uid}-suggest-hint`} className="t-meta">
              {t('accepts-suggestions-hint', {
                ns: 'deck-suggestions',
                defaultValue: 'You decide each one. Nothing changes a card until you accept it.',
              })}
            </p>
          </div>
          <Switch
            checked={acceptsSuggestions}
            onCheckedChange={setAcceptsSuggestions}
            aria-labelledby={`${uid}-suggest`}
            aria-describedby={`${uid}-suggest-hint`}
          />
        </div>
      )}
      <DeckLanguages
        frontLang={frontLang}
        backLang={backLang}
        onFrontChange={setFrontLang}
        onBackChange={setBackLang}
      />
      {meta.isCopy && <NotifyUpdatesRow checked={notifyUpdates} onChange={setNotifyUpdates} />}
      <div>
        <Button variant="primary" disabled={!dirty || !title.trim()} loading={busy} onClick={save}>
          {t('save-deck', { defaultValue: 'Save deck' })}
        </Button>
      </div>
    </div>
  );
}

/** "Tell me about updates" on a copied deck. */
function NotifyUpdatesRow({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const { t } = useTranslation('deck-updates');
  const uid = useId();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-site-border pb-3">
      <div className="min-w-0">
        <p id={`${uid}-notify`} className="t-body font-medium">
          {t('notify-updates', { defaultValue: 'Tell me about updates' })}
        </p>
        <p id={`${uid}-notify-hint`} className="t-meta">
          {t('notify-updates-hint', {
            defaultValue: 'Show on the deck page when the author changes or adds cards.',
          })}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-labelledby={`${uid}-notify`}
        aria-describedby={`${uid}-notify-hint`}
      />
    </div>
  );
}
