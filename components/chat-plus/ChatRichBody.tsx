'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Coins, Dices, ListChecks, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  ChatRef,
  ChecklistItem,
  ChecklistMeta,
  CoinMeta,
  DiceMeta,
  PollView,
} from '@/lib/chat-plus/types';

/**
 * The card bodies for the non-text message kinds: dice and coin results (M4),
 * a shared checklist (M5) and a DM poll (M4). They render as `glass-fill` cards
 * rather than inside the coloured bubble — a card is something you act on, not
 * something somebody said.
 */
export function ChatRichBody({
  chat,
  messageId,
  kind,
  meta,
  poll,
  authorName,
  disabled,
}: {
  chat: ChatRef;
  messageId: string;
  kind: string;
  meta: unknown;
  poll?: PollView | null;
  /** Display name of whoever posted it ("You" for the viewer). */
  authorName: string;
  /** An optimistic bubble with no server id yet. */
  disabled?: boolean;
}) {
  switch (kind) {
    case 'dice':
      return <DiceCard meta={meta as DiceMeta} authorName={authorName} />;
    case 'coin':
      return <CoinCard meta={meta as CoinMeta} authorName={authorName} />;
    case 'checklist':
      return (
        <ChecklistCard
          chat={chat}
          messageId={messageId}
          meta={meta as ChecklistMeta}
          disabled={disabled}
        />
      );
    case 'poll':
      return poll ? (
        <DmPollCard chat={chat} messageId={messageId} poll={poll} disabled={disabled} />
      ) : null;
    default:
      return null;
  }
}

function DiceCard({ meta, authorName }: { meta: DiceMeta; authorName: string }) {
  const { t } = useTranslation('f-messaging');
  if (!meta?.rolls) return null;
  return (
    <div className="glass-fill w-56 max-w-full rounded-site p-3 text-site-text">
      <p className="flex items-center gap-1.5 text-xs text-site-text-muted">
        <Dices className="size-4" aria-hidden />
        {t('dice-rolled', {
          name: authorName,
          dice: `${meta.count}d${meta.sides}`,
          defaultValue: '{{name}} rolled {{dice}}',
        })}
      </p>
      <p
        className="mt-1 font-display text-3xl font-bold tabular-nums"
        aria-label={t('dice-total', { total: meta.total, defaultValue: 'Total {{total}}' })}
      >
        {meta.total}
      </p>
      {meta.count > 1 && (
        <p className="mt-1 text-xs tabular-nums text-site-text-dim">{meta.rolls.join(' + ')}</p>
      )}
    </div>
  );
}

function CoinCard({ meta, authorName }: { meta: CoinMeta; authorName: string }) {
  const { t } = useTranslation('f-messaging');
  if (!meta?.result) return null;
  return (
    <div className="glass-fill w-56 max-w-full rounded-site p-3 text-site-text">
      <p className="flex items-center gap-1.5 text-xs text-site-text-muted">
        <Coins className="size-4" aria-hidden />
        {t('coin-flipped', { name: authorName, defaultValue: '{{name}} flipped a coin' })}
      </p>
      <p className="mt-1 font-display text-2xl font-bold">
        {meta.result === 'heads'
          ? t('coin-heads', { defaultValue: 'Heads' })
          : t('coin-tails', { defaultValue: 'Tails' })}
      </p>
    </div>
  );
}

function ChecklistCard({
  chat,
  messageId,
  meta,
  disabled,
}: {
  chat: ChatRef;
  messageId: string;
  meta: ChecklistMeta;
  disabled?: boolean;
}) {
  const { t } = useTranslation('f-messaging');
  const [items, setItems] = useState<ChecklistItem[]>(meta?.items ?? []);
  const [busy, setBusy] = useState<number | null>(null);
  // Live ticks from other people arrive as new `meta` from the parent.
  useEffect(() => setItems(meta?.items ?? []), [meta]);
  if (!meta?.items) return null;

  const done = items.filter((i) => i.doneBy).length;

  const toggle = async (index: number) => {
    if (disabled || busy !== null) return;
    const before = items;
    setBusy(index);
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              doneBy: it.doneBy ? null : 'me',
              doneAt: it.doneBy ? null : new Date().toISOString(),
            }
          : it,
      ),
    );
    try {
      const res = await fetch(`/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/checklist`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, index }),
      });
      if (!res.ok) throw new Error('tick failed');
      const data = (await res.json()) as { items: ChecklistItem[] };
      setItems(data.items);
    } catch {
      setItems(before);
      toast.error(t('checklist-tick-failed', { defaultValue: 'Could not update the checklist' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass-fill w-72 max-w-full rounded-site p-3 text-site-text">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="size-4 shrink-0 text-site-accent" aria-hidden />
          <span className="truncate">{meta.title}</span>
        </p>
        <span className="shrink-0 text-xs tabular-nums text-site-text-dim">
          {t('checklist-progress', {
            done,
            total: items.length,
            defaultValue: '{{done}}/{{total}}',
          })}
        </span>
      </div>
      <ul className="flex flex-col">
        {items.map((item, i) => {
          const checked = !!item.doneBy;
          return (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => void toggle(i)}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-site-sm px-1.5 py-1 text-left text-sm hover:bg-site-surface-hover focus-visible:ring-2 focus-visible:ring-site-accent disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-site-sm border',
                    checked
                      ? 'border-site-accent bg-site-accent text-site-accent-fg'
                      : 'border-site-border-bright',
                  )}
                >
                  {checked && <Check className="size-3.5" />}
                </span>
                <span
                  className={cn(
                    'min-w-0 break-words',
                    checked && 'text-site-text-dim line-through',
                  )}
                >
                  {item.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DmPollCard({
  chat,
  messageId,
  poll,
  disabled,
}: {
  chat: ChatRef;
  messageId: string;
  poll: PollView;
  disabled?: boolean;
}) {
  const { t } = useTranslation('f-messaging');
  const [view, setView] = useState<PollView>(poll);
  useEffect(() => setView(poll), [poll]);

  const voted = view.myVote !== null;
  const vote = async (optionIdx: number) => {
    if (disabled || view.myVote === optionIdx) return;
    const before = view;
    setView((v) => {
      const options = v.options.map((o, i) => ({
        ...o,
        votes: o.votes + (i === optionIdx ? 1 : 0) - (i === v.myVote ? 1 : 0),
      }));
      return {
        ...v,
        options,
        myVote: optionIdx,
        totalVotes: v.myVote === null ? v.totalVotes + 1 : v.totalVotes,
      };
    });
    try {
      const res = await fetch(`/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, optionIdx }),
      });
      if (!res.ok) throw new Error('vote failed');
      const data = (await res.json()) as { poll: PollView };
      setView(data.poll);
    } catch {
      setView(before);
      toast.error(t('poll-vote-failed', { defaultValue: 'Could not record your vote' }));
    }
  };

  return (
    <div className="glass-fill w-64 max-w-full rounded-site p-3 text-site-text">
      <p className="mb-2 flex items-start gap-1.5 text-sm font-semibold">
        <BarChart3 className="mt-0.5 size-4 shrink-0 text-site-accent" aria-hidden />
        {view.question}
      </p>
      <div className="flex flex-col gap-1.5">
        {view.options.map((o, i) => {
          const pct = view.totalVotes > 0 ? Math.round((o.votes / view.totalVotes) * 100) : 0;
          const chosen = view.myVote === i;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-pressed={chosen}
              onClick={() => void vote(i)}
              className={cn(
                'relative overflow-hidden rounded-site-sm border px-3 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-site-accent',
                chosen
                  ? 'border-site-accent'
                  : 'border-site-border hover:border-site-border-bright',
              )}
            >
              {voted && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-site-accent-dim"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className={cn('truncate', chosen && 'font-semibold')}>{o.text}</span>
                {voted && <span className="shrink-0 text-xs text-site-text-dim">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-site-text-dim">
        {t('poll-votes', { count: view.totalVotes, defaultValue: '{{count}} votes' })}
      </p>
    </div>
  );
}
