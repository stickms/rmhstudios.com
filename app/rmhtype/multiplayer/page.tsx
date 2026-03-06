/**
 * RMH Type Multiplayer Lobby
 *
 * Create rooms, join with code, or browse public rooms.
 */

import { useEffect, useState, useCallback } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { connectToRmhType, getSocket, disconnectFromRmhType, emit } from '@/lib/rmhtype/socket';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { C2S, S2C } from '@/lib/rmhtype/events';
import { toast } from '@/lib/rmhtype/toast-store';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import type { Difficulty, PassageLength, PublicRoomInfo } from '@/lib/rmhtype/types';
import { useRouter } from '@tanstack/react-router';

export default function RmhTypeMultiplayer() {
  const router = useRouter();
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);

  const [joinCode, setJoinCode] = useState('');
  const [roomDifficulty, setRoomDifficulty] = useState<Difficulty>('medium');
  const [roomLength, setRoomLength] = useState<PassageLength>('medium');
  const [roomRounds, setRoomRounds] = useState(3);
  const [publicRooms, setPublicRooms] = useState<PublicRoomInfo[]>([]);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await connectToRmhType();

        const existingRoom = useRmhTypeStore.getState().room;
        if (existingRoom && mounted) {
          router.navigate({ to: `/rmhtype/${existingRoom.roomCode}` });
          return;
        }

        socket.on(S2C.ROOM_STATE, (data: { roomCode: string }) => {
          if (mounted && data.roomCode) {
            router.navigate({ to: `/rmhtype/${data.roomCode}` });
          }
        });

        socket.on(S2C.ROOM_BROWSE_RESULT, (data: { rooms: PublicRoomInfo[] }) => {
          if (mounted) setPublicRooms(data.rooms ?? []);
        });

        emit(C2S.ROOM_BROWSE, {});
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : 'Connection failed');
      }
    }

    connect();

    const browseInterval = setInterval(() => {
      if (mounted) emit(C2S.ROOM_BROWSE, {});
    }, 10_000);

    return () => { mounted = false; clearInterval(browseInterval); };
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

  return (
    <div className="flex h-screen flex-col">
      <RmhTypeHeader backLabel="RMH Type" backHref="/rmhtype" />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-6">

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

              <div className="mt-6 p-4 rounded-lg bg-(--rmhtype-bg) border border-(--rmhtype-border)">
                <h3 className="text-sm font-semibold mb-2">How it works</h3>
                <ul className="text-xs space-y-1 text-(--rmhtype-text-muted)">
                  <li>1. Create a room or join with a code</li>
                  <li>2. Wait for players and ready up</li>
                  <li>3. Everyone types the same passage</li>
                  <li>4. Race to finish first with the best accuracy</li>
                  <li>5. Compete across multiple rounds</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Public Rooms */}
          <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="h-5 w-5 text-(--rmhtype-accent)" />
                Public Rooms
              </h2>
              <button
                onClick={() => emit(C2S.ROOM_BROWSE, {})}
                className="p-1.5 rounded-lg text-(--rmhtype-text-muted) hover:text-(--rmhtype-text) hover:bg-(--rmhtype-surface-hover) transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {publicRooms.length === 0 ? (
              <p className="text-sm text-(--rmhtype-text-muted) text-center py-4">
                No public rooms available. Create one!
              </p>
            ) : (
              <div className="space-y-2">
                {publicRooms.map((r) => (
                  <button
                    key={r.roomId}
                    onClick={() => emit(C2S.ROOM_JOIN, { roomCode: r.roomId })}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-(--rmhtype-bg) border border-(--rmhtype-border) hover:border-(--rmhtype-accent) transition-colors text-left"
                  >
                    <div>
                      <div className="font-medium text-sm">{r.hostUserName}&apos;s room</div>
                      <div className="text-xs text-(--rmhtype-text-muted) mt-0.5">
                        <span className="capitalize">{r.difficulty}</span>
                        {' · '}
                        <span className="capitalize">{r.passageLength}</span>
                        {' · '}
                        {r.rounds} {r.rounds === 1 ? 'round' : 'rounds'}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-(--rmhtype-text-muted)">
                      {r.playerCount}/{r.maxPlayers}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
