'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { networkClient, type ServerMessage, type LobbyListing } from '@/lib/kowloon-knockout/net/client';
import { CLASS_DISPLAY, ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { TEAM_COLORS } from '@/lib/kowloon-knockout/game/config';

export default function MultiplayerLobby() {
    const { t } = useTranslation('c-kowloon-knockout');
    const {
        selectedClass, setSelectedClass, resetMultiplayer, setPhase,
        lobbySeats, localSeat, isHost, mode, playerCount, roomCode, isPublic, mpError, setMpError,
    } = useGameStore();

    const [joining, setJoining] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [createPublic, setCreatePublic] = useState(true);
    const [lobbies, setLobbies] = useState<LobbyListing[]>([]);
    const [connecting, setConnecting] = useState(false);

    const inRoom = lobbySeats.length > 0;

    // Connect on mount and keep the public lobby list fresh while browsing.
    useEffect(() => {
        let alive = true;
        let timer: ReturnType<typeof setInterval> | null = null;

        const onList = (m: ServerMessage) => { if (m.type === 'lobby_list' && alive) setLobbies(m.lobbies); };
        networkClient.on('lobby_list', onList);

        (async () => {
            setConnecting(true);
            try { await networkClient.connect(); } catch { /* shown via button states */ }
            if (!alive) return;
            setConnecting(false);
            networkClient.listLobbies();
            timer = setInterval(() => {
                if (!useGameStore.getState().lobbySeats.length) networkClient.listLobbies();
            }, 3000);
        })();

        return () => {
            alive = false;
            if (timer) clearInterval(timer);
            networkClient.off('lobby_list', onList);
        };
    }, []);

    const ensureConnected = useCallback(async () => {
        if (networkClient.connected) return true;
        try { await networkClient.connect(); return true; }
        catch { setMpError(t('failed-to-connect', { defaultValue: 'Failed to connect to server' })); return false; }
    }, [setMpError, t]);

    const handleCreate = async () => {
        setMpError(null);
        if (!(await ensureConnected())) return;
        networkClient.createRoom(mode, selectedClass, createPublic);
    };

    const handleJoinCode = async () => {
        if (joinCode.length !== 6) { setMpError(t('enter-room-code', { defaultValue: 'Enter a 6-character room code' })); return; }
        setMpError(null);
        if (!(await ensureConnected())) return;
        networkClient.joinRoom(joinCode, selectedClass);
    };

    const handleJoinListed = async (code: string) => {
        setMpError(null);
        if (!(await ensureConnected())) return;
        networkClient.joinRoom(code, selectedClass);
    };

    const handleLeaveRoom = () => {
        networkClient.disconnect();
        resetMultiplayer();
        setPhase('select');
    };

    const handleBack = () => {
        networkClient.disconnect();
        resetMultiplayer();
        setPhase('select');
    };

    const changeFighter = (dir: -1 | 1) => {
        const idx = (ALL_FIGHTERS.indexOf(selectedClass) + dir + ALL_FIGHTERS.length) % ALL_FIGHTERS.length;
        const cls = ALL_FIGHTERS[idx];
        setSelectedClass(cls);
        const myTeam = lobbySeats.find((s) => s.seat === localSeat)?.team ?? localSeat;
        if (inRoom) networkClient.setFighter(cls, myTeam);
    };

    return (
        <div className="lobby-container">
            <motion.h1 className="lobby-title" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                {t('versus-mode', { defaultValue: 'VERSUS MODE' })}
            </motion.h1>

            <AnimatePresence mode="wait">
                {!inRoom ? (
                    // ── Browser: public lobbies + create + join-by-code ──
                    <motion.div key="browse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 560 }}>

                        <div className="lobby-list">
                            <div className="lobby-list-head">{t('open-lobbies', { defaultValue: 'OPEN LOBBIES' })}</div>
                            {lobbies.length === 0 ? (
                                <div className="lobby-status" style={{ padding: 16 }}>
                                    {connecting ? t('connecting', { defaultValue: 'CONNECTING...' }) : t('no-lobbies', { defaultValue: 'NO OPEN LOBBIES — CREATE ONE!' })}
                                </div>
                            ) : lobbies.map((l) => {
                                const d = CLASS_DISPLAY[l.host];
                                return (
                                    <button key={l.code} className="lobby-list-row" onClick={() => handleJoinListed(l.code)}>
                                        <span style={{ color: d.color, flex: 1, textAlign: 'left' }}>{d.name}</span>
                                        <span style={{ color: '#888' }}>{l.mode === 'teams' ? 'TEAMS' : 'FFA'}</span>
                                        <span style={{ color: '#ffcc00' }}>{l.players}/{l.arenaSize}</span>
                                        <span className="lobby-list-join">{t('join', { defaultValue: 'JOIN' })}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {!joining ? (
                            <div className="lobby-buttons">
                                <motion.button className="neon-button neon-button-fight" onClick={handleCreate} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                    {t('create-room', { defaultValue: 'CREATE ROOM' })}
                                </motion.button>
                                <motion.button className="neon-button neon-button-versus" onClick={() => setJoining(true)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                    {t('join-by-code', { defaultValue: 'JOIN BY CODE' })}
                                </motion.button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input className="lobby-input" type="text" maxLength={6}
                                    placeholder={t('code-placeholder', { defaultValue: 'CODE' })}
                                    value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleJoinCode(); }} autoFocus />
                                <button className="neon-button neon-button-fight" onClick={handleJoinCode}>{t('join', { defaultValue: 'JOIN' })}</button>
                            </div>
                        )}

                        <label className="lobby-toggle">
                            <input type="checkbox" checked={createPublic} onChange={(e) => setCreatePublic(e.target.checked)} />
                            <span>{t('public-room', { defaultValue: 'PUBLIC ROOM (listed for anyone)' })}</span>
                        </label>
                    </motion.div>
                ) : (
                    // ── In a room ──
                    <motion.div key="room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 560 }}>

                        {roomCode && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className="lobby-room-code">{roomCode}</div>
                                <button className="neon-button neon-button-controls"
                                    onClick={() => { if (roomCode) { navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>
                                    {copied ? t('copied', { defaultValue: 'COPIED!' }) : t('copy-code', { defaultValue: 'COPY CODE' })}
                                </button>
                                <span className="lobby-visibility" style={{ color: isPublic ? '#33ff99' : '#888' }}>
                                    {isPublic ? t('public', { defaultValue: 'PUBLIC' }) : t('private', { defaultValue: 'PRIVATE' })}
                                </span>
                            </div>
                        )}

                        <div className="lobby-seats">
                            {lobbySeats.map((s) => {
                                const d = CLASS_DISPLAY[s.className];
                                const teamColor = mode === 'teams' ? TEAM_COLORS[s.team] ?? d.color : d.color;
                                return (
                                    <div key={s.seat} className={`lobby-seat ${s.seat === localSeat ? 'lobby-seat-you' : ''}`} style={{ borderColor: teamColor, color: teamColor }}>
                                        <span style={{ color: teamColor, fontSize: 9 }}>{s.human ? (s.seat === localSeat ? 'YOU' : `P${s.seat + 1}`) : 'CPU'}</span>
                                        <span style={{ color: d.color, fontSize: 8, marginTop: 4 }}>{d.name}</span>
                                        {mode === 'teams' && <span style={{ color: teamColor, fontSize: 7, marginTop: 3 }}>TEAM {String.fromCharCode(65 + s.team)}</span>}
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button className="carousel-arrow" onClick={() => changeFighter(-1)}>◀</button>
                            <span style={{ color: CLASS_DISPLAY[selectedClass].color, fontSize: 9, minWidth: 140, textAlign: 'center' }}>{CLASS_DISPLAY[selectedClass].name}</span>
                            <button className="carousel-arrow" onClick={() => changeFighter(1)}>▶</button>
                        </div>

                        {isHost ? (
                            <>
                                <div className="option-row">
                                    <span className="option-label">{t('fighters', { defaultValue: 'FIGHTERS' })}</span>
                                    <div className="option-chips">
                                        {[2, 3, 4].map((n) => (
                                            <button key={n} className={`option-chip ${playerCount === n ? 'option-chip-active' : ''}`}
                                                onClick={() => networkClient.setConfig({ arenaSize: n })}>{n}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="option-row">
                                    <span className="option-label">{t('mode', { defaultValue: 'MODE' })}</span>
                                    <div className="option-chips">
                                        <button className={`option-chip ${mode === 'ffa' ? 'option-chip-active' : ''}`} onClick={() => networkClient.setConfig({ mode: 'ffa' })}>{t('ffa', { defaultValue: 'FREE-FOR-ALL' })}</button>
                                        <button className={`option-chip ${mode === 'teams' ? 'option-chip-active' : ''}`} disabled={playerCount % 2 !== 0} style={{ opacity: playerCount % 2 !== 0 ? 0.35 : 1 }} onClick={() => networkClient.setConfig({ mode: 'teams' })}>{t('teams', { defaultValue: 'TEAMS' })}</button>
                                    </div>
                                </div>
                                <div className="option-row">
                                    <span className="option-label">{t('visibility', { defaultValue: 'VISIBILITY' })}</span>
                                    <div className="option-chips">
                                        <button className={`option-chip ${isPublic ? 'option-chip-active' : ''}`} onClick={() => networkClient.setConfig({ isPublic: true })}>{t('public', { defaultValue: 'PUBLIC' })}</button>
                                        <button className={`option-chip ${!isPublic ? 'option-chip-active' : ''}`} onClick={() => networkClient.setConfig({ isPublic: false })}>{t('private', { defaultValue: 'PRIVATE' })}</button>
                                    </div>
                                </div>
                                <motion.button className="neon-button neon-button-fight fight-button-large" onClick={() => networkClient.start()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                    {t('start-match', { defaultValue: 'START MATCH' })}
                                </motion.button>
                            </>
                        ) : (
                            <div className="lobby-status">{t('waiting-host', { defaultValue: 'WAITING FOR HOST TO START...' })}</div>
                        )}

                        <button className="neon-button neon-button-back" onClick={handleLeaveRoom}>{t('leave', { defaultValue: 'LEAVE' })}</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {mpError && <div className="lobby-error">{mpError}</div>}

            {!inRoom && (
                <motion.button className="neon-button neon-button-back" onClick={handleBack} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    {t('back', { defaultValue: 'BACK' })}
                </motion.button>
            )}
        </div>
    );
}
