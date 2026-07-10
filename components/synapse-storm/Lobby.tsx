'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../lib/synapse-storm/MultiplayerProvider';
import { Copy, Check, Crown, Circle, CheckCircle } from 'lucide-react';

interface LobbyProps {
    onLeave: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onLeave }) => {
    const {
        lobbyState, matchState, countdown, error, userId,
        toggleReady, startMatch, leaveLobby, getServerTime,
    } = useMultiplayer();
    const { t } = useTranslation("c-synapse-storm");
    const [copied, setCopied] = useState(false);

    if (!lobbyState) return null;

    const isHost = lobbyState.hostUserId === userId;
    const myPlayer = lobbyState.players.find(p => p.userId === userId);
    const playerCount = lobbyState.players.length;
    const allReady = lobbyState.players.every(p => p.isReady || p.userId === lobbyState.hostUserId);
    const canStart = isHost && playerCount >= 1 && (playerCount === 1 || allReady);

    const countdownSeconds = countdown ? Math.max(0, Math.ceil((countdown - getServerTime()) / 1000)) : null;

    const handleCopy = () => {
        navigator.clipboard.writeText(lobbyState.code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleLeave = () => {
        leaveLobby();
        onLeave();
    };

    return (
        <div className="ss-lobby">
            <div className="menu-bg-effect" />
            <div className="ss-lobby-content">
                <h2 className="ss-mp-title">{t("neural-lobby", { defaultValue: "NEURAL LOBBY" })}</h2>

                <div className="ss-lobby-code-section">
                    <span className="ss-lobby-code-label">{t("lobby-code", { defaultValue: "LOBBY CODE" })}</span>
                    <div className="ss-lobby-code-row">
                        <span className="ss-lobby-code">{lobbyState.code}</span>
                        <button className="ss-lobby-copy-btn" onClick={handleCopy} title={t("copy-code", { defaultValue: "Copy code" })}>
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                    </div>
                </div>

                <div className="ss-lobby-players">
                    <h3 className="ss-lobby-players-title">{t("neural-operatives", { defaultValue: "NEURAL OPERATIVES ({{count}}/{{max}})", count: playerCount, max: MAX_PLAYERS })}</h3>
                    <div className="ss-lobby-player-list">
                        {lobbyState.players.map((player) => (
                            <div
                                key={player.userId}
                                className={`ss-lobby-player ${player.userId === userId ? 'ss-lobby-player-self' : ''}`}
                            >
                                <div className="ss-lobby-player-info">
                                    {player.isHost && <Crown size={14} className="ss-lobby-host-icon" />}
                                    <span className="ss-lobby-player-name">{player.displayName}</span>
                                    {player.userId === userId && <span className="ss-lobby-you-badge">{t("you-badge", { defaultValue: "YOU" })}</span>}
                                </div>
                                <div className="ss-lobby-player-status">
                                    {player.isHost ? (
                                        <span className="ss-lobby-status-host">{t("host-status", { defaultValue: "HOST" })}</span>
                                    ) : player.isReady ? (
                                        <span className="ss-lobby-status-ready"><CheckCircle size={14} /> {t("ready-status", { defaultValue: "READY" })}</span>
                                    ) : (
                                        <span className="ss-lobby-status-waiting"><Circle size={14} /> {t("waiting-status", { defaultValue: "WAITING" })}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {countdownSeconds !== null && countdownSeconds > 0 && (
                    <div className="ss-lobby-countdown">
                        <span className="ss-lobby-countdown-num">{countdownSeconds}</span>
                        <span className="ss-lobby-countdown-label">{t("initializing-storm", { defaultValue: "INITIALIZING STORM" })}</span>
                    </div>
                )}

                {error && <div className="ss-mp-error">{error}</div>}

                <div className="ss-lobby-actions">
                    {!isHost && (
                        <button
                            className={`ss-mp-btn ss-mp-btn-wide ${myPlayer?.isReady ? 'ss-mp-btn-ready' : 'ss-mp-btn-primary'}`}
                            onClick={toggleReady}
                        >
                            {myPlayer?.isReady ? t("unready", { defaultValue: "UNREADY" }) : t("ready-up", { defaultValue: "READY UP" })}
                        </button>
                    )}
                    {isHost && (
                        <button
                            className="ss-mp-btn ss-mp-btn-primary ss-mp-btn-wide"
                            onClick={startMatch}
                            disabled={!canStart}
                        >
                            {canStart ? t("start-match", { defaultValue: "START MATCH" }) : t("waiting-for-players", { defaultValue: "WAITING FOR PLAYERS{{notReady}}", notReady: !allReady ? ' (NOT READY)' : '' })}
                        </button>
                    )}
                    <button className="ss-mp-btn ss-mp-btn-ghost" onClick={handleLeave}>
                        {t("leave-lobby", { defaultValue: "LEAVE LOBBY" })}
                    </button>
                </div>
            </div>
        </div>
    );
};

const MAX_PLAYERS = 8;
