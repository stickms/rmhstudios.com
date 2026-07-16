/**
 * VotingPhase — Head-to-head matchup voting interface.
 *
 * Shows the prompt and two anonymous answers side by side. Players
 * (except the two authors) vote for their favorite. Authors see a
 * spectating message instead of vote buttons.
 */
'use client';

import { m as motion } from 'framer-motion';
import { Vote, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MatchupData } from './WitWarGame';

interface VotingPhaseProps {
  matchup: MatchupData;
  matchupIndex: number;
  totalMatchups: number;
  isAuthor: boolean;
  myVote: string | null;
  onVote: (votedForUserId: string) => void;
  voteCount: number;
  totalVoters: number;
}

export default function VotingPhase({
  matchup,
  matchupIndex,
  totalMatchups,
  isAuthor,
  myVote,
  onVote,
  voteCount,
  totalVoters,
}: VotingPhaseProps) {
  const { t } = useTranslation("c-rmhbox");
  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-(--rmhbox-text-muted)">
          <Vote className="h-4 w-4" />
          {t("matchup-index-of-total", { defaultValue: "Matchup {{current}} of {{total}}", current: matchupIndex + 1, total: totalMatchups })}
        </div>
        <span className="text-sm text-(--rmhbox-text-muted)">
          {t("vote-count-of-total", { defaultValue: "{{voteCount}}/{{totalVoters}} voted", voteCount, totalVoters })}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4 text-center"
      >
        <div className="text-xs font-medium text-(--rmhbox-text-muted) mb-1">{t("the-prompt", { defaultValue: "The prompt:" })}</div>
        <div className="text-lg font-bold text-(--rmhbox-text)">{matchup.promptText}</div>
      </motion.div>

      {isAuthor ? (
        <div className="flex flex-col items-center gap-3 py-8 text-(--rmhbox-text-muted)">
          <Eye className="h-8 w-8" />
          <p className="text-sm font-medium">{t("author-spectating", { defaultValue: "This is your matchup — sit back and watch!" })}</p>
          <p className="text-xs">{t("audience-voting", { defaultValue: "The audience is voting on your answer right now." })}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-center text-(--rmhbox-text-muted)">
            {t("which-answer-better", { defaultValue: "Which answer is better?" })}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onVote(matchup.playerA)}
              disabled={myVote !== null}
              className={`rounded-xl border-2 p-5 text-left transition-all ${
                myVote === matchup.playerA
                  ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/10'
                  : myVote !== null
                    ? 'border-(--rmhbox-border) opacity-50'
                    : 'border-(--rmhbox-border) bg-(--rmhbox-surface) hover:border-(--rmhbox-accent)/50'
              }`}
            >
              <div className="text-base font-medium text-(--rmhbox-text)">
                {matchup.answerA}
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onVote(matchup.playerB)}
              disabled={myVote !== null}
              className={`rounded-xl border-2 p-5 text-left transition-all ${
                myVote === matchup.playerB
                  ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/10'
                  : myVote !== null
                    ? 'border-(--rmhbox-border) opacity-50'
                    : 'border-(--rmhbox-border) bg-(--rmhbox-surface) hover:border-(--rmhbox-accent)/50'
              }`}
            >
              <div className="text-base font-medium text-(--rmhbox-text)">
                {matchup.answerB}
              </div>
            </motion.button>
          </div>

          {myVote && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-center text-(--rmhbox-text-muted)"
            >
              {t("vote-cast-waiting", { defaultValue: "Vote cast! Waiting for others..." })}
            </motion.p>
          )}
        </div>
      )}
    </div>
  );
}
