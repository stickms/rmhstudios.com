'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../lib/synapse-storm/MultiplayerProvider';

interface MultiplayerMenuProps {
    onBack: () => void;
}

export const MultiplayerMenu: React.FC<MultiplayerMenuProps> = ({ onBack }) => {
    const {
        connectionStatus, displayName, setDisplayName,
        connect, createLobby, joinLobby, error,
    } = useMultiplayer();

    const { t } = useTranslation("c-synapse-storm");
    const [joinCode, setJoinCode] = useState('');
    const [step, setStep] = useState<'name' | 'choice'>('name');

    const handleSetName = () => {
        if (!displayName.trim()) return;
        connect();
        setStep('choice');
    };

    const handleCreate = () => {
        createLobby();
    };

    const handleJoin = () => {
        if (!joinCode.trim()) return;
        joinLobby(joinCode.trim().toUpperCase());
    };

    if (step === 'name') {
        return (
            <div className="ss-mp-menu">
                <div className="menu-bg-effect" />
                <div className="ss-mp-menu-content">
                    <h2 className="ss-mp-title">{t("multiplayer", { defaultValue: "MULTIPLAYER" })}</h2>
                    <p className="ss-mp-subtitle">{t("enter-callsign", { defaultValue: "Enter your callsign for the neural network." })}</p>

                    <div className="ss-mp-input-group">
                        <label className="ss-mp-label">{t("display-name", { defaultValue: "DISPLAY NAME" })}</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
                            placeholder={t("enter-name-placeholder", { defaultValue: "Enter name..." })}
                            className="ss-mp-input"
                            maxLength={20}
                            onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
                            autoFocus
                        />
                    </div>

                    <div className="ss-mp-btn-row">
                        <button className="ss-mp-btn ss-mp-btn-primary" onClick={handleSetName} disabled={!displayName.trim()}>
                            {t("connect", { defaultValue: "CONNECT" })}
                        </button>
                        <button className="ss-mp-btn ss-mp-btn-ghost" onClick={onBack}>
                            {t("back", { defaultValue: "BACK" })}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ss-mp-menu">
            <div className="menu-bg-effect" />
            <div className="ss-mp-menu-content">
                <h2 className="ss-mp-title">{t("multiplayer", { defaultValue: "MULTIPLAYER" })}</h2>
                <p className="ss-mp-subtitle">
                    {connectionStatus === 'connecting' ? t("establishing-link", { defaultValue: "Establishing neural link..." }) :
                     connectionStatus === 'connected' ? t("connected-as", { defaultValue: "Connected as {{name}}", name: displayName }) :
                     connectionStatus === 'reconnecting' ? t("reconnecting", { defaultValue: "Reconnecting..." }) :
                     t("disconnected", { defaultValue: "Disconnected" })}
                </p>

                {connectionStatus === 'connecting' && (
                    <div className="ss-mp-loading">
                        <span className="loading-pulse">🌩️</span>
                    </div>
                )}

                {connectionStatus === 'connected' && (
                    <>
                        <button className="ss-mp-btn ss-mp-btn-primary ss-mp-btn-wide" onClick={handleCreate}>
                            {t("create-lobby", { defaultValue: "CREATE LOBBY" })}
                        </button>

                        <div className="ss-mp-divider">
                            <span>{t("or", { defaultValue: "OR" })}</span>
                        </div>

                        <div className="ss-mp-input-group">
                            <label className="ss-mp-label">{t("join-by-code", { defaultValue: "JOIN BY CODE" })}</label>
                            <div className="ss-mp-join-row">
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                                    placeholder="XXXXX"
                                    className="ss-mp-input ss-mp-code-input"
                                    maxLength={5}
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                                />
                                <button className="ss-mp-btn ss-mp-btn-primary" onClick={handleJoin} disabled={joinCode.length < 5}>
                                    {t("join", { defaultValue: "JOIN" })}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {error && <div className="ss-mp-error">{error}</div>}

                <button className="ss-mp-btn ss-mp-btn-ghost" onClick={onBack} style={{ marginTop: '1rem' }}>
                    {t("back", { defaultValue: "BACK" })}
                </button>
            </div>
        </div>
    );
};
