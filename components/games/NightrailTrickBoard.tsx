/**
 * Nightrail trick of the week (R21) on the game hub: last week's winner, and this
 * week's entries to vote on (loaded when the list is opened).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  ThumbsUp,
  Trophy,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/contract/client';
import {
  getNightrailTricksApi,
  voteNightrailTrickApi,
} from '@/lib/trick-week/nightrail-tricks.contract';
import type {
  TrickView,
  TricksPayload,
} from '@/lib/trick-week/trick-week';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

function TrickLine({
  trick,
}: {
  trick: TrickView;
}) {
  const {
    t,
  } =
    useTranslation(
      'f-async-games',
    );
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-site-text">
        {trick.chain.join(
          ' → ',
        )}
      </p>
      <p className="truncate text-xs text-site-text-muted">
        {t(
          'trick-line',
          {
            defaultValue:
              '{{name}} · {{points}} points · ×{{mult}} · Line {{level}}',
            name:
              trick.author ??
              t(
                'trick-anon',
                {
                  defaultValue:
                    'A courier',
                },
              ),
            points:
              trick.score.toLocaleString(),
            mult: trick.multiplier,
            level:
              trick.level,
          },
        )}
      </p>
    </div>
  );
}

export function NightrailTrickBoard({
  winner,
  signedIn,
}: {
  winner: TrickView | null;
  signedIn: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'f-async-games',
    );
  const [
    data,
    setData,
  ] =
    useState<TricksPayload | null>(
      null,
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  const arrival =
    useArrival(
      data !==
        null ||
        failed,
    );

  const load =
    async () => {
      try {
        setData(
          await api(
            getNightrailTricksApi,
          ),
        );
        setFailed(
          false,
        );
      } catch {
        setFailed(
          true,
        );
      }
    };

  const toggle =
    () => {
      const next =
        !open;
      setOpen(
        next,
      );
      if (
        next &&
        !data
      )
        void load();
    };

  const vote =
    async (
      trickId: string,
    ) => {
      try {
        await api(
          voteNightrailTrickApi,
          {
            body: {
              trickId,
            },
          },
        );
      } catch {
        toast.error(
          t(
            'trick-vote-error',
            {
              defaultValue:
                'Could not save your vote.',
            },
          ),
        );
        return;
      }
      void load();
    };

  return (
    <Card className="gap-3 p-4">
      <h2 className="site-section-label flex items-center gap-2">
        <Trophy
          className="h-4 w-4 text-site-warning"
          aria-hidden
        />
        {t(
          'trick-week-title',
          {
            defaultValue:
              'Trick of the week',
          },
        )}
      </h2>
      {winner ? (
        <TrickLine
          trick={
            winner
          }
        />
      ) : (
        <p className="text-sm text-site-text-muted">
          {t(
            'trick-no-winner',
            {
              defaultValue:
                'No winner yet. Enter your best combo after a run, then vote.',
            },
          )}
        </p>
      )}
      <Button
        size="sm"
        variant="default"
        onClick={
          toggle
        }
        aria-expanded={
          open
        }
      >
        {t(
          'trick-vote-open',
          {
            defaultValue:
              'Vote on this week’s tricks',
          },
        )}
      </Button>
      {open ? (
        failed ? (
          <p
            className={cn(
              'text-sm text-site-danger',
              arrival,
            )}
          >
            {t(
              'trick-load-error',
              {
                defaultValue:
                  'The entries did not load.',
              },
            )}
          </p>
        ) : !data ? (
          <p className="text-sm text-site-text-muted">
            {t(
              'trick-loading',
              {
                defaultValue:
                  'Loading…',
              },
            )}
          </p>
        ) : data
            .tricks
            .length ===
          0 ? (
          <p
            className={cn(
              'text-sm text-site-text-muted',
              arrival,
            )}
          >
            {t(
              'trick-empty',
              {
                defaultValue:
                  'No entries yet this week.',
              },
            )}
          </p>
        ) : (
          <ul
            className={cn(
              'space-y-2',
              arrival,
            )}
          >
            {data.tricks.map(
              (
                trick,
              ) => (
                <li
                  key={
                    trick.id
                  }
                  className="surface-card flex items-center gap-3 rounded-site px-4 py-3"
                >
                  <TrickLine
                    trick={
                      trick
                    }
                  />
                  <Button
                    size="sm"
                    className="ms-auto shrink-0"
                    variant={
                      data.myVoteTrickId ===
                      trick.id
                        ? 'default'
                        : 'default'
                    }
                    aria-pressed={
                      data.myVoteTrickId ===
                      trick.id
                    }
                    disabled={
                      !signedIn ||
                      trick.mine
                    }
                    onClick={() =>
                      void vote(
                        trick.id,
                      )
                    }
                  >
                    <ThumbsUp
                      aria-hidden
                    />
                    {
                      trick.votes
                    }
                  </Button>
                </li>
              ),
            )}
          </ul>
        )
      ) : null}
    </Card>
  );
}
