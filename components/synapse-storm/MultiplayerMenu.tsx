import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplayer } from '../../lib/synapse-storm/MultiplayerProvider';
import { useLobbyInvite, useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { MenuBackdrop } from './MenuBackdrop';
import './SynapseStormMenu.css';

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

    // An invite link should not stall on the callsign prompt when this browser
    // already has a callsign — but a first-time player still gets asked, and the
    // join then happens the moment their connection lands.
    const invite = useLobbyInvite();
    useEffect(() => {
        if (!invite || step !== 'name' || !displayName.trim()) return;
        connect();
        setStep('choice');
    }, [invite, step, displayName, connect]);

    useLobbyInviteJoin(connectionStatus === 'connected', (code) => joinLobby(code.toUpperCase()));

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

    const logo = (
        <img
            className="ssm-mp-logo"
            src="/images/games/logos/synapse-storm.svg"
            alt={t("game-title", { defaultValue: "Synapse Storm" })}
            width={1120}
            height={502}
            decoding="async"
        />
    );

    if (step === 'name') {
        return (
            <div className="ssm-screen">
                <MenuBackdrop />
                <div className="ssm-scroll">
                    <div className="ss-mp-menu-content">
                        {logo}
                        <h1 className="ss-mp-title">{t("multiplayer", { defaultValue: "MULTIPLAYER" })}</h1>
                        <p className="ss-mp-subtitle">{t("enter-callsign", { defaultValue: "Enter your callsign for the neural network." })}</p>

                        <div className="ssm-panel ssm-panel--cyan ssm-card">
                            <div className="ss-mp-input-group">
                                <label className="ss-mp-label" htmlFor="ss-mp-display-name">{t("display-name", { defaultValue: "DISPLAY NAME" })}</label>
                                <input
                                    id="ss-mp-display-name"
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
                                <button className="ssm-btn ssm-btn--primary" onClick={handleSetName} disabled={!displayName.trim()}>
                                    {t("connect", { defaultValue: "CONNECT" })}
                                </button>
                                <button className="ssm-btn ssm-btn--ghost" onClick={onBack}>
                                    {t("back", { defaultValue: "BACK" })}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ssm-screen">
            <MenuBackdrop />
            <div className="ssm-scroll">
                <div className="ss-mp-menu-content">
                    {logo}
                    <h1 className="ss-mp-title">{t("multiplayer", { defaultValue: "MULTIPLAYER" })}</h1>
                    <p className="ss-mp-subtitle" role="status">
                        {connectionStatus === 'connecting' ? t("establishing-link", { defaultValue: "Establishing neural link..." }) :
                         connectionStatus === 'connected' ? t("connected-as", { defaultValue: "Connected as {{name}}", name: displayName }) :
                         connectionStatus === 'reconnecting' ? t("reconnecting", { defaultValue: "Reconnecting..." }) :
                         t("disconnected", { defaultValue: "Disconnected" })}
                    </p>

                    <div className="ssm-panel ssm-panel--cyan ssm-card">
                        {connectionStatus === 'connecting' && (
                            <div className="ss-mp-loading">
                                <span className="ssm-spinner" aria-hidden="true" />
                            </div>
                        )}

                        {connectionStatus === 'connected' && (
                            <>
                                <button className="ssm-btn ssm-btn--primary ssm-btn--wide" onClick={handleCreate}>
                                    {t("create-lobby", { defaultValue: "CREATE LOBBY" })}
                                </button>

                                <div className="ss-mp-divider">
                                    <span>{t("or", { defaultValue: "OR" })}</span>
                                </div>

                                <div className="ss-mp-input-group">
                                    <label className="ss-mp-label" htmlFor="ss-mp-join-code">{t("join-by-code", { defaultValue: "JOIN BY CODE" })}</label>
                                    <div className="ss-mp-join-row">
                                        <input
                                            id="ss-mp-join-code"
                                            type="text"
                                            value={joinCode}
                                            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                                            placeholder="XXXXX"
                                            className="ss-mp-input ss-mp-code-input"
                                            maxLength={5}
                                            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                                        />
                                        <button className="ssm-btn ssm-btn--secondary" onClick={handleJoin} disabled={joinCode.length < 5}>
                                            {t("join", { defaultValue: "JOIN" })}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {error && <div className="ss-mp-error" role="alert">{error}</div>}

                        <button className="ssm-btn ssm-btn--ghost ssm-leave" onClick={onBack}>
                            {t("back", { defaultValue: "BACK" })}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
