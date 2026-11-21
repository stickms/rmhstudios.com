import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/contract/client';
import { linkOriginalApi } from '@/lib/study/deck-sync.contract';
import type { UpdatesSummary } from '@/lib/study/deck-sync';
import { DeckUpdatesDialog } from '@/components/study/DeckUpdatesDialog';

/**
 * One line on a rule on the deck page of a copied deck (its owner only): what the author changed,
 * with the way into the review dialog. A deck copied before origins were recorded gets the one-time
 * link action instead; a deck whose original is gone says so and offers nothing.
 */
export function DeckUpdatesLine({
  deckId,
  summary,
  onChanged,
}: {
  deckId: string;
  summary: UpdatesSummary;
  /** Reload the deck (its cards and this line). */
  onChanged: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'deck-updates',
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const [
    linking,
    setLinking,
  ] =
    useState(
      false,
    );

  async function link() {
    if (
      linking
    )
      return;
    setLinking(
      true,
    );
    try {
      const result =
        await api(
          linkOriginalApi,
          {
            params:
              {
                id: deckId,
              },
          },
        );
      toast.success(
        t(
          'linked',
          {
            count:
              result.linked,
            defaultValue_one:
              'Linked {{count}} card to the original',
            defaultValue:
              'Linked {{count}} cards to the original',
          },
        ),
      );
      onChanged();
    } catch {
      toast.error(
        t(
          'link-failed',
          {
            defaultValue:
              'Could not link this deck to the original',
          },
        ),
      );
    } finally {
      setLinking(
        false,
      );
    }
  }

  const cards =
    (
      count: number,
    ) =>
      t(
        'n-cards',
        {
          count,
          defaultValue_one:
            '{{count}} card',
          defaultValue:
            '{{count}} cards',
        },
      );
  const changed =
    summary.changed +
    summary.conflicts;

  let text: string;
  let action: React.ReactNode =
    null;
  if (
    summary.state ===
    'unavailable'
  ) {
    text =
      t(
        'unavailable',
        {
          defaultValue:
            'The original is no longer shared.',
        },
      );
  } else if (
    summary.state ===
    'needs-link'
  ) {
    text =
      t(
        'needs-link',
        {
          defaultValue:
            'This deck was added before updates were tracked.',
        },
      );
    action =
      (
        <Button
          variant="default"
          size="sm"
          loading={
            linking
          }
          onClick={
            link
          }
        >
          {t(
            'link-original',
            {
              defaultValue:
                'Link to the original',
            },
          )}
        </Button>
      );
  } else {
    if (
      changed >
        0 &&
      summary.added >
        0
    ) {
      text =
        t(
          'line-both',
          {
            changed:
              cards(
                changed,
              ),
            added:
              cards(
                summary.added,
              ),
            defaultValue:
              'The author changed {{changed}} and added {{added}}.',
          },
        );
    } else if (
      changed >
      0
    ) {
      text =
        t(
          'line-changed',
          {
            changed:
              cards(
                changed,
              ),
            defaultValue:
              'The author changed {{changed}}.',
          },
        );
    } else if (
      summary.added >
      0
    ) {
      text =
        t(
          'line-added',
          {
            added:
              cards(
                summary.added,
              ),
            defaultValue:
              'The author added {{added}}.',
          },
        );
    } else {
      text =
        t(
          'line-removed',
          {
            removed:
              cards(
                summary.removed,
              ),
            defaultValue:
              'The author removed {{removed}}.',
          },
        );
    }
    action =
      (
        <Button
          variant="default"
          size="sm"
          onClick={() =>
            setOpen(
              true,
            )
          }
        >
          {t(
            'review-updates',
            {
              defaultValue:
                'Review updates',
            },
          )}
        </Button>
      );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-site-border pb-3">
      <p className="t-body min-w-0">
        {
          text
        }
      </p>
      {
        action
      }
      {summary.state ===
        'updates' && (
        <DeckUpdatesDialog
          deckId={
            deckId
          }
          open={
            open
          }
          onOpenChange={
            setOpen
          }
          onApplied={
            onChanged
          }
        />
      )}
    </div>
  );
}
