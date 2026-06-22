'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import type { FeedPoll } from '@/lib/feed-types';

interface PollDisplayProps {
  poll: FeedPoll;
  postId: string;
  onUpdate?: (poll: FeedPoll) => void;
  /** Override the vote endpoint (defaults to the RMHark route). */
  voteUrl?: string;
}

export function PollDisplay({ poll, postId, onUpdate, voteUrl }: PollDisplayProps) {
  const { data: session } = authClient.useSession();
  const [localPoll, setLocalPoll] = useState(poll);
  const [voting, setVoting] = useState(false);

  const hasVoted = (localPoll.myVotes?.length ?? 0) > 0;
  const isClosed = !!localPoll.closesAt && new Date(localPoll.closesAt).getTime() <= Date.now();
  const showResults = hasVoted || isClosed;

  const handleVote = async (optionId: string) => {
    if (!session || voting || isClosed) return;

    setVoting(true);

    // Optimistic update
    const wasVoted = localPoll.myVotes?.includes(optionId);
    let newMyVotes: string[];
    let newOptions = localPoll.options.map((o) => ({ ...o }));
    let newTotal = localPoll.totalVotes;

    if (wasVoted) {
      // Toggle off
      newMyVotes = (localPoll.myVotes ?? []).filter((id) => id !== optionId);
      newOptions = newOptions.map((o) =>
        o.id === optionId ? { ...o, voteCount: Math.max(0, o.voteCount - 1) } : o
      );
      newTotal = Math.max(0, newTotal - 1);
    } else if (localPoll.multiSelect) {
      // Multi-select: add vote
      newMyVotes = [...(localPoll.myVotes ?? []), optionId];
      newOptions = newOptions.map((o) =>
        o.id === optionId ? { ...o, voteCount: o.voteCount + 1 } : o
      );
      newTotal += 1;
    } else {
      // Single-select: replace vote
      const prevVoteId = localPoll.myVotes?.[0];
      newMyVotes = [optionId];
      newOptions = newOptions.map((o) => {
        if (o.id === optionId) return { ...o, voteCount: o.voteCount + 1 };
        if (o.id === prevVoteId) return { ...o, voteCount: Math.max(0, o.voteCount - 1) };
        return o;
      });
      if (!prevVoteId) newTotal += 1;
    }

    const optimistic = { ...localPoll, myVotes: newMyVotes, options: newOptions, totalVotes: newTotal };
    setLocalPoll(optimistic);
    onUpdate?.(optimistic);

    try {
      const res = await fetch(voteUrl ?? `/api/rmharks/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverPoll: FeedPoll = {
          ...localPoll,
          myVotes: data.myVotes,
          totalVotes: data.totalVotes,
          options: localPoll.options.map((o) => {
            const updated = data.options.find((so: any) => so.id === o.id);
            return updated ? { ...o, voteCount: updated.voteCount } : o;
          }),
        };
        setLocalPoll(serverPoll);
        onUpdate?.(serverPoll);
      } else {
        // Rollback on error
        setLocalPoll(poll);
        onUpdate?.(poll);
      }
    } catch {
      setLocalPoll(poll);
      onUpdate?.(poll);
    } finally {
      setVoting(false);
    }
  };

  const maxVotes = Math.max(...localPoll.options.map((o) => o.voteCount), 1);

  return (
    <div className="mt-3 border border-site-border rounded-xl p-3 bg-site-surface/20">
      <p className="text-sm font-semibold text-site-text mb-2">{localPoll.question}</p>

      {localPoll.multiSelect && !showResults && (
        <p className="text-xs text-site-text-dim mb-2">Select all that apply</p>
      )}

      <div className="space-y-2">
        {localPoll.options.map((option) => {
          const isSelected = localPoll.myVotes?.includes(option.id);
          const pct = localPoll.totalVotes > 0
            ? Math.round((option.voteCount / localPoll.totalVotes) * 100)
            : 0;

          if (showResults) {
            return (
              <button
                key={option.id}
                onClick={() => handleVote(option.id)}
                disabled={!session || voting || isClosed}
                className="w-full text-left relative overflow-hidden rounded-lg border border-site-border transition-colors hover:border-site-accent/50 disabled:opacity-70"
              >
                {/* Progress bar background */}
                <div
                  className={`absolute inset-0 transition-all duration-300 ${
                    isSelected ? 'bg-site-accent/20' : 'bg-site-surface/50'
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-site-text">
                    {isSelected && <Check className="w-3.5 h-3.5 text-site-accent shrink-0" />}
                    {option.text}
                  </span>
                  <span className={`text-xs font-mono shrink-0 ${
                    isSelected ? 'text-site-accent font-semibold' : 'text-site-text-dim'
                  }`}>
                    {pct}%
                  </span>
                </div>
              </button>
            );
          }

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={!session || voting || isClosed}
              className="w-full text-left px-3 py-2 rounded-lg border border-site-border text-sm text-site-text hover:border-site-accent hover:bg-site-accent/5 transition-colors disabled:opacity-50"
            >
              {option.text}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-site-text-dim mt-2">
        {localPoll.totalVotes} vote{localPoll.totalVotes !== 1 ? 's' : ''}
        {localPoll.multiSelect && ' · Multiple choice'}
        {localPoll.closesAt && (
          <> · {isClosed ? 'Final results' : `Closes ${new Date(localPoll.closesAt).toLocaleString()}`}</>
        )}
      </p>
    </div>
  );
}
