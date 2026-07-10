/**
 * VoteSkipIndicator — Shows vote-to-skip progress and button.
 */
'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SkipForward } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

export default function VoteSkipIndicator() {
  const { t } = useTranslation("c-rmhtube");
  const room = useRmhTubeStore((s) => s.room);

  const handleVoteSkip = useCallback(() => {
    emit(C2S.QUEUE_VOTE_SKIP, {});
  }, []);

  if (!room || !room.currentItem) return null;

  const isHost = room.myUserId === room.hostUserId;
  if (isHost || !room.settings.allowMemberSkip) return null;

  const hasVoted = room.skipVotes.includes(room.myUserId);
  const activeMembers = room.members.filter((m) => m.isConnected).length;
  const votesNeeded = Math.ceil(activeMembers / 2);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <button
        onClick={handleVoteSkip}
        disabled={hasVoted}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors ${
          hasVoted
            ? 'bg-(--rmhtube-surface-active) text-(--rmhtube-text-dim) cursor-not-allowed'
            : 'bg-(--rmhtube-surface-hover) text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)'
        }`}
      >
        <SkipForward className="h-3 w-3" />
        {hasVoted ? t("voted", { defaultValue: "Voted" }) : t("vote-skip", { defaultValue: "Vote Skip" })}
      </button>
      <span className="text-xs text-(--rmhtube-text-dim)">
        {room.skipVotes.length}/{votesNeeded}
      </span>
    </div>
  );
}
