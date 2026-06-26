'use client';

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { networkClient, type ServerMessage } from '@/lib/kowloon-knockout/net/client';
import { CLASS_DISPLAY, ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { TEAM_COLORS } from '@/lib/kowloon-knockout/game/config';

type View = 'choice' | 'joining' | 'lobby';

export default function MultiplayerLobby() {
    const { t } = useTranslation('c-kowloon-knockout');
    const {
        selectedClass, setSelectedClass, setRoomCode, roomCode, setConnectionStatus,
        setLobby, lobbySeats, localSeat, isHost, mode, playerCount, resetMultiplayer,
        setPhase, startHostMatch, startGuestMatch,
    } = useGameStore();

    const [view, setView] = useState<View>('choice');
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const cleanupRef = useRef(false);

    useEffect(() => {
        cleanupRef.current = false;
        return () => { cleanupRef.current = true; };
    }, []);

    // Register lobby/match handlers once.
    useEffect(() => {
        const onRoomCreated = (m: ServerMessage) => {
            if (m.type === 'room_created') { setRoomCode(m.code); setConnectionStatus('waiting'); setView('lobby'); }
        };
        const onLobby = (m: ServerMessage) => {
            if (m.type === 'lobby_update' && !cleanupRef.current) {
                setLobby({ you: m.you, seats: m.seats, mode: m.mode, arenaSize: m.arenaSize, maxRounds: m.maxRounds, isHost: m.you === m.hostSeat });
                setView('lobby');
            }
        };
        const onStart = (m: ServerMessage) => {
            if (m.type !== 'match_start' || cleanupRef.current) return;
            if (m.you === 0) startHostMatch(m.seats, m.mode, m.maxRounds, m.aiDifficulty, m.you);
            else startGuestMatch(m.seats, m.mode, m.you);
        };
        const onError = (m: ServerMessage) => { if (m.type === 'error') setError(m.message); };

        networkClient.on('room_created', onRoomCreated);
        networkClient.on('lobby_update', onLobby);
        networkClient.on('match_start', onStart);
        networkClient.on('error', onError);
        return () => {
            networkClient.off('room_created', onRoomCreated);
            networkClient.off('lobby_update', onLobby);
            networkClient.off('match_start', onStart);
            networkClient.off('error', onError);
        };
    }, [setRoomCode, setConnectionStatus, setLobby, startHostMatch, startGuestMatch]);

    const handleCreate = async () => {
        setError('');
        setConnectionStatus('connecting');
        try { await networkClient.connect(); }
        catch { setError(t('failed-to-connect', { defaultValue: 'Failed to connect to server' })); setConnectionStatus('disconnected'); return; }
        networkClient.createRoom(mode, selectedClass);
    };

    const handleJoin = async () => {
        if (joinCode.length !== 6) { setError(t('enter-room-code', { defaultValue: 'Enter a 6-character room code' })); return; }
        setError('');
        setConnectionStatus('connecting');
        try { await networkClient.connect(); }
        catch { setError(t('failed-to-connect', { defaultValue: 'Failed to connect to server' })); setConnectionStatus('disconnected'); return; }
        networkClient.joinRoom(joinCode, selectedClass);
    };

    const handleBack = () => {
        networkClient.disconnect();
        networkClient.clearHandlers();
        resetMultiplayer();
        setPhase('select');
    };

    const changeFighter = (dir: -1 | 1) => {
        const idx = (ALL_FIGHTERS.indexOf(selectedClass) + dir + ALL_FIGHTERS.length) % ALL_FIGHTERS.length;
        const cls = ALL_FIGHTERS[idx];
        setSelectedClass(cls);
        const myTeam = lobbySeats.find((s) => s.seat === localSeat)?.team ?? localSeat;
        networkClient.setFighter(cls, myTeam);
    };

    return (
        <div className="lobby-container">
            <motion.h1 className="lobby-title" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                {t('versus-mode', { defaultValue: 'VERSUS MODE' })}
            </motion.h1>

            {view === 'choice' && (
                <motion.div className="lobby-buttons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                    <motion.button className="neon-button neon-button-fight" onClick={handleCreate} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        {t('create-room', { defaultValue: 'CREATE ROOM' })}
                    </motion.button>
                    <motion.button className="neon-button neon-button-versus" onClick={() => setView('joining')} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        {t('join-room', { defaultValue: 'JOIN ROOM' })}
                    </motion.button>
                </motion.div>
            )}

            {view === 'joining' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <input
                        className="lobby-input" type="text" maxLength={6}
                        placeholder={t('code-placeholder', { defaultValue: 'CODE' })}
                        value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }} autoFocus
                    />
                    <motion.button className="neon-button neon-button-fight" onClick={handleJoin} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        {t('join', { defaultValue: 'JOIN' })}
                    </motion.button>
                </motion.div>
            )}

            {view === 'lobby' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 560 }}>
                    {roomCode && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="lobby-room-code">{roomCode}</div>
                            <button
                                className="neon-button neon-button-controls"
                                onClick={() => { if (roomCode) { navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
                            >
                                {copied ? t('copied', { defaultValue: 'COPIED!' }) : t('copy-code', { defaultValue: 'COPY CODE' })}
                            </button>
                        </div>
                    )}

                    {/* Seat roster */}
                    <div className="lobby-seats">
                        {lobbySeats.map((s) => {
                            const d = CLASS_DISPLAY[s.className];
                            const teamColor = mode === 'teams' ? TEAM_COLORS[s.team] ?? d.color : d.color;
                            return (
                                <div key={s.seat} className={`lobby-seat ${s.seat === localSeat ? 'lobby-seat-you' : ''}`} style={{ borderColor: teamColor }}>
                                    <span style={{ color: teamColor, fontSize: 9 }}>{s.human ? (s.seat === localSeat ? 'YOU' : `P${s.seat + 1}`) : 'CPU'}</span>
                                    <span style={{ color: d.color, fontSize: 8, marginTop: 4 }}>{d.name}</span>
                                    {mode === 'teams' && <span style={{ color: teamColor, fontSize: 7, marginTop: 3 }}>TEAM {String.fromCharCode(65 + s.team)}</span>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Your fighter picker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="carousel-arrow" onClick={() => changeFighter(-1)}>◀</button>
                        <span style={{ color: CLASS_DISPLAY[selectedClass].color, fontSize: 9, minWidth: 140, textAlign: 'center' }}>{CLASS_DISPLAY[selectedClass].name}</span>
                        <button className="carousel-arrow" onClick={() => changeFighter(1)}>▶</button>
                    </div>

                    {/* Host controls */}
                    {isHost ? (
                        <>
                            <div className="option-row">
                                <span className="option-label">{t('fighters', { defaultValue: 'FIGHTERS' })}</span>
                                <div className="option-chips">
                                    {[2, 3, 4].map((n) => (
                                        <button key={n} className={`option-chip ${playerCount === n ? 'option-chip-active' : ''}`}
                                            onClick={() => networkClient.setConfig({ mode, arenaSize: n, maxRounds: 3 })}>{n}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="option-row">
                                <span className="option-label">{t('mode', { defaultValue: 'MODE' })}</span>
                                <div className="option-chips">
                                    <button className={`option-chip ${mode === 'ffa' ? 'option-chip-active' : ''}`} onClick={() => networkClient.setConfig({ mode: 'ffa', arenaSize: playerCount, maxRounds: 3 })}>{t('ffa', { defaultValue: 'FREE-FOR-ALL' })}</button>
                                    <button className={`option-chip ${mode === 'teams' ? 'option-chip-active' : ''}`} disabled={playerCount % 2 !== 0} style={{ opacity: playerCount % 2 !== 0 ? 0.35 : 1 }} onClick={() => networkClient.setConfig({ mode: 'teams', arenaSize: playerCount, maxRounds: 3 })}>{t('teams', { defaultValue: 'TEAMS' })}</button>
                                </div>
                            </div>
                            <motion.button className="neon-button neon-button-fight fight-button-large" onClick={() => networkClient.start()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                {t('start-match', { defaultValue: 'START MATCH' })}
                            </motion.button>
                        </>
                    ) : (
                        <div className="lobby-status">{t('waiting-host', { defaultValue: 'WAITING FOR HOST TO START...' })}</div>
                    )}
                </motion.div>
            )}

            {error && <div className="lobby-error">{error}</div>}

            <motion.button className="neon-button neon-button-back" onClick={handleBack} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                {t('back', { defaultValue: 'BACK' })}
            </motion.button>
        </div>
    );
}
