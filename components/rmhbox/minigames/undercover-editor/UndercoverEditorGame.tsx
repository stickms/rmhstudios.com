/**
 * UndercoverEditorGame — Phase router for the Undercover Editor minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   WRITE (my turn)   → WriteInput + StoryDisplay
 *   WRITE (not my turn) → StoryDisplay + TurnIndicator waiting
 *   EDIT (I am Editor) → StoryEditor
 *   EDIT (I am Writer) → StoryDisplay + "Story is being reviewed…"
 *   REVIEW             → StoryDisplay (full story)
 *   ACCUSATION         → AccusationPanel
 *   REVEAL             → RevealScreen
 *
 * Handles server actions:
 *   UE_GAME_START, UE_ROLE_ASSIGNED, UE_TURN_START, UE_SENTENCE_ADDED,
 *   UE_EDIT_PROMPT, UE_STORY_UPDATED, UE_REVIEW_START, UE_ACCUSATION_START,
 *   UE_VOTE_CAST, UE_REVEAL, TIMER_TICK, TIMER_START, MINIGAME_ROUND
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { playSound } from '@/lib/rmhbox/audio';
import StoryDisplay from './StoryDisplay';
import WriteInput from './WriteInput';
import StoryEditor from './StoryEditor';
import type { EditableStory } from './StoryEditor';
import AccusationPanel from './AccusationPanel';
import RevealScreen from './RevealScreen';
import RoleBadge from './RoleBadge';
import TurnIndicator from './TurnIndicator';

type Phase = 'LOBBY' | 'WRITE' | 'EDIT' | 'REVIEW' | 'ACCUSATION' | 'REVEAL' | 'GAME_OVER';

interface Sentence {
  authorId: string;
  authorName: string;
  text: string;
  turnNumber: number;
}

interface EditEntry {
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
}

interface VoteEntry {
  voterName: string;
  accusedName: string;
}

interface ScoreEntry {
  userName: string;
  role: string;
  score: number;
}

interface RevealData {
  editorUserId: string;
  editorName: string;
  keyword: string;
  keywordInStory: boolean;
  editorCaught: boolean;
  edits: EditEntry[];
  votes: VoteEntry[];
  winner: string;
  scores: ScoreEntry[];
}

interface PlayerEntry {
  userId: string;
  userName: string;
}

/** Helper: emit a game input action with the correct GameInputSchema shape */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface UndercoverEditorGameProps {
  playerId: string;
  playerName: string;
}

export default function UndercoverEditorGame({
  playerId,
  playerName: _playerName,
}: UndercoverEditorGameProps) {
  void _playerName; // Consumed by MinigameProps interface; not directly used

  const [phase, setPhase] = useState<Phase>('LOBBY');
  const [role, setRole] = useState<'writer' | 'editor' | null>(null);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [storyPrompt, setStoryPrompt] = useState('');
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [totalTurns, setTotalTurns] = useState(0);
  const [activeTurnUserId, setActiveTurnUserId] = useState<string | null>(null);
  const [story, setStory] = useState<Sentence[]>([]);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [votedPlayers, setVotedPlayers] = useState<string[]>([]);
  const [editableStory, setEditableStory] = useState<EditableStory | null>(null);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [gamePlayers, setGamePlayers] = useState<PlayerEntry[]>([]);

  const players = useRMHboxStore((s) => s.lobby?.players);

  // Derive the active player's name
  const activePlayerName =
    players?.find((p) => p.userId === activeTurnUserId)?.userName ??
    gamePlayers.find((p) => p.userId === activeTurnUserId)?.userName ??
    'Unknown';

  const isMyTurn = activeTurnUserId === playerId;

  // Handle incoming game actions
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'UE_GAME_START': {
          setPhase('LOBBY');
          setStoryPrompt((data.storyPrompt as string) ?? '');
          setTurnOrder((data.turnOrder as string[]) ?? []);
          setTotalTurns((data.totalTurns as number) ?? 0);
          const gp = data.players as PlayerEntry[] | undefined;
          if (gp) setGamePlayers(gp);
          setStory([]);
          setMyVote(null);
          setVotedPlayers([]);
          setRevealData(null);
          setScores([]);
          playSound('swoosh');
          break;
        }
        case 'UE_ROLE_ASSIGNED': {
          const assignedRole = data.role as 'writer' | 'editor';
          setRole(assignedRole);
          if (assignedRole === 'editor') {
            setKeyword(data.keyword as string);
          }
          playSound('chime');
          break;
        }
        case 'UE_TURN_START': {
          setPhase('WRITE');
          setActiveTurnUserId(data.activeUserId as string);
          // Server sends `turnNumber` (1-based), not `turnIndex`
          if (typeof data.turnNumber === 'number') {
            setCurrentTurnIndex((data.turnNumber as number) - 1);
          }
          // Server sends `writeDurationSeconds`, not `timeRemaining`
          if (typeof data.writeDurationSeconds === 'number') {
            setTimeRemaining(data.writeDurationSeconds as number);
          }
          if ((data.activeUserId as string) === playerId) {
            playSound('chime');
          }
          break;
        }
        case 'UE_SENTENCE_ADDED': {
          // Server sends fullStory (array of StorySentenceView), use it to replace story
          const fullStory = data.fullStory as Array<{ authorName: string; text: string; turnNumber: number }> | undefined;
          if (fullStory) {
            setStory(fullStory.map((s) => ({
              authorId: '',
              authorName: s.authorName,
              text: s.text,
              turnNumber: s.turnNumber,
            })));
          }
          playSound('click');
          break;
        }
        case 'UE_EDIT_PROMPT': {
          setPhase('EDIT');
          // Server sends editableStory as `story`, not `editableStory`
          if (data.story) {
            setEditableStory(data.story as EditableStory);
          }
          // Server sends `editDurationSeconds`, not `timeRemaining`
          if (typeof data.editDurationSeconds === 'number') {
            setTimeRemaining(data.editDurationSeconds as number);
          }
          if (role === 'editor') {
            playSound('chime');
          }
          break;
        }
        case 'UE_STORY_UPDATED': {
          // Server sends `fullStory`, not `sentences`
          const updated = data.fullStory as Array<{ authorName: string; text: string; turnNumber: number }> | undefined;
          if (updated) {
            setStory(updated.map((s) => ({
              authorId: '',
              authorName: s.authorName,
              text: s.text,
              turnNumber: s.turnNumber,
            })));
          }
          break;
        }
        case 'UE_REVIEW_START': {
          setPhase('REVIEW');
          // Server sends `fullStory`, not `sentences`
          const reviewStory = data.fullStory as Array<{ authorName: string; text: string; turnNumber: number }> | undefined;
          if (reviewStory) {
            setStory(reviewStory.map((s) => ({
              authorId: '',
              authorName: s.authorName,
              text: s.text,
              turnNumber: s.turnNumber,
            })));
          }
          // Server sends `reviewDurationSeconds`, not `timeRemaining`
          if (typeof data.reviewDurationSeconds === 'number') {
            setTimeRemaining(data.reviewDurationSeconds as number);
          }
          playSound('swoosh');
          break;
        }
        case 'UE_ACCUSATION_START': {
          setPhase('ACCUSATION');
          setMyVote(null);
          setVotedPlayers([]);
          // Server sends `accusationDurationSeconds`, not `timeRemaining`
          if (typeof data.accusationDurationSeconds === 'number') {
            setTimeRemaining(data.accusationDurationSeconds as number);
          }
          // Server sends `players` array with player list
          const accPlayers = data.players as PlayerEntry[] | undefined;
          if (accPlayers) setGamePlayers(accPlayers);
          playSound('swoosh');
          break;
        }
        case 'UE_VOTE_CAST': {
          const voterId = data.voterId as string;
          setVotedPlayers((prev) =>
            prev.includes(voterId) ? prev : [...prev, voterId],
          );
          playSound('click');
          break;
        }
        case 'UE_REVEAL': {
          setPhase('REVEAL');
          const rd: RevealData = {
            editorUserId: data.editorUserId as string,
            editorName: data.editorName as string,
            keyword: data.keyword as string,
            keywordInStory: data.keywordInStory as boolean,
            editorCaught: data.editorCaught as boolean,
            edits: (data.edits as EditEntry[]) ?? [],
            votes: (data.votes as VoteEntry[]) ?? [],
            winner: data.winner as string,
            scores: (data.scores as ScoreEntry[]) ?? [],
          };
          setRevealData(rd);
          setScores(rd.scores);

          if (rd.editorCaught) {
            playSound('scoreDing');
          } else {
            playSound('buzzer');
          }
          break;
        }
        case 'UE_SCORE_UPDATE': {
          const newScores = data.scores as ScoreEntry[] | undefined;
          if (newScores) setScores(newScores);
          break;
        }
        case 'UE_GAME_OVER': {
          setPhase('GAME_OVER');
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            setTimeRemaining(pl.timeRemaining as number);
          }
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') {
            setTimeRemaining(remaining);
            if (remaining <= 3 && remaining > 0) playSound('countdownBeep');
          }
          break;
        }
        case 'MINIGAME_ROUND': {
          // Round info update
          if (typeof data.round === 'number') {
            setCurrentTurnIndex(data.round as number);
          }
          break;
        }
      }
    },
    [playerId, role, currentTurnIndex],
  );

  // Listen for GAME_ROUND_RESULTS for game-over
  const handleRoundResults = useCallback(
    (_data: Record<string, unknown>) => {
      setPhase('GAME_OVER');
    },
    [],
  );

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(S2C.GAME_ACTION, handleGameAction);
    socket.on(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
      socket.off(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    };
  }, [handleGameAction, handleRoundResults]);

  // Hydrate from Zustand gameState snapshot on mount.
  // The server snapshot (getStateForPlayer) sends data with specific field names.
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (['LOBBY', 'WRITE', 'EDIT', 'REVIEW', 'ACCUSATION', 'REVEAL', 'GAME_OVER'].includes(p)) {
      // Map SETUP → LOBBY since the client uses LOBBY for the initial state
      setPhase(p === 'SETUP' ? 'LOBBY' : p as Phase);
    }
    if (snapshot.storyPrompt) setStoryPrompt(snapshot.storyPrompt as string);
    if (snapshot.timeRemaining != null) setTimeRemaining(snapshot.timeRemaining as number);
    // Server sends role as `myRole`, not `role`
    if (snapshot.myRole) setRole(snapshot.myRole as 'writer' | 'editor');
    if (snapshot.keyword) setKeyword(snapshot.keyword as string);
    // Server sends story as `story` (array of StorySentenceView)
    if (Array.isArray(snapshot.story)) {
      setStory((snapshot.story as Array<{ authorName: string; text: string; turnNumber: number }>).map((s) => ({
        authorId: '',
        authorName: s.authorName,
        text: s.text,
        turnNumber: s.turnNumber,
      })));
    }
    if (Array.isArray(snapshot.turnOrder)) setTurnOrder(snapshot.turnOrder as string[]);
    // Server sends `activeUserId` for the currently active player
    if (snapshot.activeUserId) setActiveTurnUserId(snapshot.activeUserId as string);
    if (snapshot.currentTurnIndex != null) setCurrentTurnIndex(snapshot.currentTurnIndex as number);
    if (snapshot.totalTurns != null) setTotalTurns(snapshot.totalTurns as number);
  }, []);

  // Submit a sentence (server expects 'WRITE_SENTENCE')
  const handleSubmitSentence = useCallback(
    (text: string) => {
      emitGameInput('WRITE_SENTENCE', { text });
    },
    [],
  );

  // Submit an edit (server expects 'EDIT_WORD')
  const handleEdit = useCallback(
    (sentenceIndex: number, wordIndex: number, newWord: string) => {
      emitGameInput('EDIT_WORD', { sentenceIndex, wordIndex, newWord });
    },
    [],
  );

  // Skip editing
  const handleSkipEdit = useCallback(() => {
    emitGameInput('SKIP_EDIT', {});
  }, []);

  // Cast a vote (server expects 'CAST_ACCUSATION')
  const handleVote = useCallback(
    (targetUserId: string) => {
      setMyVote(targetUserId);
      emitGameInput('CAST_ACCUSATION', { targetUserId });
    },
    [],
  );

  // Build story context for WriteInput
  const storyContext = story.map((s) => ({
    authorName: s.authorName,
    text: s.text,
  }));

  // Build display sentences for StoryDisplay
  const displaySentences = story.map((s) => ({
    authorName: s.authorName,
    text: s.text,
    turnNumber: s.turnNumber,
  }));

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Persistent role badge */}
      {role && (
        <div className="self-end">
          <RoleBadge role={role} keyword={keyword ?? undefined} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* LOBBY — waiting for game to start */}
        {phase === 'LOBBY' && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center p-8"
          >
            <p className="text-sm text-(--rmhbox-text-muted)">
              Setting up the story…
            </p>
          </motion.div>
        )}

        {/* WRITE — writing phase */}
        {phase === 'WRITE' && (
          <motion.div
            key="write"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center gap-4"
          >
            <TurnIndicator
              activePlayerName={activePlayerName}
              isMyTurn={isMyTurn}
              turnNumber={currentTurnIndex + 1}
              totalTurns={totalTurns}
              timeRemaining={timeRemaining}
            />

            {/* Story so far */}
            {displaySentences.length > 0 && (
              <StoryDisplay
                sentences={displaySentences}
                storyPrompt={storyPrompt}
              />
            )}

            {/* Write input (only when it's my turn) */}
            {isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full flex justify-center"
              >
                <WriteInput
                  storyContext={storyContext}
                  storyPrompt={storyPrompt}
                  timeRemaining={timeRemaining}
                  onSubmit={handleSubmitSentence}
                />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* EDIT — editing phase */}
        {phase === 'EDIT' && (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center gap-4"
          >
            {role === 'editor' && editableStory && keyword ? (
              <StoryEditor
                editableStory={editableStory}
                keyword={keyword}
                timeRemaining={timeRemaining}
                onEdit={handleEdit}
                onSkip={handleSkipEdit}
              />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <StoryDisplay
                  sentences={displaySentences}
                  storyPrompt={storyPrompt}
                />
                <p className="text-sm text-(--rmhbox-text-muted) italic">
                  The story is being reviewed…
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* REVIEW — read the full story */}
        {phase === 'REVIEW' && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center gap-3"
          >
            <h2 className="text-lg font-bold text-(--rmhbox-text)">
              Read the Story
            </h2>
            <p className="text-xs text-(--rmhbox-text-muted)">
              Something may have changed… can you spot the edits?
            </p>
            <StoryDisplay
              sentences={displaySentences}
              storyPrompt={storyPrompt}
            />
          </motion.div>
        )}

        {/* ACCUSATION — voting phase */}
        {phase === 'ACCUSATION' && (
          <motion.div
            key="accusation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AccusationPanel
              players={
                gamePlayers.length > 0
                  ? gamePlayers
                  : (players?.map((p) => ({
                      userId: p.userId,
                      userName: p.userName,
                    })) ?? [])
              }
              myPlayerId={playerId}
              myVote={myVote}
              votedPlayers={votedPlayers}
              timeRemaining={timeRemaining}
              onVote={handleVote}
            />
          </motion.div>
        )}

        {/* REVEAL — dramatic reveal */}
        {phase === 'REVEAL' && revealData && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <RevealScreen
              editorUserId={revealData.editorUserId}
              editorName={revealData.editorName}
              keyword={revealData.keyword}
              keywordInStory={revealData.keywordInStory}
              editorCaught={revealData.editorCaught}
              edits={revealData.edits}
              votes={revealData.votes}
              winner={revealData.winner}
              scores={revealData.scores}
            />
          </motion.div>
        )}

        {/* GAME_OVER — handled by game coordinator */}
        {phase === 'GAME_OVER' && (
          <motion.div
            key="game-over"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center p-8"
          >
            <p className="text-sm text-(--rmhbox-text-muted)">
              Game over — calculating results…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
