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
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import GridBoard from './GridBoard';
import SpymasterKey from './SpymasterKey';
import ClueInput from './ClueInput';
import ClueDisplay from './ClueDisplay';
import TeamPanel from './TeamPanel';
import TurnIndicator from './TurnIndicator';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'SETUP' | 'CLUE' | 'GUESS' | 'TURN_TRANSITION' | 'GAME_OVER';
type TileType = 'RED_AGENT' | 'BLUE_AGENT' | 'BYSTANDER' | 'ASSASSIN';
type Team = 'red' | 'blue';
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

  const [phase, setPhase] = useState<Phase>('SETUP');
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

  // Key card data — only populated for spymasters
  const keyCardRef = useRef<GridTileClient[]>([]);

  const players = useRMHboxStore((s) => s.lobby?.players);

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

      switch (type) {
        case 'UA_SETUP': {
          setPhase('SETUP');
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
          setCurrentClue({
            word: data.word as string,
            number: data.number as number | 'unlimited',
            teamId: data.teamId as Team,
            guessesUsed: 0,
          });
          setGuessesRemaining(data.guessesRemaining as number);
          setTimeRemaining(data.timeout as number);
          break;
        }
        case 'UA_TILE_REVEALED': {
          const pos = data.position as number;
          const tileType = data.tileType as TileType;
          const revealedBy = data.teamId as string;
          setGrid((prev) =>
            prev.map((t) =>
              t.position === pos ? { ...t, type: tileType, state: 'REVEALED' as const, revealedBy } : t,
            ),
          );
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
          setTurnEndReason(data.reason as string);
          setPhase('TURN_TRANSITION');
          setCurrentClue(null);
          break;
        }
        case 'UA_TIMEOUT': {
          // Phase timed out — handled by subsequent UA_TURN_END or UA_PHASE_CHANGE
          break;
        }
        case 'UA_GAME_OVER': {
          setPhase('GAME_OVER');
          setWinner(data.winner as Team | 'draw');
          setWinReason(data.reason as string);
          // Reveal full grid
          const fullGrid = data.grid as GridTileClient[];
          if (fullGrid) setGrid(fullGrid);
          const finalTeams = data.teams as { red: TeamInfo; blue: TeamInfo };
          if (finalTeams) setTeams(finalTeams);
          break;
        }
        case 'UA_ACTION_REJECTED': {
          setErrorMsg(data.reason as string);
          // Auto-clear error after 3 seconds
          globalThis.setTimeout(() => setErrorMsg(null), 3000);
          break;
        }
        case 'TIMER_TICK': {
          setTimeRemaining(data.timeRemaining as number);
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
      setGrid(data.grid as GridTileClient[]);
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
    },
    [],
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

  // Only the current team's operatives can click tiles
  const canGuess = phase === 'GUESS' && myRole === 'operative' && myTeam === currentTeam;
  const isMyCluePhase = phase === 'CLUE' && myRole === 'spymaster' && myTeam === currentTeam;

  // Look up player names for display
  const getPlayerName = useCallback(
    (userId: string) => players?.find((p) => p.userId === userId)?.userName ?? userId,
    [players],
  );

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 text-[var(--rmhbox-text)]">
      {/* Turn indicator */}
      <TurnIndicator
        phase={phase}
        currentTeam={currentTeam}
        turnNumber={turnNumber}
        timeRemaining={timeRemaining}
        winner={winner}
        winReason={winReason}
      />

      {/* Error toast */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-lg bg-red-500/20 border border-red-500/40 px-4 py-2 text-center text-sm text-red-300"
          >
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area */}
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
                <p className="text-sm text-[var(--rmhbox-text-muted)]">
                  Your role: <span className="font-semibold capitalize text-[var(--rmhbox-accent)]">{myRole}</span>
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
                {isMyCluePhase ? (
                  <ClueInput
                    gridWords={grid.map((t) => t.word)}
                    onSubmit={handleGiveClue}
                    timeRemaining={timeRemaining}
                  />
                ) : (
                  <ClueDisplay
                    clue={currentClue}
                    guessesRemaining={guessesRemaining}
                    isWaiting={true}
                    spymasterName={
                      teams
                        ? getPlayerName(teams[currentTeam].spymasterId)
                        : 'Spymaster'
                    }
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
                  <p className="text-sm text-[var(--rmhbox-text-muted)] capitalize">
                    {turnEndReason.replace(/_/g, ' ')}
                  </p>
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
                  <p className="text-sm text-[var(--rmhbox-text-muted)] capitalize">
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
            isSpymaster={myRole === 'spymaster'}
            onTileClick={handleGuessTile}
          />
        </div>

        {/* Spymaster key card (right sidebar, only for spymasters) */}
        {myRole === 'spymaster' && teams && (
          <aside className="hidden lg:block lg:w-48">
            <SpymasterKey
              grid={grid}
              teams={teams}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
