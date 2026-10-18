'use client';

/**
 * Nightrail trick of the week (R21) on the game hub: last week's winner, and this
 * week's entries to vote on (loaded when the list is opened).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ThumbsUp, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TrickView, TricksPayload } from '@/lib/trick-week/trick-week';

function TrickLine({ trick }: { trick: TrickView }) {
  const { t } = useTranslation('f-async-games');
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-site-text">{trick.chain.join(' → ')}</p>
      <p className="truncate text-xs text-site-text-muted">
        {t('trick-line', {
          defaultValue: '{{name}} · {{points}} points · ×{{mult}} · Line {{level}}',
          name: trick.author ?? t('trick-anon', { defaultValue: 'A courier' }),
          points: trick.score.toLocaleString(),
          mult: trick.multiplier,
          level: trick.level,
        })}
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
  const { t } = useTranslation('f-async-games');
  const [data, setData] = useState<TricksPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/nightrail/tricks');
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as TricksPayload);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data) void load();
  };

  const vote = async (trickId: string) => {
    const res = await fetch('/api/nightrail/tricks/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trickId }),
    });
    if (!res.ok) {
      toast.error(t('trick-vote-error', { defaultValue: 'Could not save your vote.' }));
      return;
    }
    void load();
  };

  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-site-text">
        <Trophy className="h-4 w-4 text-site-warning" aria-hidden />
        {t('trick-week-title', { defaultValue: 'Trick of the week' })}
      </h2>
      {winner ? (
        <TrickLine trick={winner} />
      ) : (
        <p className="text-sm text-site-text-muted">
          {t('trick-no-winner', {
            defaultValue: 'No winner yet. Enter your best combo after a run, then vote.',
          })}
        </p>
      )}
      <Button size="sm" variant="outline" onClick={toggle} aria-expanded={open}>
        {t('trick-vote-open', { defaultValue: 'Vote on this week’s tricks' })}
      </Button>
      {open ? (
        failed ? (
          <p className="text-sm text-site-danger">
            {t('trick-load-error', { defaultValue: 'The entries did not load.' })}
          </p>
        ) : !data ? (
          <p className="text-sm text-site-text-muted">
            {t('trick-loading', { defaultValue: 'Loading…' })}
          </p>
        ) : data.tricks.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('trick-empty', { defaultValue: 'No entries yet this week.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.tricks.map((trick) => (
              <li key={trick.id} className="glass-fill flex items-center gap-3 rounded-site p-3">
                <TrickLine trick={trick} />
                <Button
                  size="sm"
                  className="ms-auto shrink-0"
                  variant={data.myVoteTrickId === trick.id ? 'accent' : 'outline'}
                  aria-pressed={data.myVoteTrickId === trick.id}
                  disabled={!signedIn || trick.mine}
                  onClick={() => void vote(trick.id)}
                >
                  <ThumbsUp aria-hidden />
                  {trick.votes}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Card>
  );
}
