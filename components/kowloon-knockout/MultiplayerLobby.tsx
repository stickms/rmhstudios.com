'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { networkClient } from '@/lib/kowloon-knockout/network/client';
import { useState, useEffect, useRef } from 'react';
import type { ServerMessage } from '@/lib/kowloon-knockout/network/types';
import { CLASS_DISPLAY } from '@/lib/kowloon-knockout/game/fighters/stats';

type LobbyView = 'choice' | 'creating' | 'joining' | 'matched';

export default function MultiplayerLobby() {
    const {
        selectedClass, setOpponentClass, setPhase, setIsHost,
        setRoomCode, setConnectionStatus, roomCode, resetMultiplayer,
    } = useGameStore();

    const [view, setView] = useState<LobbyView>('choice');
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [matchInfo, setMatchInfo] = useState<{ hostClass: string; guestClass: string } | null>(null);
    const cleanupRef = useRef(false);

    useEffect(() => {
        return () => {
            cleanupRef.current = true;
        };
    }, []);

    const handleCreate = async () => {
        setError('');
        setView('creating');
        setConnectionStatus('connecting');

        try {
            await networkClient.connect();
        } catch {
            setError('Failed to connect to server');
            setView('choice');
            setConnectionStatus('disconnected');
            return;
        }

        const onRoomCreated = (msg: ServerMessage) => {
            if (msg.type === 'room_created') {
                setRoomCode(msg.code);
                setConnectionStatus('waiting');
            }
        };

        const onRoomJoined = (msg: ServerMessage) => {
            if (msg.type === 'room_joined') {
                setIsHost(msg.isHost);
                const oppClass = msg.isHost ? msg.guestClass : msg.hostClass;
                setOpponentClass(oppClass);
                setConnectionStatus('ready');
                setMatchInfo({ hostClass: msg.hostClass, guestClass: msg.guestClass });
                setView('matched');

                setTimeout(() => {
                    if (!cleanupRef.current) {
                        setConnectionStatus('playing');
                        setPhase('fight');
                    }
                }, 2000);
            }
        };

        const onError = (msg: ServerMessage) => {
            if (msg.type === 'error') {
                setError(msg.message);
            }
        };

        const onDisconnect = (msg: ServerMessage) => {
            if (msg.type === 'opponent_disconnected' && !cleanupRef.current) {
                setError('Connection lost');
                setView('choice');
                setConnectionStatus('disconnected');
            }
        };

        networkClient.on('room_created', onRoomCreated);
        networkClient.on('room_joined', onRoomJoined);
        networkClient.on('error', onError);
        networkClient.on('opponent_disconnected', onDisconnect);

        networkClient.createRoom(selectedClass);
    };

    const handleJoin = async () => {
        if (joinCode.length !== 6) {
            setError('Enter a 6-character room code');
            return;
        }

        setError('');
        setConnectionStatus('connecting');

        try {
            await networkClient.connect();
        } catch {
            setError('Failed to connect to server');
            setConnectionStatus('disconnected');
            return;
        }

        const onRoomJoined = (msg: ServerMessage) => {
            if (msg.type === 'room_joined') {
                setIsHost(msg.isHost);
                const oppClass = msg.isHost ? msg.guestClass : msg.hostClass;
                setOpponentClass(oppClass);
                setConnectionStatus('ready');
                setMatchInfo({ hostClass: msg.hostClass, guestClass: msg.guestClass });
                setView('matched');

                setTimeout(() => {
                    if (!cleanupRef.current) {
                        setConnectionStatus('playing');
                        setPhase('fight');
                    }
                }, 2000);
            }
        };

        const onError = (msg: ServerMessage) => {
            if (msg.type === 'error') {
                setError(msg.message);
                setConnectionStatus('disconnected');
            }
        };

        const onDisconnect = (msg: ServerMessage) => {
            if (msg.type === 'opponent_disconnected' && !cleanupRef.current) {
                setError('Connection lost');
                setView('choice');
                setConnectionStatus('disconnected');
            }
        };

        networkClient.on('room_joined', onRoomJoined);
        networkClient.on('error', onError);
        networkClient.on('opponent_disconnected', onDisconnect);

        networkClient.joinRoom(joinCode, selectedClass);
    };

    const handleBack = () => {
        networkClient.disconnect();
        networkClient.clearHandlers();
        resetMultiplayer();
        setPhase('select');
    };

    return (
        <div className="lobby-container">
            <motion.h1
                className="lobby-title"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                VERSUS MODE
            </motion.h1>

            {view === 'choice' && (
                <motion.div
                    className="lobby-buttons"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <motion.button
                        className="neon-button neon-button-fight"
                        onClick={handleCreate}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        CREATE ROOM
                    </motion.button>
                    <motion.button
                        className="neon-button neon-button-versus"
                        onClick={() => setView('joining')}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        JOIN ROOM
                    </motion.button>
                </motion.div>
            )}

            {view === 'creating' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
                >
                    {roomCode ? (
                        <>
                            <div className="lobby-room-code">{roomCode}</div>
                            <motion.button
                                className="neon-button neon-button-controls"
                                onClick={() => {
                                    navigator.clipboard.writeText(roomCode);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{ marginTop: '-4px' }}
                            >
                                {copied ? 'COPIED!' : 'COPY CODE'}
                            </motion.button>
                            <div className="lobby-status">SHARE THIS CODE WITH YOUR OPPONENT</div>
                            <div className="lobby-status">WAITING FOR OPPONENT...</div>
                        </>
                    ) : (
                        <div className="lobby-status">CREATING ROOM...</div>
                    )}
                </motion.div>
            )}

            {view === 'joining' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
                >
                    <input
                        className="lobby-input"
                        type="text"
                        maxLength={6}
                        placeholder="CODE"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                        autoFocus
                    />
                    <motion.button
                        className="neon-button neon-button-fight"
                        onClick={handleJoin}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        JOIN
                    </motion.button>
                </motion.div>
            )}

            {view === 'matched' && matchInfo && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
                >
                    <div className="lobby-match-info">
                        <span
                            className="lobby-match-player"
                            style={{ color: CLASS_DISPLAY[matchInfo.hostClass as keyof typeof CLASS_DISPLAY]?.color }}
                        >
                            {CLASS_DISPLAY[matchInfo.hostClass as keyof typeof CLASS_DISPLAY]?.name}
                        </span>
                        <span className="lobby-match-vs">VS</span>
                        <span
                            className="lobby-match-player"
                            style={{ color: CLASS_DISPLAY[matchInfo.guestClass as keyof typeof CLASS_DISPLAY]?.color }}
                        >
                            {CLASS_DISPLAY[matchInfo.guestClass as keyof typeof CLASS_DISPLAY]?.name}
                        </span>
                    </div>
                    <div className="lobby-status">GET READY...</div>
                </motion.div>
            )}

            {error && <div className="lobby-error">{error}</div>}

            {view !== 'matched' && (
                <motion.button
                    className="neon-button neon-button-back"
                    onClick={handleBack}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    BACK
                </motion.button>
            )}
        </div>
    );
}
