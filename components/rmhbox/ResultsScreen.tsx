/**
 * ResultsScreen — Displays round results with podium, standings, and awards.
 *
 * Uses framer-motion for staggered animations and canvas-confetti
 * for the winner celebration effect.
 *
 * When the timer is infinite (host-driven advancement), shows a pulsing
 * "Next" button at the bottom for the host.
 *
 * Props:
 *   rankings: PlayerRanking[] — Player rankings for the current round
 *   sessionStandings: SessionStanding[] — Cumulative session standings
 *   awards: Award[] — Special awards earned during the round
 *   roundNumber: number — Current round number
 *   isHost: boolean — Whether the current user is the host
 *   lobbyId: string — Lobby ID for emitting force-skip
 */
'use client';

import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Trophy, Medal, Award as AwardIcon, ChevronRight } from 'lucide-react';
import LucideAwardIcon from './LucideAwardIcon';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import type { PlayerRanking, SessionStanding, Award } from '@/lib/rmhbox/types';

interface ResultsScreenProps {
  rankings: PlayerRanking[];
  sessionStandings: SessionStanding[];
  awards: Award[];
  roundNumber: number;
  isHost: boolean;
  lobbyId: string;
}

const PODIUM_COLORS = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
const PODIUM_HEIGHTS = ['h-28', 'h-20', 'h-14'];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function ResultsScreen({
  rankings,
  sessionStandings,
  awards,
  roundNumber,
  isHost,
  lobbyId,
}: ResultsScreenProps) {
  // ResultsScreen only renders during ROUND_RESULTS — always let the host advance.
  const showNextButton = isHost;

  const handleNext = useCallback(() => {
    emit(C2S.GAME_FORCE_SKIP, { lobbyId });
  }, [lobbyId]);

  // Fire confetti for the winner
  useEffect(() => {
    if (rankings.length === 0) return;
    const timer = setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [rankings]);

  const top3 = rankings.slice(0, 3);
  // Reorder for podium display: 2nd, 1st, 3rd
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <motion.div
      className="mx-auto flex w-full max-w-2xl flex-col p-6 text-(--rmhbox-text)"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.h2 variants={itemVariants} className="mb-6 text-center text-2xl font-bold">
        Round {roundNumber} Results
      </motion.h2>

      {/* Podium */}
      <motion.div variants={itemVariants} className="mb-6 flex items-end justify-center gap-4">
        {podiumOrder.map((player, i) => {
          const podiumIndex = top3.length >= 3 ? [1, 0, 2][i] : i;
          return (
            <div key={player.userId} className="flex flex-col items-center gap-1">
              <span className={`text-2xl font-bold ${PODIUM_COLORS[podiumIndex]}`}>
                {podiumIndex === 0 ? <Trophy className="h-6 w-6" /> : <Medal className="h-5 w-5" />}
              </span>
              <span className="text-sm font-semibold">{player.userName}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">{player.score} pts</span>
              <div
                className={`${PODIUM_HEIGHTS[podiumIndex]} w-20 rounded-t-lg bg-(--rmhbox-accent)`}
                style={{ opacity: 1 - podiumIndex * 0.2 }}
              />
            </div>
          );
        })}
      </motion.div>

      {/* Full rankings */}
      {rankings.length > 3 && (
        <motion.div variants={itemVariants} className="mb-6 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            All Players
          </h3>
          <ul className="space-y-1">
            {rankings.slice(3).map((p) => (
              <li key={p.userId} className="flex items-center justify-between text-sm">
                <span>
                  <span className="mr-2 font-mono text-(--rmhbox-text-muted)">{p.rank}.</span>
                  {p.userName}
                </span>
                <span className="font-mono">{p.score}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Awards */}
      {awards.length > 0 && (
        <motion.div variants={itemVariants} className="mb-6 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            <AwardIcon className="h-4 w-4" /> Awards
          </h3>
          <ul className="space-y-2">
            {awards.map((award, i) => {
              const recipientName = rankings.find((r) => r.userId === award.userId)?.userName
                ?? sessionStandings.find((s) => s.userId === award.userId)?.userName
                ?? award.userId;
              return (
                <li key={i} className="flex items-center gap-3">
                  <LucideAwardIcon name={award.icon} className="h-5 w-5" />
                  <div>
                    <span className="font-semibold">{award.title}</span>
                    <span className="mx-1 text-(--rmhbox-text-muted)">&mdash;</span>
                    <span className="text-sm text-(--rmhbox-accent)">{recipientName}</span>
                    <p className="text-xs text-(--rmhbox-text-muted)">{award.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.div>
      )}

      {/* Session standings */}
      {sessionStandings.length > 0 && (
        <motion.div variants={itemVariants} className="mb-6 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            Session Standings
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-(--rmhbox-text-muted)">
                <th className="pb-1 font-medium">#</th>
                <th className="pb-1 font-medium">Player</th>
                <th className="pb-1 text-right font-medium">Total</th>
                <th className="pb-1 text-right font-medium">Wins</th>
              </tr>
            </thead>
            <tbody>
              {sessionStandings.map((s) => (
                <tr key={s.userId} className="border-t border-(--rmhbox-border)">
                  <td className="py-1 font-bold text-(--rmhbox-accent)">{s.rank}</td>
                  <td className="py-1">{s.userName}</td>
                  <td className="py-1 text-right font-mono">{s.totalScore}</td>
                  <td className="py-1 text-right font-mono">{s.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Host "Next" button — shown when using infinite timer */}
      {showNextButton && (
        <motion.div variants={itemVariants} className="flex justify-center pt-2 pb-4">
          <button
            onClick={handleNext}
            className="flex items-center gap-2 rounded-lg px-8 py-3 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-95 animate-pulse"
            style={{ backgroundColor: 'var(--rmhbox-accent)' }}
          >
            Continue to Lobby
            <ChevronRight className="h-5 w-5" />
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
