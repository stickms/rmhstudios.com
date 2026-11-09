import { m as motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { useGameStore, restoreStoredModel } from '@/lib/kowloon-knockout/store';
import { useLobbyInviteJoin, useLobbyLink } from '@/hooks/useLobbyLink';
import { networkClient, type ServerMessage, type LobbyListing } from '@/lib/kowloon-knockout/net/client';
import { CLASS_DISPLAY, ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { TEAM_COLORS } from '@/lib/kowloon-knockout/game/config';
import ModelPicker from '@/components/kowloon-knockout/ModelPicker';
import './kk-screens.css';

export default function MultiplayerLobby() {
    const { t } = useTranslation('c-kowloon-knockout');

    // The hub and client report fixed English phrases; show them in the player's language.
    const errorText = (message: string): string => {
        switch (message) {
            case 'Disconnected': return t('err-disconnected', { defaultValue: 'Connection lost. The match could not be resumed.' });
            case 'Host left the room': return t('err-host-left', { defaultValue: 'The host left, so the match has ended.' });
            case 'Room closed': return t('err-room-closed', { defaultValue: 'That match has already ended.' });
            case 'Room not found': return t('err-room-not-found', { defaultValue: 'Room not found.' });
            case 'Room is full': return t('err-room-full', { defaultValue: 'That room is full.' });
            case 'Match already in progress': return t('err-in-progress', { defaultValue: 'That match has already started.' });
            default: return message;
        }
    };
    const {
        selectedClass, setSelectedClass, selectedModel, setSelectedModel, resetMultiplayer, setPhase,
        lobbySeats, localSeat, isHost, mode, playerCount, roomCode, isPublic, mpError, setMpError,
    } = useGameStore();

    const [joining, setJoining] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [createPublic, setCreatePublic] = useState(true);
    const [lobbies, setLobbies] = useState<LobbyListing[]>([]);
    const [connecting, setConnecting] = useState(false);
    const [connected, setConnected] = useState(false);

    // An invite link lands here without passing character select: load the remembered model first
    // (effects run in order, so this precedes the invite-join effect below).
    useEffect(() => { restoreStoredModel(); }, []);

    const inRoom = lobbySeats.length > 0;
    const { copied: linkCopied, copyLink } = useLobbyLink({ code: roomCode });

    // Arrived on an invite link: join the moment the socket is up. Emitting into
    // a socket that has not connected yet is a join that quietly never happened.
    useLobbyInviteJoin(connected && !inRoom, (code) => {
        networkClient.joinRoom(code.toUpperCase(), useGameStore.getState().selectedClass, useGameStore.getState().selectedModel);
    });

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
            setConnected(networkClient.connected);
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
        networkClient.createRoom(mode, selectedClass, createPublic, selectedModel);
    };

    const handleJoinCode = async () => {
        if (joinCode.length !== 6) { setMpError(t('enter-room-code', { defaultValue: 'Enter a 6-character room code' })); return; }
        setMpError(null);
        if (!(await ensureConnected())) return;
        networkClient.joinRoom(joinCode, selectedClass, selectedModel);
    };

    const handleJoinListed = async (code: string) => {
        setMpError(null);
        if (!(await ensureConnected())) return;
        networkClient.joinRoom(code, selectedClass, selectedModel);
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
        if (inRoom) networkClient.setFighter(cls, myTeam, selectedModel);
    };

    const selected = CLASS_DISPLAY[selectedClass];

    return (
        <div className="kk-screen kk-lobby">
            <motion.div className="kk-head" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
                <span className="kk-ticket" aria-hidden="true">REEL 07 · FRAME 22A</span>
                <h1 className="kk-title kk-title--yellow">{t('versus-mode', { defaultValue: 'VERSUS MODE' })}</h1>
            </motion.div>

            <AnimatePresence mode="wait">
                {!inRoom ? (
                    // ── Browser: public lobbies + create + join-by-code ──
                    <motion.div key="browse" className="kk-lobby__col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                        <section className="kk-panel kk-panel--yellow" aria-label={t('open-lobbies', { defaultValue: 'OPEN LOBBIES' })}>
                            <h2 className="kk-panel-label">{t('open-lobbies', { defaultValue: 'OPEN LOBBIES' })}</h2>
                            <div className="kk-lobby-list">
                                {lobbies.length === 0 ? (
                                    <div className="lobby-status">
                                        {connecting ? t('connecting', { defaultValue: 'CONNECTING...' }) : t('no-lobbies', { defaultValue: 'NO OPEN LOBBIES — CREATE ONE!' })}
                                    </div>
                                ) : lobbies.map((l) => {
                                    const d = CLASS_DISPLAY[l.host];
                                    return (
                                        <button key={l.code} type="button" className="lobby-list-row" style={{ '--seat': d.color } as React.CSSProperties} onClick={() => handleJoinListed(l.code)}>
                                            <span className="kk-row-name">{d.name}</span>
                                            <span className="kk-row-meta">{l.mode === 'teams' ? 'TEAMS' : 'FFA'}</span>
                                            <span className="kk-row-count">{l.players}/{l.arenaSize}</span>
                                            <span className="lobby-list-join">{t('join', { defaultValue: 'JOIN' })}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {!joining ? (
                            <div className="lobby-buttons">
                                <button type="button" className="neon-button neon-button-fight" onClick={handleCreate}>
                                    {t('create-room', { defaultValue: 'CREATE ROOM' })}
                                </button>
                                <button type="button" className="neon-button neon-button-versus" onClick={() => setJoining(true)}>
                                    {t('join-by-code', { defaultValue: 'JOIN BY CODE' })}
                                </button>
                            </div>
                        ) : (
                            <div className="kk-join-row">
                                <input className="lobby-input" type="text" maxLength={6}
                                    aria-label={t('code-placeholder', { defaultValue: 'CODE' })}
                                    autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                                    placeholder={t('code-placeholder', { defaultValue: 'CODE' })}
                                    value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleJoinCode(); }} autoFocus />
                                <button type="button" className="neon-button neon-button-fight" onClick={handleJoinCode}>{t('join', { defaultValue: 'JOIN' })}</button>
                            </div>
                        )}

                        <label className="lobby-toggle">
                            <input type="checkbox" checked={createPublic} onChange={(e) => setCreatePublic(e.target.checked)} />
                            <span>{t('public-room', { defaultValue: 'PUBLIC ROOM (listed for anyone)' })}</span>
                        </label>
                    </motion.div>
                ) : (
                    // ── In a room ──
                    <motion.div key="room" className="kk-lobby__col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                        {roomCode && (
                            <div className="kk-room">
                                <div className="lobby-room-code">{roomCode}</div>
                                <button type="button" className="neon-button neon-button-controls"
                                    onClick={() => { if (roomCode) { navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>
                                    {copied ? t('copied', { defaultValue: 'COPIED!' }) : t('copy-code', { defaultValue: 'COPY CODE' })}
                                </button>
                                <button type="button" className="neon-button neon-button-controls" onClick={() => void copyLink()}>
                                    {linkCopied ? t('copied', { defaultValue: 'COPIED!' }) : t('copy-link', { defaultValue: 'COPY LINK' })}
                                </button>
                                <span className="lobby-visibility" style={{ color: isPublic ? '#2cff9a' : '#d0a3be' }}>
                                    {isPublic ? t('public', { defaultValue: 'PUBLIC' }) : t('private', { defaultValue: 'PRIVATE' })}
                                </span>
                            </div>
                        )}

                        <div className="lobby-seats">
                            {lobbySeats.map((s) => {
                                const d = CLASS_DISPLAY[s.className];
                                const teamColor = mode === 'teams' ? TEAM_COLORS[s.team] ?? d.color : d.color;
                                return (
                                    <div key={s.seat} className={`lobby-seat ${s.seat === localSeat ? 'lobby-seat-you' : ''}`} style={{ '--seat': teamColor } as React.CSSProperties}>
                                        <span className="kk-seat__tag">{s.human ? (s.seat === localSeat ? 'YOU' : `P${s.seat + 1}`) : 'CPU'}</span>
                                        <span className="kk-seat__class">{d.name}</span>
                                        {mode === 'teams' && <span className="kk-seat__team">TEAM {String.fromCharCode(65 + s.team)}</span>}
                                    </div>
                                );
                            })}
                        </div>

                        <section className="kk-panel kk-panel--violet" aria-label={t('your-fighter', { defaultValue: 'Your fighter' })}>
                            <div className="kk-fighter-pick">
                                <button type="button" className="carousel-arrow" aria-label={t('previous-fighter', { defaultValue: 'Previous fighter' })} onClick={() => changeFighter(-1)}>◀</button>
                                <span className="kk-fighter-pick__name" style={{ color: selected.accent, textShadow: `0 0 10px ${selected.color}` }}>{selected.name}</span>
                                <button type="button" className="carousel-arrow" aria-label={t('next-fighter', { defaultValue: 'Next fighter' })} onClick={() => changeFighter(1)}>▶</button>
                            </div>
                            <ModelPicker
                                value={selectedModel}
                                onChange={(id) => {
                                    setSelectedModel(id);
                                    const myTeam = lobbySeats.find((s) => s.seat === localSeat)?.team ?? localSeat;
                                    networkClient.setFighter(selectedClass, myTeam, id);
                                }}
                            />
                        </section>

                        {isHost ? (
                            <>
                                <section className="kk-panel kk-panel--cyan match-options" aria-label={t('match-options', { defaultValue: 'Match options' })}>
                                    <div className="option-row" role="group" aria-label={t('fighters', { defaultValue: 'FIGHTERS' })}>
                                        <span className="option-label" aria-hidden="true">{t('fighters', { defaultValue: 'FIGHTERS' })}</span>
                                        <div className="option-chips">
                                            {[2, 3, 4].map((n) => (
                                                <button key={n} type="button" aria-pressed={playerCount === n} className={`option-chip ${playerCount === n ? 'option-chip-active' : ''}`}
                                                    onClick={() => networkClient.setConfig({ arenaSize: n })}>{n}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="option-row" role="group" aria-label={t('mode', { defaultValue: 'MODE' })}>
                                        <span className="option-label" aria-hidden="true">{t('mode', { defaultValue: 'MODE' })}</span>
                                        <div className="option-chips">
                                            <button type="button" aria-pressed={mode === 'ffa'} className={`option-chip ${mode === 'ffa' ? 'option-chip-active' : ''}`} onClick={() => networkClient.setConfig({ mode: 'ffa' })}>{t('ffa', { defaultValue: 'FREE-FOR-ALL' })}</button>
                                            <button type="button" aria-pressed={mode === 'teams'} className={`option-chip ${mode === 'teams' ? 'option-chip-active' : ''}`} disabled={playerCount % 2 !== 0} onClick={() => networkClient.setConfig({ mode: 'teams' })}>{t('teams', { defaultValue: 'TEAMS' })}</button>
                                        </div>
                                    </div>
                                    <div className="option-row" role="group" aria-label={t('visibility', { defaultValue: 'VISIBILITY' })}>
                                        <span className="option-label" aria-hidden="true">{t('visibility', { defaultValue: 'VISIBILITY' })}</span>
                                        <div className="option-chips">
                                            <button type="button" aria-pressed={isPublic} className={`option-chip ${isPublic ? 'option-chip-active' : ''}`} onClick={() => networkClient.setConfig({ isPublic: true })}>{t('public', { defaultValue: 'PUBLIC' })}</button>
                                            <button type="button" aria-pressed={!isPublic} className={`option-chip ${!isPublic ? 'option-chip-active' : ''}`} onClick={() => networkClient.setConfig({ isPublic: false })}>{t('private', { defaultValue: 'PRIVATE' })}</button>
                                        </div>
                                    </div>
                                </section>
                                <button type="button" className="neon-button neon-button-fight fight-button-large" onClick={() => networkClient.start()}>
                                    {t('start-match', { defaultValue: 'START MATCH' })}
                                </button>
                            </>
                        ) : (
                            <div className="lobby-status" role="status">{t('waiting-host', { defaultValue: 'WAITING FOR HOST TO START...' })}</div>
                        )}

                        <button type="button" className="neon-button neon-button-back" onClick={handleLeaveRoom}>{t('leave', { defaultValue: 'LEAVE' })}</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {mpError && <div className="lobby-error" role="alert">{errorText(mpError)}</div>}

            {!inRoom && (
                <button type="button" className="neon-button neon-button-back" onClick={handleBack}>
                    {t('back', { defaultValue: 'BACK' })}
                </button>
            )}
        </div>
    );
}
