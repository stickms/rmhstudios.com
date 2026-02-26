/**
 * RMH Type Landing Page
 *
 * Create rooms, join with code, or start a solo typing session.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, Users, User, Trophy } from 'lucide-react';
import { connectToRmhType, getSocket, disconnectFromRmhType, emit } from '@/lib/rmhtype/socket';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { C2S, S2C } from '@/lib/rmhtype/events';
import { toast } from '@/lib/rmhtype/toast-store';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import type { Difficulty, PassageLength } from '@/lib/rmhtype/types';

export default function RmhTypeLanding() {
  const router = useRouter();
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);
  const settings = useRmhTypeStore((s) => s.settings);
  const updateSettings = useRmhTypeStore((s) => s.updateSettings);
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'solo' | 'multiplayer'>('menu');

  // Leaderboard
  interface LeaderboardEntry {
    rank: number;
    userId: string;
    userName: string;
    avatarUrl: string | null;
    bestWpm: number;
    avgWpm: number;
    bestAccuracy: number;
    avgAccuracy: number;
    totalGamesPlayed: number;
    totalWins: number;
    bestStreak: number;
  }
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  // Solo settings (local)
  const [soloDifficulty, setSoloDifficulty] = useState<Difficulty>(settings.soloDifficulty);
  const [soloLength, setSoloLength] = useState<PassageLength>(settings.soloPassageLength);

  // Multiplayer settings
  const [roomDifficulty, setRoomDifficulty] = useState<Difficulty>('medium');
  const [roomLength, setRoomLength] = useState<PassageLength>('medium');
  const [roomRounds, setRoomRounds] = useState(3);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await connectToRmhType();

        const existingRoom = useRmhTypeStore.getState().room;
        if (existingRoom && mounted) {
          router.push(`/rmhtype/${existingRoom.roomCode}`);
          return;
        }

        socket.on(S2C.ROOM_STATE, (data: { roomCode: string }) => {
          if (mounted && data.roomCode) {
            router.push(`/rmhtype/${data.roomCode}`);
          }
        });

        socket.on(S2C.LEADERBOARD_DATA, (data: { leaderboard: LeaderboardEntry[] }) => {
          if (mounted) {
            setLeaderboard(data.leaderboard);
            setLeaderboardLoading(false);
          }
        });

        // Fetch leaderboard once connected (socket may not be connected yet)
        if (socket.connected) {
          emit(C2S.LEADERBOARD_FETCH, { limit: 20 });
        } else {
          socket.once('connect', () => {
            if (mounted) emit(C2S.LEADERBOARD_FETCH, { limit: 20 });
          });
        }
      } catch (err) {
        if (mounted) {
          toast.error(err instanceof Error ? err.message : 'Connection failed');
          setLeaderboardLoading(false);
        }
      }
    }

    connect();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    return () => {
      const socket = getSocket();
      if (socket && !socket.connected && !socket.active) {
        disconnectFromRmhType();
      }
    };
  }, []);

  const handleCreateRoom = useCallback(() => {
    const sent = emit(C2S.ROOM_CREATE, {
      settings: { difficulty: roomDifficulty, passageLength: roomLength, rounds: roomRounds },
    });
    if (!sent) {
      toast.error('Not connected to server. Try refreshing the page.');
    }
  }, [roomDifficulty, roomLength, roomRounds]);

  const handleJoinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      toast.warning('Room code must be 6 characters');
      return;
    }
    if (!emit(C2S.ROOM_JOIN, { roomCode: code })) {
      toast.error('Not connected to server. Try refreshing the page.');
    }
  }, [joinCode]);

  const handleSoloStart = useCallback(() => {
    updateSettings({ soloDifficulty, soloPassageLength: soloLength });
    useRmhTypeStore.getState().clearSolo();
    router.push('/rmhtype/solo');
  }, [soloDifficulty, soloLength, updateSettings, router]);

  return (
    <div className="flex h-screen flex-col">
      <RmhTypeHeader backLabel="Games" backHref="/games" />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-8">

          {mode === 'menu' && (
            <>
              {/* Mode Selection */}
              <div className="text-center py-8">
                <div className="inline-flex items-center gap-2 mb-4">
                  <Keyboard className="h-8 w-8 text-(--rmhtype-accent)" />
                  <h2 className="text-3xl font-bold">RMH Type</h2>
                </div>
                <p className="text-(--rmhtype-text-muted) max-w-md mx-auto">
                  Test your typing speed solo or race against friends in real-time.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <button
                  onClick={() => setMode('solo')}
                  className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-left transition-all hover:border-(--rmhtype-accent) hover:bg-(--rmhtype-surface-hover)"
                >
                  <User className="h-8 w-8 mb-4 text-(--rmhtype-accent)" />
                  <h3 className="text-xl font-semibold mb-2">Solo Practice</h3>
                  <p className="text-sm text-(--rmhtype-text-muted)">
                    Practice typing at your own pace. Track your WPM and accuracy, and compete on the leaderboard.
                  </p>
                </button>

                <button
                  onClick={() => setMode('multiplayer')}
                  className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-left transition-all hover:border-(--rmhtype-accent) hover:bg-(--rmhtype-surface-hover)"
                >
                  <Users className="h-8 w-8 mb-4 text-(--rmhtype-accent)" />
                  <h3 className="text-xl font-semibold mb-2">Multiplayer Race</h3>
                  <p className="text-sm text-(--rmhtype-text-muted)">
                    Create a room or join a friend. Race on the same passage and see who types fastest.
                  </p>
                </button>
              </div>

              {/* Leaderboard */}
              <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-(--rmhtype-accent)" />
                  Leaderboard
                </h3>

                {leaderboardLoading ? (
                  <p className="text-sm text-(--rmhtype-text-muted) text-center py-4">Loading...</p>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm text-(--rmhtype-text-muted) text-center py-4">No scores yet. Be the first!</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-(--rmhtype-text-muted) border-b border-(--rmhtype-border)">
                          <th className="text-left py-2 pr-3 font-medium">#</th>
                          <th className="text-left py-2 pr-3 font-medium">Player</th>
                          <th className="text-right py-2 pr-3 font-medium">Best WPM</th>
                          <th className="text-right py-2 pr-3 font-medium">Avg WPM</th>
                          <th className="text-right py-2 pr-3 font-medium">Accuracy</th>
                          <th className="text-right py-2 font-medium">Games</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((entry) => (
                          <tr key={entry.userId} className="border-b border-(--rmhtype-border)/50 last:border-b-0">
                            <td className="py-2.5 pr-3 font-mono text-(--rmhtype-text-muted)">
                              {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                            </td>
                            <td className="py-2.5 pr-3 flex items-center gap-2">
                              {entry.avatarUrl ? (
                                <img src={entry.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-(--rmhtype-accent)/20" />
                              )}
                              <span className="truncate max-w-35">{entry.userName}</span>
                            </td>
                            <td className="py-2.5 pr-3 text-right font-mono font-semibold text-(--rmhtype-accent)">
                              {entry.bestWpm.toFixed(2)}
                            </td>
                            <td className="py-2.5 pr-3 text-right font-mono text-(--rmhtype-text-muted)">
                              {entry.avgWpm.toFixed(2)}
                            </td>
                            <td className="py-2.5 pr-3 text-right font-mono text-(--rmhtype-text-muted)">
                              {entry.bestAccuracy.toFixed(2)}%
                            </td>
                            <td className="py-2.5 text-right font-mono text-(--rmhtype-text-muted)">
                              {entry.totalGamesPlayed}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {mode === 'solo' && (
            <>
              <button onClick={() => setMode('menu')} className="text-sm text-(--rmhtype-text-muted) hover:text-(--rmhtype-text)">
                &larr; Back
              </button>

              <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6 max-w-lg mx-auto">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <User className="h-5 w-5 text-(--rmhtype-accent)" />
                  Solo Practice
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-(--rmhtype-text-muted)">Difficulty</label>
                    <div className="flex gap-2">
                      {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                        <button
                          key={d}
                          onClick={() => setSoloDifficulty(d)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                            soloDifficulty === d
                              ? 'bg-(--rmhtype-accent) text-white'
                              : 'bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:bg-(--rmhtype-surface-hover)'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-(--rmhtype-text-muted)">Passage Length</label>
                    <div className="flex gap-2">
                      {(['short', 'medium', 'long'] as PassageLength[]).map((l) => (
                        <button
                          key={l}
                          onClick={() => setSoloLength(l)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                            soloLength === l
                              ? 'bg-(--rmhtype-accent) text-white'
                              : 'bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:bg-(--rmhtype-surface-hover)'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleSoloStart}
                    disabled={connectionStatus !== 'connected'}
                    className="w-full py-3 mt-4 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtype-accent) hover:bg-(--rmhtype-accent-hover)"
                  >
                    Start Typing
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === 'multiplayer' && (
            <>
              <button onClick={() => setMode('menu')} className="text-sm text-(--rmhtype-text-muted) hover:text-(--rmhtype-text)">
                &larr; Back
              </button>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Create Room */}
                <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
                  <h2 className="text-xl font-semibold mb-4">Create Room</h2>

                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-(--rmhtype-text-muted)">Difficulty</label>
                      <div className="flex gap-1">
                        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                          <button
                            key={d}
                            onClick={() => setRoomDifficulty(d)}
                            className={`flex-1 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                              roomDifficulty === d
                                ? 'bg-(--rmhtype-accent) text-white'
                                : 'bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:bg-(--rmhtype-surface-hover)'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-(--rmhtype-text-muted)">Length</label>
                      <div className="flex gap-1">
                        {(['short', 'medium', 'long'] as PassageLength[]).map((l) => (
                          <button
                            key={l}
                            onClick={() => setRoomLength(l)}
                            className={`flex-1 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                              roomLength === l
                                ? 'bg-(--rmhtype-accent) text-white'
                                : 'bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:bg-(--rmhtype-surface-hover)'
                            }`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-(--rmhtype-text-muted)">Rounds: {roomRounds}</label>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={roomRounds}
                        onChange={(e) => setRoomRounds(Number(e.target.value))}
                        className="w-full accent-(--rmhtype-accent)"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateRoom}
                    disabled={connectionStatus !== 'connected'}
                    className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtype-accent) hover:bg-(--rmhtype-accent-hover)"
                  >
                    Create Room
                  </button>
                </div>

                {/* Join Room */}
                <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
                  <h2 className="text-xl font-semibold mb-4">Join Room</h2>
                  <p className="text-sm mb-4 text-(--rmhtype-text-muted)">
                    Enter a 6-character room code to join a friend.
                  </p>
                  <form onSubmit={(e) => { e.preventDefault(); handleJoinRoom(); }} className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ABCDEF"
                      className="w-10 min-w-0 flex-1 px-4 py-3 rounded-lg font-mono text-lg uppercase tracking-widest text-center border border-(--rmhtype-border) bg-(--rmhtype-bg) text-(--rmhtype-text) placeholder:text-(--rmhtype-text-dim) outline-none focus:ring-1 focus:ring-(--rmhtype-accent)"
                    />
                    <button
                      type="submit"
                      disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                      className="px-6 py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtype-accent) hover:bg-(--rmhtype-accent-hover)"
                    >
                      Join
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
