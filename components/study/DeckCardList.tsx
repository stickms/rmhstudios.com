import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ClozeText } from '@/components/study/ClozeText';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { clozePlainText } from '@/lib/study/card-types';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { suspendCardApi } from '@/lib/study/queue.contract';
import type { DeckCard } from '@/lib/study.server';

type Filter =
  | 'all'
  | 'suspended';

/**
 * The deck page's card list for a signed-in or signed-out viewer: a "Suspended" filter, a "Leeches" line for the
 * cards set aside after repeated misses, and Suspend / Unsuspend on each card. A suspended card still shows
 * here (marked) but is in no queue or due count.
 */
export function DeckCardList({
  deckId,
  cards,
  isOwner,
  signedIn,
  onChanged,
}: {
  deckId: string;
  cards: DeckCard[];
  isOwner: boolean;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'study-queue',
    );
  const [
    filter,
    setFilter,
  ] =
    useState<Filter>(
      'all',
    );
  const [
    pending,
    setPending,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );

  const suspendedCards =
    cards.filter(
      (
        c,
      ) =>
        !!c.suspended,
    );
  const leeches =
    cards.filter(
      (
        c,
      ) =>
        c.suspended ===
        'leech',
    );
  const shown =
    filter ===
    'suspended'
      ? suspendedCards
      : cards;

  async function toggle(
    card: DeckCard,
  ) {
    setPending(
      card.id,
    );
    try {
      await api(
        suspendCardApi,
        {
          params:
            {
              id: card.id,
            },
          body: {
            suspended:
              !card.suspended,
          },
        },
      );
      onChanged();
    } catch {
      toast.error(
        t(
          'suspend-failed',
          {
            defaultValue:
              'Could not change that card',
          },
        ),
      );
    } finally {
      setPending(
        null,
      );
    }
  }

  const label =
    (
      c: DeckCard,
    ) =>
      c.kind ===
      'cloze'
        ? clozePlainText(
            c.front,
          )
        : c.front;

  return (
    <div>
      {signedIn && (
        <Tabs
          tabs={[
            {
              id: 'all',
              label:
                t(
                  'filter-all',
                  {
                    defaultValue:
                      'All cards',
                  },
                ),
            },
            {
              id: 'suspended',
              label:
                t(
                  'filter-suspended',
                  {
                    defaultValue:
                      'Suspended',
                  },
                ),
              count:
                suspendedCards.length,
            },
          ]}
          value={
            filter
          }
          onChange={(
            id,
          ) =>
            setFilter(
              id ===
                'suspended'
                ? 'suspended'
                : 'all',
            )
          }
          idBase="deck-cards"
          aria-label={t(
            'filter-label',
            {
              defaultValue:
                'Card filter',
            },
          )}
        />
      )}

      {signedIn &&
        leeches.length >
          0 && (
          <div className="border-b border-site-border py-3">
            <p className="t-label">
              {t(
                'leeches-title',
                {
                  count:
                    leeches.length,
                  defaultValue_one:
                    'Leech: {{count}} card set aside after repeated misses',
                  defaultValue_other:
                    'Leeches: {{count}} cards set aside after repeated misses',
                },
              )}
            </p>
            <ul>
              {leeches.map(
                (
                  c,
                ) => (
                  <li
                    key={
                      c.id
                    }
                    className="flex items-center gap-2 py-1"
                  >
                    <span
                      dir="auto"
                      className="t-body min-w-0 flex-1 truncate"
                    >
                      {label(
                        c,
                      )}
                    </span>
                    {isOwner && (
                      <Link
                        to={
                          `/study/${deckId}/edit` as string
                        }
                        className="t-meta underline"
                      >
                        {t(
                          'leech-edit',
                          {
                            defaultValue:
                              'Edit',
                          },
                        )}
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        pending ===
                        c.id
                      }
                      onClick={() =>
                        void toggle(
                          c,
                        )
                      }
                    >
                      {t(
                        'unsuspend',
                        {
                          defaultValue:
                            'Unsuspend',
                        },
                      )}
                    </Button>
                  </li>
                ),
              )}
            </ul>
          </div>
        )}

      <div
        role="tabpanel"
        id={`deck-cards-panel-${filter}`}
        aria-labelledby={`deck-cards-tab-${filter}`}
      >
        {shown.length ===
          0 &&
          filter ===
            'suspended' && (
            <p className="t-meta py-3">
              {t(
                'none-suspended',
                {
                  defaultValue:
                    'No suspended cards.',
                },
              )}
            </p>
          )}
        {shown.map(
          (
            c,
          ) => (
            <div
              key={
                c.id
              }
              className="flex items-start gap-2 border-b border-site-border py-3"
            >
              <div className="min-w-0 flex-1">
                {c.kind ===
                'cloze' ? (
                  <ClozeText
                    text={
                      c.front
                    }
                    index={
                      null
                    }
                    reveal
                    className="t-body text-site-text"
                  />
                ) : (
                  <>
                    <p className="t-body font-medium">
                      {
                        c.front
                      }
                    </p>
                    <p className="t-body text-site-text-muted">
                      {
                        c.back
                      }
                    </p>
                  </>
                )}
                {c.suspended && (
                  <p className="t-meta">
                    {c.suspended ===
                    'leech'
                      ? t(
                          'marked-leech',
                          {
                            defaultValue:
                              'Suspended: leech',
                          },
                        )
                      : t(
                          'marked-suspended',
                          {
                            defaultValue:
                              'Suspended',
                          },
                        )}
                  </p>
                )}
              </div>
              {signedIn && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    pending ===
                    c.id
                  }
                  onClick={() =>
                    void toggle(
                      c,
                    )
                  }
                >
                  {c.suspended
                    ? t(
                        'unsuspend',
                        {
                          defaultValue:
                            'Unsuspend',
                        },
                      )
                    : t(
                        'suspend',
                        {
                          defaultValue:
                            'Suspend',
                        },
                      )}
                </Button>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
