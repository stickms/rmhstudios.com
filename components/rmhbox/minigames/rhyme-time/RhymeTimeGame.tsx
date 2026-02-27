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
 *   RT_ROUND_START, RT_INPUT_START, RT_RHYME_SUBMITTED,
 *   RT_SUBMISSION_COUNT, RT_ROUND_RESULTS, RT_INTERMISSION,
 *   RT_GAME_OVER, TIMER_TICK
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket, extractTimerTick } from '@/lib/rmhbox/minigame-client';
import { playSound } from '@/lib/rmhbox/audio';
import RhymeTimeInput from './RhymeTimeInput';
import RhymeTimeResults from './RhymeTimeResults';
import RhymeTimeScoreboard from './RhymeTimeScoreboard';
import type { Submission, PlayerSubmissionCount } from './RhymeTimeInput';
import type { WordResult, PlayerBreakdown } from './RhymeTimeResults';
import type { Standing, AwardEntry } from './RhymeTimeScoreboard';

type Phase = 'ROUND_START' | 'INPUT' | 'SCORING' | 'INTERMISSION' | 'GAME_OVER';

interface RhymeTimeGameProps {
  playerId: string;
  playerName: string;
}

export default function RhymeTimeGame({ playerId, playerName: _playerName }: RhymeTimeGameProps) {
  void _playerName; // Consumed by MinigameProps interface; not directly used in this component
  const [phase, setPhase] = useState<Phase>('ROUND_START');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(0);
  const [rootWord, setRootWord] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [totalDuration, setTotalDuration] = useState(60);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [submissionCounts, setSubmissionCounts] = useState<PlayerSubmissionCount[]>([]);
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
          // Server sends: { type, word, isValid, invalidReason?, submissionCount, maxSubmissions }
          const rawReason = data.invalidReason as string | undefined;
          const sub: Submission = {
            word: data.word as string,
            status: (data.isValid as boolean)
              ? 'valid'
              : rawReason === 'not_in_dictionary'
                ? 'not_in_dict'
                : 'invalid',
            invalidReason: rawReason === 'not_in_dictionary'
              ? 'Not in dictionary (no penalty)'
              : rawReason === 'does_not_rhyme'
                ? "Doesn't rhyme (−1)"
                : undefined,
          };
          setMySubmissions((prev) => [...prev, sub]);
          playSound(data.isValid ? 'scoreDing' : 'buzzer');
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
                    submittedBy: pr.userName,
                    userId: pr.userId,
                    rarity,
                    points: wb.totalPoints,
                    multiSyllable: wb.isMultiSyllable,
                    speedBonus: wb.speedBonus > 0,
                  });
                } else {
                  // Invalid words: not_in_dictionary or does_not_rhyme
                  words.push({
                    word: wb.word,
                    submittedBy: pr.userName,
                    userId: pr.userId,
                    rarity: wb.invalidReason === 'not_in_dictionary' ? 'not_in_dict' : 'does_not_rhyme',
                    points: wb.totalPoints,
                    multiSyllable: false,
                    speedBonus: false,
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
    [players],
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
      if (data.rootWord) {
        const rw = data.rootWord;
        setRootWord(typeof rw === 'string' ? rw : (rw as Record<string, unknown>)?.word as string ?? '');
      }
      if (Array.isArray(data.mySubmissions)) {
        setMySubmissions(
          (data.mySubmissions as Array<Record<string, unknown>>).map((s) => ({
            word: s.word as string,
            status: (s.isValid as boolean) ? 'valid' as const : 'invalid' as const,
            invalidReason: s.invalidReason as string | undefined,
          })),
        );
      } else {
        setMySubmissions([]);
      }
    },
    [],
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
          className="flex flex-col items-center justify-center gap-4 text-(--rmhbox-text)"
        >
          <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">
            {totalRounds > 0 ? `Round ${currentRound} of ${totalRounds}` : `Round ${currentRound}`}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
            className="text-6xl font-extrabold text-(--rmhbox-accent)"
          >
            {rootWord}
          </motion.h1>
          <p className="text-sm text-(--rmhbox-text-muted)">Get ready to rhyme!</p>
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
