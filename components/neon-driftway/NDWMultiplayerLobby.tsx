'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Copy, Check, Crown, Users } from 'lucide-react';
import { NDWMultiplayerClient } from '@/lib/neon-driftway/multiplayer';
import { authClient } from '@/lib/auth-client';
import type { LevelId, NDWLobbyPlayer, NDWLobbyState } from '@/lib/neon-driftway/types';
import { LEVELS } from '@/lib/neon-driftway/constants';

interface NDWMultiplayerLobbyProps {
    onBack: () => void;
    onGameStart: (roomId: string, levelId: LevelId) => void;
}

export function NDWMultiplayerLobby({ onBack, onGameStart }: NDWMultiplayerLobbyProps) {
    const [phase, setPhase] = useState<'menu' | 'lobby'>('menu');
    const [roomId, setRoomId] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [lobby, setLobby] = useState<NDWLobbyState | null>(null);
    const [copied, setCopied] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState<LevelId>(1);
    const [countdown, setCountdown] = useState<number | null>(null);

    const clientRef = useRef<NDWMultiplayerClient | null>(null);
    const session = authClient.useSession();
    const playerName = session.data?.user?.name || 'Driver';

    useEffect(() => {
        const client = NDWMultiplayerClient.getInstance();
        clientRef.current = client;
        client.connect();

        const onLobbyState = (data: NDWLobbyState) => {
            setLobby(data);
        };

        const onCountdown = (data: { countdownSeconds: number; levelId: number }) => {
            setCountdown(data.countdownSeconds);
            let remaining = data.countdownSeconds;
            const timer = setInterval(() => {
                remaining--;
                setCountdown(remaining);
                if (remaining <= 0) {
                    clearInterval(timer);
                }
            }, 1000);
        };

        const onGameStarted = (data: { levelId: number }) => {
            const lid = data.levelId as LevelId;
            onGameStart(roomId || joinCode, lid);
        };

        client.on('ndw:lobbyState', onLobbyState);
        client.on('ndw:startCountdown', onCountdown);
        client.on('ndw:gameStarted', onGameStarted);

        return () => {
            client.off('ndw:lobbyState', onLobbyState);
            client.off('ndw:startCountdown', onCountdown);
            client.off('ndw:gameStarted', onGameStarted);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, joinCode]);

    const handleCreate = useCallback(() => {
        const id = `ndw-${Date.now().toString(36)}`;
        setRoomId(id);
        setPhase('lobby');
        clientRef.current?.joinLobby(id, playerName);
    }, [playerName]);

    const handleJoin = useCallback(() => {
        if (!joinCode.trim()) return;
        setRoomId(joinCode.trim());
        setPhase('lobby');
        clientRef.current?.joinLobby(joinCode.trim(), playerName);
    }, [joinCode, playerName]);

    const handleLeave = useCallback(() => {
        if (roomId) clientRef.current?.leaveLobby(roomId);
        setPhase('menu');
        setLobby(null);
        setCountdown(null);
        setRoomId('');
    }, [roomId]);

    const handleReady = useCallback(() => {
        if (roomId) clientRef.current?.toggleReady(roomId);
    }, [roomId]);

    const handleStart = useCallback(() => {
        if (roomId) clientRef.current?.startGame(roomId, selectedLevel);
    }, [roomId, selectedLevel]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [roomId]);

    const myId = clientRef.current?.getSocketId();
    const isHost = lobby?.players.some(p => p.id === myId && p.isHost) ?? false;

    // Countdown overlay
    if (countdown !== null && countdown > 0) {
        return (
            <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/80 backdrop-blur-sm">
                <div className="text-center space-y-4">
                    <p className="text-zinc-400 text-sm uppercase tracking-wider">Race starting in</p>
                    <div className="text-8xl font-black text-cyan-400 animate-pulse">{countdown}</div>
                </div>
            </div>
        );
    }

    // Multiplayer Menu
    if (phase === 'menu') {
        return (
            <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/70 backdrop-blur-sm">
                <div className="max-w-md w-full px-4 space-y-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>

                    <h2 className="text-3xl font-black text-white text-center tracking-tight">
                        <Users className="inline w-7 h-7 mr-2 text-cyan-400" />
                        MULTIPLAYER
                    </h2>

                    <div className="space-y-3">
                        <Button
                            onClick={handleCreate}
                            className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white font-bold py-3 text-lg"
                        >
                            Create Lobby
                        </Button>

                        <div className="text-center text-zinc-500 text-xs">— or —</div>

                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter lobby code..."
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
                            />
                            <Button
                                onClick={handleJoin}
                                disabled={!joinCode.trim()}
                                className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-6"
                            >
                                Join
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Lobby Screen
    return (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/70 backdrop-blur-sm">
            <div className="max-w-lg w-full px-4 space-y-4">
                <button
                    onClick={handleLeave}
                    className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Leave Lobby
                </button>

                <h2 className="text-2xl font-black text-white text-center tracking-tight">LOBBY</h2>

                {/* Room Code */}
                <div className="flex items-center justify-center gap-2 bg-zinc-900/80 border border-zinc-700 rounded-lg p-3">
                    <span className="text-zinc-400 text-xs">Code:</span>
                    <span className="text-cyan-400 font-mono font-bold text-sm">{roomId}</span>
                    <button onClick={handleCopy} className="text-zinc-400 hover:text-white transition-colors">
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>

                {/* Player List */}
                <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-4 space-y-2">
                    <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">
                        Players ({lobby?.players.length ?? 0}/6)
                    </div>
                    {lobby?.players.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2 rounded bg-zinc-800/50">
                            <div className="flex items-center gap-2">
                                {p.isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                                <span className={`font-bold text-sm ${p.id === myId ? 'text-cyan-400' : 'text-white'}`}>
                                    {p.name} {p.id === myId ? '(You)' : ''}
                                </span>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${p.ready ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'
                                }`}>
                                {p.ready ? 'READY' : 'NOT READY'}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Level Select (host only) */}
                {isHost && (
                    <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-4">
                        <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Select Level</div>
                        <div className="flex gap-2">
                            {([1, 2, 3] as LevelId[]).map(id => (
                                <button
                                    key={id}
                                    onClick={() => setSelectedLevel(id)}
                                    className={`flex-1 p-2 rounded text-sm font-bold transition-all ${selectedLevel === id
                                            ? 'bg-cyan-500 text-black'
                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                        }`}
                                >
                                    L{id}: {LEVELS[id].name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                    <Button
                        onClick={handleReady}
                        variant="outline"
                        className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800 font-bold"
                    >
                        Toggle Ready
                    </Button>
                    {isHost && (
                        <Button
                            onClick={handleStart}
                            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold"
                        >
                            Start Race
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
