/**
 * RhymeTimeGame — Phase router for the Rhyme Time minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   ROUND_START  → Animated root-word reveal
 *   INPUT        → RhymeTimeInput (text entry)
 *   SCORING      → RhymeTimeResults (word breakdown)
 *   INTERMISSION → RhymeTimeScoreboard (standings between rounds)
 *   GAME_OVER    → RhymeTimeScoreboard (final scores + awards)
 *
 * Handles server actions:
 *   RT_ROUND_START, RT_INPUT_START, RT_RHYME_SUBMITTED, RT_RHYME_REJECTED,
 *   RT_SUBMISSION_COUNT, RT_ROUND_RESULTS, RT_INTERMISSION,
 *   RT_GAME_OVER, TIMER_TICK
 *
 * The submission cap and the invalid-word penalty are host-configurable
 * (see RHYME_TIME_SETTINGS), so both are read off the wire rather than from
 * the shipped constants — the constants are only the pre-connection fallback.
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket, extractTimerTick } from '@/lib/rmhbox/minigame-client';
import { playSound } from '@/lib/rmhbox/audio';
import { toast } from '@/lib/rmhbox/toast-store';
import { RT_MAX_SUBMISSIONS, RT_INVALID_PENALTY } from '@/lib/rmhbox/constants';
import RhymeTimeInput from './RhymeTimeInput';
import RhymeTimeResults from './RhymeTimeResults';
import RhymeTimeScoreboard from './RhymeTimeScoreboard';
import type { Submission, PlayerSubmissionCount } from './RhymeTimeInput';
import type { WordResult, PlayerBreakdown } from './RhymeTimeResults';
import type { Standing, AwardEntry } from './RhymeTimeScoreboard';

type Phase = 'ROUND_START' | 'INPUT' | 'SCORING' | 'INTERMISSION' | 'GAME_OVER';

/** How long a rejected-submission toast stays up, in ms. */
const REJECT_TOAST_MS = 1800;

interface RhymeTimeGameProps {
  playerId: string;
  playerName: string;
}

export default function RhymeTimeGame({ playerId, playerName: _playerName }: RhymeTimeGameProps) {
  void _playerName; // Consumed by MinigameProps interface; not directly used in this component
  const { t } = useTranslation("c-rmhbox");
  const [phase, setPhase] = useState<Phase>('ROUND_START');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(0);
  const [rootWord, setRootWord] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [totalDuration, setTotalDuration] = useState(60);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [submissionCounts, setSubmissionCounts] = useState<PlayerSubmissionCount[]>([]);
  const [maxSubmissions, setMaxSubmissions] = useState(RT_MAX_SUBMISSIONS);
  const [invalidPenalty, setInvalidPenalty] = useState(RT_INVALID_PENALTY);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [playerBreakdowns, setPlayerBreakdowns] = useState<PlayerBreakdown[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);

  // Track spectator status
  const isSpectator = useRMHboxStore((s) => s.lobby?.myRole === 'spectator');

  // Lookup map from userId → userName for building breakdowns
  const players = useRMHboxStore((s) => s.lobby?.players);

  // Handle incoming game actions
  // Server sends flat objects: { type: 'RT_ROUND_START', round, totalRounds, rootWord, duration }
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'RT_ROUND_START': {
          setPhase('ROUND_START');
          // rootWord may be a string or { word, ... } object
          const rw = data.rootWord;
          setRootWord(typeof rw === 'string' ? rw : (rw as Record<string, unknown>)?.word as string ?? '');
          setCurrentRound(data.round as number);
          setTotalRounds(data.totalRounds as number);
          setTimeRemaining(data.duration as number);
          setTotalDuration(data.duration as number);
          setMySubmissions([]);
          setSubmissionCounts([]);
          // Server will send RT_INPUT_START when the reveal period ends
          playSound('goFanfare');
          break;
        }
        case 'RT_INPUT_START': {
          // Server sends this after round start to signal input phase
          setPhase('INPUT');
          setTimeRemaining(data.timeRemaining as number);
          setTotalDuration(data.duration as number);
          break;
        }
        case 'RT_RHYME_SUBMITTED': {
          // Server sends: { type, word, isValid, invalidReason?, penalty, submissionCount, maxSubmissions }
          if (typeof data.maxSubmissions === 'number') setMaxSubmissions(data.maxSubmissions);
          const rawReason = data.invalidReason as string | undefined;
          // The penalty is whatever the host configured, not a fixed −1; older
          // servers omit it, so fall back to the current setting.
          const penalty = typeof data.penalty === 'number' ? data.penalty : invalidPenalty;
          const sub: Submission = {
            word: data.word as string,
            status: (data.isValid as boolean)
              ? 'valid'
              : rawReason === 'not_in_dictionary'
                ? 'not_in_dict'
                : 'invalid',
            invalidReason: rawReason === 'not_in_dictionary'
              ? t("rt-not-in-dictionary", { defaultValue: "Not in dictionary (no penalty)" })
              : rawReason === 'does_not_rhyme'
                ? t("rt-does-not-rhyme", { defaultValue: "Doesn't rhyme ({{penalty}})", penalty })
                : undefined,
          };
          setMySubmissions((prev) => [...prev, sub]);
          playSound(data.isValid ? 'scoreDing' : 'buzzer');
          break;
        }
        case 'RT_RHYME_REJECTED': {
          // The word never became a submission — nothing lands in the pill list,
          // so without this the input just silently swallowed what was typed.
          // Server sends: { type, reason, word?, maxSubmissions? }
          if (typeof data.maxSubmissions === 'number') setMaxSubmissions(data.maxSubmissions);
          const reason = data.reason as string | undefined;
          const word = typeof data.word === 'string' ? data.word : '';
          playSound('buzzer');
          // Short-lived: this is a nudge during a 45-second typing sprint, and
          // the default 4s would leave a stack of them over the word list.
          if (reason === 'duplicate') {
            toast.warning(t("rt-rejected-duplicate", { defaultValue: "You already submitted \"{{word}}\"", word }), REJECT_TOAST_MS);
          } else if (reason === 'max_submissions') {
            toast.warning(t("rt-rejected-max", { defaultValue: "Submission limit reached ({{max}})", max: typeof data.maxSubmissions === 'number' ? data.maxSubmissions : maxSubmissions }), REJECT_TOAST_MS);
          } else {
            toast.warning(t("rt-rejected-invalid", { defaultValue: "That word can't be submitted" }), REJECT_TOAST_MS);
          }
          break;
        }
        case 'RT_SUBMISSION_COUNT': {
          // Server sends per-player: { type, userId, count }
          // Accumulate into the counts array
          const userId = data.userId as string;
          const count = data.count as number;
          setSubmissionCounts((prev) => {
            const existing = prev.find((p) => p.userId === userId);
            if (existing) {
              return prev.map((p) =>
                p.userId === userId ? { ...p, count } : p,
              );
            }
            // Find userName from lobby players
            const p = players?.find((pl) => pl.userId === userId);
            return [...prev, { userId, userName: p?.userName ?? userId, count }];
          });
          break;
        }
        case 'RT_ROUND_RESULTS': {
          // Server sends: { type, round, results: RoundResult, scores, duration }
          // RoundResult.playerResults: Record<string, { userId, userName, breakdown: WordBreakdown[], roundScore, validCount, invalidCount }>
          setPhase('SCORING');
          playSound('victoryFanfare');
          const results = data.results as Record<string, unknown>;
          const playerResults = results?.playerResults as Record<
            string,
            {
              userId: string;
              userName: string;
              breakdown: Array<{
                word: string;
                isValid: boolean;
                invalidReason?: string;
                rarity: number;
                basePoints: number;
                multiSyllableBonus: number;
                speedBonus: number;
                totalPoints: number;
                submitterCount: number;
                isMultiSyllable: boolean;
              }>;
              roundScore: number;
              validCount: number;
              invalidCount: number;
            }
          >;

          // Flatten all breakdowns into WordResult[]
          const words: WordResult[] = [];
          const breakdowns: PlayerBreakdown[] = [];

          if (playerResults) {
            for (const pr of Object.values(playerResults)) {
              breakdowns.push({
                userId: pr.userId,
                userName: pr.userName,
                validCount: pr.validCount,
                invalidCount: pr.invalidCount,
                roundScore: pr.roundScore,
              });
              for (const wb of pr.breakdown) {
                if (wb.isValid) {
                  // Map rarity number → tier name
                  let rarity: 'rare' | 'uncommon' | 'common' = 'common';
                  if (wb.submitterCount === 1) rarity = 'rare';
                  else if (wb.submitterCount <= 2) rarity = 'uncommon';

                  words.push({
                    word: wb.word,
                    submitters: [{ userId: pr.userId, userName: pr.userName, speedBonus: wb.speedBonus > 0 }],
                    rarity,
                    points: wb.basePoints + (wb.multiSyllableBonus ?? 0),
                    multiSyllable: wb.isMultiSyllable,
                  });
                } else {
                  // Invalid words: not_in_dictionary or does_not_rhyme
                  words.push({
                    word: wb.word,
                    submitters: [{ userId: pr.userId, userName: pr.userName, speedBonus: false }],
                    rarity: wb.invalidReason === 'not_in_dictionary' ? 'not_in_dict' : 'does_not_rhyme',
                    points: wb.totalPoints,
                    multiSyllable: false,
                  });
                }
              }
            }
          }

          setWordResults(words);
          setPlayerBreakdowns(breakdowns);
          break;
        }
        case 'RT_INTERMISSION': {
          // Server sends: { type, duration, nextRound, scores: Record<string,number> }
          setPhase('INTERMISSION');
          playSound('swoosh');
          const scores = data.scores as Record<string, number> | undefined;
          if (scores) {
            const standingsList: Standing[] = Object.entries(scores).map(([uid, sc]) => {
              const p = players?.find((pl) => pl.userId === uid);
              return { userId: uid, userName: p?.userName ?? uid, totalScore: sc, delta: 0 };
            });
            standingsList.sort((a, b) => b.totalScore - a.totalScore);
            setStandings(standingsList);
          }
          break;
        }
        case 'RT_GAME_OVER': {
          // Game-over is handled by game coordinator via GAME_ROUND_RESULTS event,
          // but the minigame itself may also send a final state.
          setPhase('GAME_OVER');
          break;
        }
        case 'TIMER_START': {
          // Phase timer started — update local duration/remaining from payload
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            setTotalDuration(pl.totalDuration as number);
            setTimeRemaining(pl.timeRemaining as number);
          }
          break;
        }
        case 'TIMER_TICK': {
          const remaining = extractTimerTick(data);
          if (remaining !== undefined) {
            setTimeRemaining(remaining);
            if (remaining <= 5 && remaining > 0) playSound('countdownBeep');
          }
          break;
        }
      }
    },
    [players, t, invalidPenalty, maxSubmissions],
  );

  // Also listen for GAME_ROUND_RESULTS for game-over standings/awards
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      const rankings = data.rankings as Array<{
        userId: string;
        userName: string;
        score: number;
        rank: number;
      }> | undefined;

      const rawAwards = data.awards as Array<{
        userId: string;
        title: string;
        description: string;
        icon: string;
      }> | undefined;

      if (rankings) {
        setPhase('GAME_OVER');
        const scoreboard: Standing[] = rankings.map((r) => ({
          userId: r.userId,
          userName: r.userName,
          totalScore: r.score,
          delta: r.score,
        }));
        setStandings(scoreboard);

        if (rawAwards) {
          const mapped: AwardEntry[] = rawAwards.map((a) => ({
            icon: a.icon,
            title: a.title,
            recipient: a.userId,
            description: a.description,
          }));
          setAwards(mapped);
        }
      }
    },
    [],
  );

  /** Handle full state snapshot (reconnection / spectator player switch) */
  const handleStateSnapshot = useCallback(
    (data: Record<string, unknown>) => {
      const p = data.phase as string;
      if (p === 'ROUND_START' || p === 'INPUT' || p === 'SCORING' || p === 'INTERMISSION' || p === 'GAME_OVER') {
        setPhase(p);
      }
      if (data.currentRound) setCurrentRound(data.currentRound as number);
      if (data.totalRounds) setTotalRounds(data.totalRounds as number);
      if (data.timeRemaining != null) setTimeRemaining(data.timeRemaining as number);
      if (typeof data.maxSubmissions === 'number') setMaxSubmissions(data.maxSubmissions);
      if (typeof data.invalidPenalty === 'number') setInvalidPenalty(data.invalidPenalty);
      if (data.rootWord) {
        const rw = data.rootWord;
        setRootWord(typeof rw === 'string' ? rw : (rw as Record<string, unknown>)?.word as string ?? '');
      }
      if (Array.isArray(data.mySubmissions)) {
        const penalty = typeof data.invalidPenalty === 'number' ? data.invalidPenalty : invalidPenalty;
        setMySubmissions(
          (data.mySubmissions as Array<Record<string, unknown>>).map((s) => {
            const reason = s.invalidReason as string | undefined;
            // A dictionary miss is its own state (dimmed, no penalty). Folding
            // it into 'invalid' here made every reconnect recolour those pills
            // red and claim points the player never lost.
            const status = (s.isValid as boolean)
              ? 'valid' as const
              : reason === 'not_in_dictionary'
                ? 'not_in_dict' as const
                : 'invalid' as const;
            return {
              word: s.word as string,
              status,
              invalidReason:
                status === 'not_in_dict'
                  ? t("rt-not-in-dictionary", { defaultValue: "Not in dictionary (no penalty)" })
                  : status === 'invalid'
                    ? t("rt-does-not-rhyme", { defaultValue: "Doesn't rhyme ({{penalty}})", penalty })
                    : undefined,
            };
          }),
        );
      } else {
        setMySubmissions([]);
      }
    },
    [t, invalidPenalty],
  );

  // Subscribe to socket events and hydrate from store on mount
  useGameSocket({
    onGameAction: handleGameAction,
    onStateSnapshot: handleStateSnapshot,
    onRoundResults: handleRoundResults,
  });

  // Submit a word (disabled for spectators)
  const handleSubmitWord = useCallback(
    (word: string) => {
      if (isSpectator) return;
      emitGameInput('SUBMIT_RHYME', { word });
    },
    [isSpectator],
  );

  return (
    <AnimatePresence mode="wait">
      {/* ROUND_START — animated root-word reveal */}
      {phase === 'ROUND_START' && (
        <motion.div
          key="round-start"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 text-(--app-text)"
        >
          <p className="text-sm uppercase tracking-wider text-(--app-text-muted)">
            {totalRounds > 0
              ? t("round-of", { defaultValue: "Round {{current}} of {{total}}", current: currentRound, total: totalRounds })
              : t("round-number", { defaultValue: "Round {{current}}", current: currentRound })}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
            className="text-6xl font-extrabold text-(--app-accent)"
          >
            {rootWord}
          </motion.h1>
          <p className="text-sm text-(--app-text-muted)">{t("get-ready-to-rhyme", { defaultValue: "Get ready to rhyme!" })}</p>
        </motion.div>
      )}

      {/* INPUT — word submission phase */}
      {phase === 'INPUT' && (
        <motion.div
          key="input"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full items-start justify-center"
        >
          <RhymeTimeInput
            rootWord={rootWord}
            timeRemaining={timeRemaining}
            totalDuration={totalDuration}
            mySubmissions={mySubmissions}
            submissionCounts={submissionCounts}
            maxSubmissions={maxSubmissions}
            disabled={isSpectator}
            onSubmit={handleSubmitWord}
          />
        </motion.div>
      )}

      {/* SCORING — round results */}
      {phase === 'SCORING' && (
        <motion.div
          key="scoring"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <RhymeTimeResults
            rootWord={rootWord}
            currentUserId={playerId}
            wordResults={wordResults}
            playerBreakdowns={playerBreakdowns}
            roundNumber={currentRound}
          />
        </motion.div>
      )}

      {/* INTERMISSION / GAME_OVER — scoreboard */}
      {(phase === 'INTERMISSION' || phase === 'GAME_OVER') && (
        <motion.div
          key="scoreboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <RhymeTimeScoreboard
            standings={standings}
            currentUserId={playerId}
            currentRound={currentRound}
            totalRounds={totalRounds}
            isGameOver={phase === 'GAME_OVER'}
            awards={awards}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
