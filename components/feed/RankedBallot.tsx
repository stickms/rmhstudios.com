import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SortableList } from '@/components/ui/sortable-list';
import { api, errorField } from '@/lib/contract/client';
import { submitBallotApi } from '@/lib/feed/ranked-poll.contract';
import { toast } from '@/lib/toast';
import type { FeedPoll } from '@/lib/feed-types';

interface BallotRow {
  id: string;
  text: string;
}

/**
 * The ranking ballot of a ranked poll (sprint 06 #19). Ranked options are a reorderable list (drag handle, and
 * "Move up" / "Move down" buttons for keyboard and touch), each with a rank `Select`; options left out of the
 * ranking sit below it and join it from their own `Select`. Every move is announced ("X moved to rank 2").
 */
export function RankedBallot({
  poll,
  postId,
  onSubmitted,
  onCancel,
}: {
  poll: FeedPoll;
  postId: string;
  /** The ballot was stored: the server's tallies and the member's ranking. */
  onSubmitted: (next: FeedPoll) => void;
  /** Set when the member is changing an existing ballot, so the form can be put away. */
  onCancel?: () => void;
}) {
  const { t } = useTranslation('ranked-polls');
  const byId = new Map(poll.options.map((o) => [o.id, o.text]));
  const [ranking, setRanking] = useState<string[]>(() => (poll.myRanking ?? []).filter((id) => byId.has(id)));
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const rows: BallotRow[] = ranking.map((id) => ({
    id,
    text: byId.get(id) ?? '',
  }));
  const unranked = poll.options.filter((o) => !ranking.includes(o.id));

  const announce = (id: string, rank: number) =>
    setAnnouncement(
      t('moved-to-rank', {
        name: byId.get(id) ?? '',
        rank,
        defaultValue: '{{name}} moved to rank {{rank}}',
      }),
    );

  const reorder = (next: BallotRow[]) => {
    const ids = next.map((r) => r.id);
    const at = ids.findIndex((id, i) => id !== ranking[i]);
    setRanking(ids);
    if (at >= 0) announce(ids[at] ?? '', at + 1);
  };

  // Put `id` at 1-based `rank`, or take it out of the ranking when `rank` is 0.
  const setRank = (id: string, rank: number) => {
    const rest = ranking.filter((x) => x !== id);
    if (rank <= 0) {
      setRanking(rest);
      setAnnouncement(
        t('removed-from-ranking', {
          name: byId.get(id) ?? '',
          defaultValue: '{{name}} removed from your ranking',
        }),
      );
      return;
    }
    const to = Math.min(rank, rest.length + 1) - 1;
    setRanking([...rest.slice(0, to), id, ...rest.slice(to)]);
    announce(id, to + 1);
  };

  const rankChoices = (count: number) =>
    Array.from(
      {
        length: count,
      },
      (_, i) => (
        <option key={i + 1} value={i + 1}>
          {i + 1}
        </option>
      ),
    );

  const submit = async () => {
    if (busy || ranking.length === 0) return;
    setBusy(true);
    try {
      const res = await api(submitBallotApi, {
        params: {
          id: postId,
        },
        body: {
          ranking,
        },
      });
      onSubmitted({
        ...poll,
        myRanking: res.myRanking,
        myVotes: res.myRanking,
        totalVotes: res.totalVotes,
        options: poll.options.map((o) => ({
          ...o,
          voteCount: res.options.find((x) => x.id === o.id)?.voteCount ?? o.voteCount,
        })),
      });
    } catch (err) {
      toast.error(
        errorField(err, 'code') === 'POLL_CLOSED'
          ? t('poll-ended', {
              defaultValue: 'This poll has ended',
            })
          : t('submit-failed', {
              defaultValue: 'Your ranking could not be saved. Try again.',
            }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="t-meta mb-2">
        {t('ballot-hint', {
          defaultValue: 'Order the options you like, best first. Leave out any you do not want.',
        })}
      </p>

      {rows.length > 0 && (
        <SortableList
          items={rows}
          onReorder={reorder}
          itemLabel={(r) => r.text}
          className="gap-0"
          renderItem={(r, i) => (
            <div className="flex items-center gap-2">
              <span className="t-meta w-4 shrink-0 text-right">{i + 1}</span>
              <span className="t-body min-w-0 flex-1 break-words">{r.text}</span>
              <Select
                controlSize="sm"
                value={i + 1}
                onChange={(e) => setRank(r.id, Number(e.target.value))}
                aria-label={t('rank-of', {
                  name: r.text,
                  defaultValue: 'Rank of {{name}}',
                })}
                containerClassName="inline-block w-auto"
                className="w-auto min-w-20"
              >
                {rankChoices(ranking.length)}
                <option value={0}>
                  {t('not-ranked', {
                    defaultValue: 'Not ranked',
                  })}
                </option>
              </Select>
            </div>
          )}
        />
      )}

      {unranked.length > 0 && (
        <ul className="mt-2">
          {unranked.map((o) => (
            <li key={o.id} className="flex items-center gap-2 border-b border-site-border py-2 last:border-b-0">
              <span className="t-body min-w-0 flex-1 break-words text-site-text-muted">{o.text}</span>
              <Select
                controlSize="sm"
                value={0}
                onChange={(e) => setRank(o.id, Number(e.target.value))}
                aria-label={t('rank-of', {
                  name: o.text,
                  defaultValue: 'Rank of {{name}}',
                })}
                containerClassName="inline-block w-auto"
                className="w-auto min-w-20"
              >
                <option value={0}>
                  {t('not-ranked', {
                    defaultValue: 'Not ranked',
                  })}
                </option>
                {rankChoices(ranking.length + 1)}
              </Select>
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" onClick={submit} disabled={busy || ranking.length === 0}>
          {t('submit-ranking', {
            defaultValue: 'Submit ranking',
          })}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
        )}
      </div>
    </div>
  );
}
