/**
 * UndercoverAgentGame — Phase router for the Undercover Agent minigame.
 *
 * A team-based word-association game inspired by Codenames. Two teams
 * (Red/Blue) compete to identify their agents on a 5×5 grid.
 * Spymasters give one-word clues, operatives click tiles.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   SETUP            → Team assignment + grid reveal
 *   CLUE             → ClueInput (spymaster) or waiting state (operatives)
 *   GUESS            → GridBoard with clickable tiles + ClueDisplay
 *   TURN_TRANSITION  → Turn transition overlay
 *   GAME_OVER        → Full board reveal + scoreboard
 *
 * Handles server actions:
 *   UA_SETUP, UA_KEY_CARD, UA_PHASE_CHANGE, UA_CLUE, UA_TILE_REVEALED,
 *   UA_GUESS_RESULT, UA_TURN_END, UA_TIMEOUT, UA_GAME_OVER,
 *   UA_ACTION_REJECTED, TIMER_TICK
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Eye, Shuffle } from 'lucide-react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import GridBoard from './GridBoard';
import ClueInput from './ClueInput';
import ClueDisplay from './ClueDisplay';
import TeamPanel from './TeamPanel';
import TurnIndicator from './TurnIndicator';
import GameLog from './GameLog';
import type { GameLogEntry } from './GameLog';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'TEAM_SETUP' | 'SETUP' | 'CLUE' | 'GUESS' | 'TURN_TRANSITION' | 'BOARD_REVEAL' | 'GAME_OVER';
type TileType = 'RED_AGENT' | 'BLUE_AGENT' | 'BYSTANDER' | 'ASSASSIN';
export type Team = 'red' | 'blue';
type Role = 'spymaster' | 'operative' | 'spectator';

export interface GridTileClient {
  position: number;
  word: string;
  type: TileType | null; // null for hidden tiles when operative
  state: 'HIDDEN' | 'REVEALED';
  revealedBy?: string;
}

export interface TeamInfo {
  teamId: Team;
  spymasterId: string;
  operativeIds: string[];
  agentsTotal: number;
  agentsRevealed: number;
  color: string;
}

export interface ActiveClue {
  word: string;
  number: number | 'unlimited';
  teamId: Team;
  guessesUsed: number;
}

/** Helper: emit a game input action with standard GameInputSchema shape */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface UndercoverAgentGameProps {
  playerId: string;
  playerName: string;
}

export default function UndercoverAgentGame({ playerId, playerName: _playerName }: UndercoverAgentGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('TEAM_SETUP');
  const [grid, setGrid] = useState<GridTileClient[]>([]);
  const [teams, setTeams] = useState<{ red: TeamInfo; blue: TeamInfo } | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team>('red');
  const [currentClue, setCurrentClue] = useState<ActiveClue | null>(null);
  const [guessesRemaining, setGuessesRemaining] = useState(0);
  const [turnNumber, setTurnNumber] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [winner, setWinner] = useState<Team | 'draw' | null>(null);
  const [winReason, setWinReason] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role>('operative');
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [turnEndReason, setTurnEndReason] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTeamValid, setIsTeamValid] = useState(false);
  const [highlightCounts, setHighlightCounts] = useState<Record<number, number>>({});

  // Host from lobby store — updated on HOST_TRANSFERRED automatically
  const storeHostId = useRMHboxStore((s) => s.lobby?.hostUserId ?? '');

  // Game log entries for the sidebar
  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
  const logIdRef = useRef(0);

  // Key card data — only populated for spymasters
  const keyCardRef = useRef<GridTileClient[]>([]);

  const players = useRMHboxStore((s) => s.lobby?.players);

  // Ref-based player name lookup for use inside handleGameAction without creating dependency
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);
  const lookupName = (userId: string) =>
    playersRef.current?.find((p) => p.userId === userId)?.userName ?? userId;

  /** Derive role and team from teams state */
  const deriveRole = useCallback(
    (t: { red: TeamInfo; blue: TeamInfo } | null): { role: Role; team: Team | null } => {
      if (!t) return { role: 'spectator', team: null };
      if (t.red.spymasterId === playerId) return { role: 'spymaster', team: 'red' };
      if (t.blue.spymasterId === playerId) return { role: 'spymaster', team: 'blue' };
      if (t.red.operativeIds.includes(playerId)) return { role: 'operative', team: 'red' };
      if (t.blue.operativeIds.includes(playerId)) return { role: 'operative', team: 'blue' };
      return { role: 'spectator', team: null };
    },
    [playerId],
  );

  /** Handle incremental GAME_ACTION events */
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;

      /** Helper to push a log entry */
      const pushLog = (entry: Omit<GameLogEntry, 'id'>) => {
        logIdRef.current += 1;
        setGameLog((prev) => [...prev, { ...entry, id: logIdRef.current }]);
      };

      switch (type) {
        case 'UA_TEAM_SETUP': {
          setPhase('TEAM_SETUP');
          const rawTeams = data.teams as { red: TeamInfo; blue: TeamInfo };
          setTeams(rawTeams);
          const { role, team } = deriveRole(rawTeams);
          setMyRole(role);
          setMyTeam(team);
          break;
        }
        case 'UA_TEAMS_UPDATED': {
          const rawTeams = data.teams as { red: TeamInfo; blue: TeamInfo };
          setTeams(rawTeams);
          setIsTeamValid(data.isValid as boolean);
          const { role, team } = deriveRole(rawTeams);
          setMyRole(role);
          setMyTeam(team);
          break;
        }
        case 'UA_SETUP': {
          setPhase('SETUP');
          setGameLog([]);
          // Note: logIdRef is NOT reset — monotonically increasing ensures unique keys
          const rawGrid = data.grid as { position: number; word: string }[];
          setGrid(rawGrid.map((g) => ({ ...g, type: null, state: 'HIDDEN' as const })));
          const rawTeams = data.teams as { red: TeamInfo; blue: TeamInfo };
          setTeams(rawTeams);
          setCurrentTeam(data.currentTeam as Team);
          const { role, team } = deriveRole(rawTeams);
          setMyRole(role);
          setMyTeam(team);
          break;
        }
        case 'UA_KEY_CARD': {
          // Private: only sent to spymasters
          const keyCard = data.keyCard as { position: number; word: string; type: TileType }[];
          keyCardRef.current = keyCard.map((k) => ({
            position: k.position,
            word: k.word,
            type: k.type,
            state: 'HIDDEN' as const,
          }));
          // Overlay key card types onto the grid for the spymaster
          setGrid((prev) =>
            prev.map((tile) => {
              const kc = keyCard.find((k) => k.position === tile.position);
              return kc ? { ...tile, type: kc.type } : tile;
            }),
          );
          break;
        }
        case 'UA_PHASE_CHANGE': {
          setPhase(data.phase as Phase);
          setCurrentTeam(data.currentTeam as Team);
          setTurnNumber(data.turnNumber as number);
          setTimeRemaining(data.timeout as number);
          setTurnEndReason(null);
          setErrorMsg(null);
          break;
        }
        case 'UA_CLUE': {
          const clueWord = data.word as string;
          const clueNum = data.number as number | 'unlimited';
          const clueTeam = data.teamId as Team;
          const clueGiver = data.spymasterId as string | undefined;
          setCurrentClue({
            word: clueWord,
            number: clueNum,
            teamId: clueTeam,
            guessesUsed: 0,
          });
          setGuessesRemaining(data.guessesRemaining as number);
          setTimeRemaining(data.timeout as number);
          // Transition to GUESS phase when clue is received
          setPhase('GUESS');
          const giverName = clueGiver ? lookupName(clueGiver) : '';
          pushLog({
            type: 'clue',
            team: clueTeam,
            text: `${giverName ? giverName + ': ' : ''}Clue: ${clueWord.toUpperCase()} ${clueNum === 'unlimited' ? '∞' : clueNum}`,
          });
          break;
        }
        case 'UA_TILE_REVEALED': {
          const pos = data.position as number;
          const tileType = data.tileType as TileType;
          const revealedBy = data.teamId as string;
          const guesserId = data.revealedBy as string | undefined;
          const revealedWord = data.word as string | undefined;
          let wordLabel = revealedWord ?? `tile #${pos}`;
          setGrid((prev) => {
            // Grab the word from grid state if not in payload
            if (!revealedWord) {
              const tile = prev.find((t) => t.position === pos);
              if (tile) wordLabel = tile.word;
            }
            return prev.map((t) =>
              t.position === pos ? { ...t, type: tileType, state: 'REVEALED' as const, revealedBy } : t,
            );
          });
          const logType: GameLogEntry['type'] =
            tileType === 'ASSASSIN'
              ? 'guess_assassin'
              : tileType === 'BYSTANDER'
                ? 'guess_bystander'
                : tileType === (revealedBy === 'red' ? 'RED_AGENT' : 'BLUE_AGENT')
                  ? 'guess_correct'
                  : 'guess_wrong';
          const typeLabel =
            tileType === 'ASSASSIN'
              ? 'Assassin!'
              : tileType === 'BYSTANDER'
                ? 'Bystander'
                : tileType === 'RED_AGENT'
                  ? 'Red Agent'
                  : 'Blue Agent';
          const guesserName = guesserId ? lookupName(guesserId) : '';
          pushLog({
            type: logType,
            team: revealedBy as Team,
            text: `${guesserName ? guesserName + ': ' : ''}${wordLabel.toUpperCase()} → ${typeLabel}`,
          });
          break;
        }
        case 'UA_GUESS_RESULT': {
          setGuessesRemaining(data.guessesRemaining as number);
          // Update team agents revealed count
          const teamAgentsRevealed = data.teamAgentsRevealed as number;
          const teamAgentsTotal = data.teamAgentsTotal as number;
          setTeams((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              [currentTeam]: { ...prev[currentTeam], agentsRevealed: teamAgentsRevealed, agentsTotal: teamAgentsTotal },
            };
          });
          break;
        }
        case 'UA_TURN_END': {
          const reason = data.reason as string;
          setTurnEndReason(reason);
          setPhase('TURN_TRANSITION');
          setCurrentClue(null);
          pushLog({
            type: 'turn_end',
            team: currentTeam,
            text: `Turn ended — ${reason.replace(/_/g, ' ')}`,
          });
          break;
        }
        case 'UA_TIMEOUT': {
          // Phase timed out — handled by subsequent UA_TURN_END or UA_PHASE_CHANGE
          break;
        }
        case 'UA_BOARD_REVEAL': {
          setPhase('BOARD_REVEAL');
          const revealWinner = data.winner as Team | 'draw';
          const revealReason = data.reason as string;
          setWinner(revealWinner);
          setWinReason(revealReason);
          // Reveal full grid
          const revealGrid = data.grid as GridTileClient[];
          if (revealGrid) setGrid(revealGrid);
          const revealTeams = data.teams as { red: TeamInfo; blue: TeamInfo };
          if (revealTeams) setTeams(revealTeams);
          pushLog({
            type: 'game_over',
            team: revealWinner === 'draw' ? currentTeam : revealWinner,
            text: `Game over — ${revealReason.replace(/_/g, ' ')}`,
          });
          break;
        }
        case 'UA_GAME_OVER': {
          setPhase('GAME_OVER');
          const gameWinner = data.winner as Team | 'draw';
          const gameReason = data.reason as string;
          setWinner(gameWinner);
          setWinReason(gameReason);
          break;
        }
        case 'UA_HIGHLIGHTS': {
          setHighlightCounts(data.counts as Record<number, number>);
          break;
        }
        case 'UA_ACTION_REJECTED': {
          setErrorMsg(data.reason as string);
          // Auto-clear error after 3 seconds
          globalThis.setTimeout(() => setErrorMsg(null), 3000);
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
          if (typeof remaining === 'number') setTimeRemaining(remaining);
          break;
        }
      }
    },
    [currentTeam, deriveRole],
  );

  /** Handle full state snapshot (reconnection / JIP) */
  const handleStateSnapshot = useCallback(
    (data: Record<string, unknown>) => {
      setPhase(data.phase as Phase);
      if (data.grid) setGrid(data.grid as GridTileClient[]);
      const rawTeams = data.teams as { red: TeamInfo; blue: TeamInfo };
      setTeams(rawTeams);
      setCurrentTeam(data.currentTeam as Team);
      setCurrentClue(data.currentClue as ActiveClue | null);
      setGuessesRemaining(data.guessesRemaining as number);
      setTurnNumber(data.turnNumber as number);
      setWinner(data.winner as Team | 'draw' | null);
      setWinReason(data.winReason as string | null);
      setMyRole(data.myRole as Role);
      setMyTeam(data.myTeam as Team | null);
      setTimeRemaining(data.timeRemaining as number ?? 0);
      if (typeof data.isTeamValid === 'boolean') setIsTeamValid(data.isTeamValid as boolean);
      setHighlightCounts(data.highlightCounts as Record<number, number> ?? {});
      // Derive role from teams
      const { role, team } = deriveRole(rawTeams);
      setMyRole(role);
      setMyTeam(team);
    },
    [deriveRole],
  );

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on(S2C.GAME_ACTION, handleGameAction);
    socket.on(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
      socket.off(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
    };
  }, [handleGameAction, handleStateSnapshot]);

  // Hydrate from the Zustand gameState snapshot on mount.
  // This fixes the race condition where the server broadcasts initial game state
  // before the lazy-loaded component has mounted and subscribed to socket events.
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (snapshot && Object.keys(snapshot).length > 0 && snapshot.phase) {
      handleStateSnapshot(snapshot as Record<string, unknown>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Action Handlers ────────────────────────────────────────────

  const handleGiveClue = useCallback((word: string, number: number | 'unlimited') => {
    emitGameInput('GIVE_CLUE', { word, number });
  }, []);

  const handleGuessTile = useCallback((position: number) => {
    emitGameInput('GUESS_TILE', { position });
  }, []);

  const handleEndTurn = useCallback(() => {
    emitGameInput('END_TURN', {});
  }, []);

  const handleHighlightTile = useCallback((position: number, highlighted: boolean) => {
    emitGameInput('HIGHLIGHT_TILE', { position, highlighted });
  }, []);

  const handleContinueBoardReveal = useCallback(() => {
    emitGameInput('CONTINUE_BOARD_REVEAL', {});
  }, []);

  // ─── Team Setup Actions ─────────────────────────────────────────

  const handleShuffleTeams = useCallback(() => {
    emitGameInput('SHUFFLE_TEAMS', {});
  }, []);

  const handleSwapPlayer = useCallback((targetUserId: string, toTeam: Team) => {
    emitGameInput('SWAP_PLAYER', { targetUserId, toTeam });
  }, []);

  const handleSetRole = useCallback((targetUserId: string, role: 'spymaster' | 'operative') => {
    emitGameInput('SET_ROLE', { targetUserId, role });
  }, []);

  const handleStartGame = useCallback(() => {
    emitGameInput('START_GAME', {});
  }, []);

  const isHost = playerId === storeHostId;

  // Only the current team's operatives can click tiles
  const canGuess = phase === 'GUESS' && myRole === 'operative' && myTeam === currentTeam;
  const isMyCluePhase = phase === 'CLUE' && myRole === 'spymaster' && myTeam === currentTeam;

  // Look up player names for display
  const getPlayerName = useCallback(
    (userId: string) => players?.find((p) => p.userId === userId)?.userName ?? userId,
    [players],
  );

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 text-(--rmhbox-text)">
      {/* Turn indicator — hidden during team setup */}
      {phase !== 'TEAM_SETUP' && (
        <TurnIndicator
          phase={phase}
          currentTeam={currentTeam}
          turnNumber={turnNumber}
          timeRemaining={timeRemaining}
          winner={winner}
          winReason={winReason}
        />
      )}

      {/* Error toast */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-lg bg-red-500/20 border border-red-500/40 px-4 py-2 text-center text-sm text-red-300"
          >
            {errorMsg === 'invalid_team_composition'
              ? 'Each team needs at least 1 spymaster and 1 operative'
              : errorMsg === 'not_host'
                ? 'Only the host can do that'
                : errorMsg.replace(/_/g, ' ')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── TEAM_SETUP Phase ─────────────────────────────── */}
      {phase === 'TEAM_SETUP' && teams && (
        <motion.div
          key="team-setup"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5"
        >
          <h2 className="text-xl font-bold">Team Assignment</h2>
          <p className="text-sm text-(--rmhbox-text-muted)">
            {isHost
              ? 'Arrange teams, then press Start when ready.'
              : 'Waiting for the host to start the game. Click your name to switch teams or roles.'}
          </p>

          {/* Two team columns */}
          <div className="grid w-full max-w-lg grid-cols-2 gap-4">
            {/* RED team */}
            <TeamSetupColumn
              team={teams.red}
              teamId="red"
              getPlayerName={getPlayerName}
              currentUserId={playerId}
              isHost={isHost}
              onSwap={handleSwapPlayer}
              onSetRole={handleSetRole}
            />
            {/* BLUE team */}
            <TeamSetupColumn
              team={teams.blue}
              teamId="blue"
              getPlayerName={getPlayerName}
              currentUserId={playerId}
              isHost={isHost}
              onSwap={handleSwapPlayer}
              onSetRole={handleSetRole}
            />
          </div>

          {/* Host controls */}
          {isHost && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleShuffleTeams}
                className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2 text-sm font-medium text-(--rmhbox-text) transition-colors hover:bg-(--rmhbox-accent)/10"
              >
                <Shuffle className="h-4 w-4 inline-block mr-1" />Shuffle
              </button>
              <button
                type="button"
                onClick={handleStartGame}
                disabled={!isTeamValid}
                className={`rounded-lg px-6 py-2 text-sm font-bold transition-colors ${
                  isTeamValid
                    ? 'bg-(--rmhbox-accent) text-white hover:brightness-110'
                    : 'cursor-not-allowed bg-(--rmhbox-surface) text-(--rmhbox-text-muted) opacity-50'
                }`}
              >
                Start Game
              </button>
            </div>
          )}

          {!isTeamValid && (
            <p className="text-xs text-yellow-400/80">
              Each team needs at least 1 spymaster + 1 operative (min 4 players)
            </p>
          )}
        </motion.div>
      )}

      {/* ─── Gameplay Phases ──────────────────────────────── */}
      {phase !== 'TEAM_SETUP' && (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Team panels (left sidebar on desktop) */}
          <aside className="flex gap-3 lg:w-48 lg:flex-col">
            {teams && (
              <>
                <TeamPanel
                  team={teams.red}
                  isActive={currentTeam === 'red'}
                  getPlayerName={getPlayerName}
                  currentUserId={playerId}
                />
                <TeamPanel
                  team={teams.blue}
                  isActive={currentTeam === 'blue'}
                  getPlayerName={getPlayerName}
                  currentUserId={playerId}
                />
              </>
            )}
          </aside>

          {/* Grid + interactions */}
          <div className="flex flex-1 flex-col items-center gap-4">
            <AnimatePresence mode="wait">
              {/* SETUP — waiting to start */}
              {phase === 'SETUP' && (
                <motion.div
                  key="setup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <h2 className="text-xl font-bold">Setting up the board…</h2>
                  <p className="text-sm text-(--rmhbox-text-muted)">
                    Your role: <span className="font-semibold capitalize text-(--rmhbox-accent)">{myRole}</span>
                    {myTeam && (
                      <>
                        {' '}on <span className={`font-semibold ${myTeam === 'red' ? 'text-red-400' : 'text-blue-400'}`}>{myTeam}</span> team
                      </>
                    )}
                  </p>
                </motion.div>
              )}

              {/* CLUE phase — spymaster gives clue or operatives wait */}
              {phase === 'CLUE' && (
                <motion.div
                  key="clue"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full"
                >
                  {isMyCluePhase && !currentClue ? (
                    <ClueInput
                      gridWords={grid.map((t) => t.word)}
                      onSubmit={handleGiveClue}
                      timeRemaining={timeRemaining}
                    />
                  ) : (
                    <ClueDisplay
                      clue={currentClue}
                      guessesRemaining={guessesRemaining}
                      isWaiting={!currentClue}
                      spymasterName={
                        teams
                          ? getPlayerName(teams[currentTeam].spymasterId)
                          : 'Spymaster'
                      }
                      teamId={currentTeam}
                      onEndTurn={undefined}
                    />
                  )}
                </motion.div>
              )}

              {/* GUESS phase — operatives click tiles */}
              {phase === 'GUESS' && (
                <motion.div
                  key="guess"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full"
                >
                  <ClueDisplay
                    clue={currentClue}
                    guessesRemaining={guessesRemaining}
                    isWaiting={false}
                    spymasterName={
                      teams ? getPlayerName(teams[currentTeam].spymasterId) : 'Spymaster'
                    }
                    teamId={currentTeam}
                    onEndTurn={myRole === 'operative' && myTeam === currentTeam ? handleEndTurn : undefined}
                  />
                </motion.div>
              )}

              {/* TURN_TRANSITION — brief overlay */}
              {phase === 'TURN_TRANSITION' && (
                <motion.div
                  key="transition"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  className="flex flex-col items-center gap-2 py-4"
                >
                  <h3 className="text-lg font-bold">Turn Over</h3>
                  {turnEndReason && (
                    <p className="text-sm text-(--rmhbox-text-muted) capitalize">
                      {turnEndReason.replace(/_/g, ' ')}
                    </p>
                  )}
                </motion.div>
              )}

              {/* BOARD_REVEAL — full board shown to everyone before leaderboard */}
              {phase === 'BOARD_REVEAL' && (
                <motion.div
                  key="board-reveal"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 py-4"
                >
                  <h2 className="text-2xl font-bold">Board Reveal</h2>
                  {winner && winner !== 'draw' && (
                    <p className={`text-lg font-semibold ${winner === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                      {winner.charAt(0).toUpperCase() + winner.slice(1)} Team Wins!
                    </p>
                  )}
                  {winner === 'draw' && <p className="text-lg font-semibold text-yellow-400">It&apos;s a Draw!</p>}
                  {winReason && (
                    <p className="text-sm text-(--rmhbox-text-muted) capitalize">
                      {winReason.replace(/_/g, ' ')}
                    </p>
                  )}
                  {isHost && (
                    <button
                      type="button"
                      onClick={handleContinueBoardReveal}
                      className="mt-2 rounded-lg bg-(--rmhbox-accent) px-6 py-2 text-sm font-bold text-white transition-colors hover:brightness-110"
                    >
                      Continue to Results
                    </button>
                  )}
                  {!isHost && (
                    <p className="text-xs text-(--rmhbox-text-muted) mt-1">Waiting for host to continue…</p>
                  )}
                </motion.div>
              )}

              {/* GAME_OVER — results */}
              {phase === 'GAME_OVER' && (
                <motion.div
                  key="game-over"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 py-4"
                >
                  <h2 className="text-2xl font-bold">Game Over!</h2>
                  {winner && winner !== 'draw' && (
                    <p className={`text-lg font-semibold ${winner === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                      {winner.charAt(0).toUpperCase() + winner.slice(1)} Team Wins!
                    </p>
                  )}
                  {winner === 'draw' && <p className="text-lg font-semibold text-yellow-400">It&apos;s a Draw!</p>}
                  {winReason && (
                    <p className="text-sm text-(--rmhbox-text-muted) capitalize">
                      {winReason.replace(/_/g, ' ')}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* The 5×5 grid is always visible */}
            <GridBoard
              grid={grid}
              canGuess={canGuess}
              isSpymaster={myRole === 'spymaster' || phase === 'BOARD_REVEAL'}
              highlightCounts={highlightCounts}
              onTileClick={handleGuessTile}
              onHighlightChange={handleHighlightTile}
            />
          </div>

          {/* Right sidebar: Game Log */}
          <aside className="flex flex-col gap-3 lg:w-52">
            {/* Game log (always visible during gameplay) */}
            {teams && (
              <GameLog
                redTeam={{ teamId: 'red', agentsRevealed: teams.red.agentsRevealed, agentsTotal: teams.red.agentsTotal }}
                blueTeam={{ teamId: 'blue', agentsRevealed: teams.blue.agentsRevealed, agentsTotal: teams.blue.agentsTotal }}
                logEntries={gameLog}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ─── Team Setup Column ─────────────────────────────────────────────

interface TeamSetupColumnProps {
  team: TeamInfo;
  teamId: Team;
  getPlayerName: (userId: string) => string;
  currentUserId: string;
  isHost: boolean;
  onSwap: (targetUserId: string, toTeam: Team) => void;
  onSetRole: (targetUserId: string, role: 'spymaster' | 'operative') => void;
}

function TeamSetupColumn({
  team,
  teamId,
  getPlayerName,
  currentUserId,
  isHost,
  onSwap,
  onSetRole,
}: TeamSetupColumnProps) {
  const isRed = teamId === 'red';
  const teamColor = isRed ? 'text-red-400' : 'text-blue-400';
  const borderColor = isRed ? 'border-red-500/40' : 'border-blue-500/40';
  const otherTeam: Team = isRed ? 'blue' : 'red';

  // Filter out empty member slots (e.g. spymasterId can be '' when all leave)
  const allMembers = [
    ...(team.spymasterId ? [{ userId: team.spymasterId, role: 'spymaster' as const }] : []),
    ...team.operativeIds.filter(Boolean).map((id) => ({ userId: id, role: 'operative' as const })),
  ];

  return (
    <div className={`rounded-xl border ${borderColor} bg-(--rmhbox-surface) p-3`}>
      <h3 className={`mb-3 text-center text-sm font-bold uppercase tracking-wider ${teamColor}`}>
        {teamId} team
      </h3>

      <div className="space-y-1.5">
        {allMembers.length === 0 && (
          <p className="text-center text-[10px] text-(--rmhbox-text-muted) italic py-2">No players</p>
        )}
        {allMembers.map(({ userId, role }) => {
          const isSelf = userId === currentUserId;
          const canInteract = isHost || isSelf;

          return (
            <div
              key={userId}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
                isSelf ? 'bg-(--rmhbox-accent)/10 font-bold' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`shrink-0 ${role === 'spymaster' ? teamColor : 'text-(--rmhbox-text-muted)'}`}>
                  {role === 'spymaster' ? <Shield className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </span>
                <span className="truncate">{getPlayerName(userId)}</span>
              </div>

              {canInteract && (
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {/* Toggle role — ↑ for promote to spymaster, ↓ for demote to operative */}
                  <button
                    type="button"
                    onClick={() => onSetRole(userId, role === 'spymaster' ? 'operative' : 'spymaster')}
                    title={role === 'spymaster' ? 'Make operative' : 'Make spymaster'}
                    className="rounded px-1.5 py-0.5 text-[10px] border border-(--rmhbox-border)/50 hover:bg-(--rmhbox-accent)/10 transition-colors"
                  >
                    {role === 'spymaster' ? '↓ Op' : '↑ Spy'}
                  </button>
                  {/* Swap to other team — ← for red (left column), → for blue (right column) */}
                  <button
                    type="button"
                    onClick={() => onSwap(userId, otherTeam)}
                    title={`Move to ${otherTeam} team`}
                    className={`rounded px-1.5 py-0.5 text-[10px] border border-(--rmhbox-border)/50 hover:bg-(--rmhbox-accent)/10 transition-colors ${
                      isRed ? 'text-blue-400' : 'text-red-400'
                    }`}
                  >
                    {isRed ? '→' : '←'} {otherTeam.charAt(0).toUpperCase() + otherTeam.slice(1)}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
