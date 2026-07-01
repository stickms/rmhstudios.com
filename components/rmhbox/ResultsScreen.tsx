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
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useCelebration } from '@/hooks/useCelebration';
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

/** Fade-in animation props with a configurable stagger delay. */
function fadeInProps(delay: number) {
  return {
    initial: { opacity: 0, y: 20 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { duration: 0.4, delay },
  };
}

export default function ResultsScreen({
  rankings,
  sessionStandings,
  awards,
  roundNumber: _roundNumber,
  isHost,
  lobbyId,
}: ResultsScreenProps) {
  const { t } = useTranslation("c-rmhbox");
  void _roundNumber; // retained in the prop interface for future use
  // ResultsScreen only renders during ROUND_RESULTS — always let the host advance.
  const showNextButton = isHost;

  const handleNext = useCallback(() => {
    emit(C2S.GAME_FORCE_SKIP, { lobbyId });
  }, [lobbyId]);

  const celebrate = useCelebration();

  // Fire confetti for the winner (skipped automatically under reduced motion).
  useEffect(() => {
    if (rankings.length === 0) return;
    const timer = setTimeout(() => {
      void celebrate();
    }, 600);
    return () => clearTimeout(timer);
  }, [rankings, celebrate]);

  const top3 = rankings.slice(0, 3);
  // Reorder for podium display: 2nd, 1st, 3rd
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <motion.div
      className="mx-auto flex w-full max-w-2xl flex-col p-6 text-(--rmhbox-text)"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <motion.h2 {...fadeInProps(0)} className="mb-6 text-center text-2xl font-bold">
        {t("results", { defaultValue: "Results" })}
      </motion.h2>

      {/* Podium */}
      <motion.div {...fadeInProps(0.15)} className="mb-6 flex items-end justify-center gap-4">
        {podiumOrder.map((player, i) => {
          const podiumIndex = top3.length >= 3 ? [1, 0, 2][i] : i;
          return (
            <div key={player.userId} className="flex flex-col items-center gap-1">
              <span className={`text-2xl font-bold ${PODIUM_COLORS[podiumIndex]}`}>
                {podiumIndex === 0 ? <Trophy className="h-6 w-6" /> : <Medal className="h-5 w-5" />}
              </span>
              <span className="text-sm font-semibold">{player.userName}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">{t("score-pts", { defaultValue: "{{score}} pts", score: player.score })}</span>
              <div
                className={`${PODIUM_HEIGHTS[podiumIndex]} w-20 rounded-t-lg bg-(--rmhbox-accent)`}
                style={{ opacity: 1 - podiumIndex * 0.2 }}
              />
            </div>
          );
        })}
      </motion.div>

      {/* Full rankings */}
      {rankings.length > 0 && (
        <motion.div {...fadeInProps(0.3)} className="mb-6 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            {t("all-players", { defaultValue: "All Players" })}
          </h3>
          <ul className="space-y-1">
            {rankings.map((p) => (
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
        <motion.div {...fadeInProps(0.45)} className="mb-6 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            <AwardIcon className="h-4 w-4" /> {t("awards", { defaultValue: "Awards" })}
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
        <motion.div {...fadeInProps(0.6)} className="mb-6 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            {t("session-standings", { defaultValue: "Session Standings" })}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-(--rmhbox-text-muted)">
                <th className="pb-1 font-medium">#</th>
                <th className="pb-1 font-medium">{t("player", { defaultValue: "Player" })}</th>
                <th className="pb-1 text-right font-medium">{t("total", { defaultValue: "Total" })}</th>
                <th className="pb-1 text-right font-medium">{t("wins", { defaultValue: "Wins" })}</th>
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
        <motion.div {...fadeInProps(0.75)} className="flex justify-center pt-2 pb-4">
          <button
            onClick={handleNext}
            className="flex items-center gap-2 rounded-lg px-8 py-3 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-95 animate-pulse"
            style={{ backgroundColor: 'var(--rmhbox-accent)' }}
          >
            {t("continue-to-lobby", { defaultValue: "Continue to Lobby" })}
            <ChevronRight className="h-5 w-5" />
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
