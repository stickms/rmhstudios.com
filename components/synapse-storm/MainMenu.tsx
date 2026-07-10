'use client';
import React, { useState, useEffect } from 'react';
import { Zap, Brain, Activity, Target, Layers, Timer, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlobalLeaderboard } from './GlobalLeaderboard';
import { getSettings, setMusicVolume, setSfxVolume } from '@/lib/synapse-storm/settings';
import { soundManager } from '@/lib/synapse-storm/sounds';
import { synapseStormMusic } from '@/lib/synapse-storm/music';

interface MainMenuProps {
    onStart: () => void;
    onMultiplayer?: () => void;
    currentUserId?: string;
}

const FEATURE_KEYS = [
    { icon: <Zap size={14} />, key: 'feature-reaction', defaultValue: 'Reaction' },
    { icon: <Brain size={14} />, key: 'feature-memory', defaultValue: 'Memory' },
    { icon: <Layers size={14} />, key: 'feature-patterns', defaultValue: 'Patterns' },
    { icon: <Target size={14} />, key: 'feature-spatial', defaultValue: 'Spatial' },
    { icon: <Activity size={14} />, key: 'feature-math', defaultValue: 'Math' },
    { icon: <Timer size={14} />, key: 'feature-fast-paced', defaultValue: 'Fast-paced' },
];

export const MainMenu: React.FC<MainMenuProps> = ({ onStart, onMultiplayer, currentUserId }) => {
    const { t } = useTranslation("c-synapse-storm");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [musicVol, setMusicVol] = useState(0.25);
    const [sfxVol, setSfxVol] = useState(0.3);

    useEffect(() => {
        const s = getSettings();
        setMusicVol(s.musicVolume);
        setSfxVol(s.sfxVolume);
    }, []);

    const handleMusicChange = (v: number) => {
        setMusicVol(v);
        setMusicVolume(v);
        synapseStormMusic.setVolume(v);
    };

    const handleSfxChange = (v: number) => {
        setSfxVol(v);
        setSfxVolume(v);
        soundManager.setVolume(v);
    };

    return (
        <div className="main-menu">
            <div className="menu-bg-effect" />

            <div className="menu-content">
                <div className="menu-logo">
                    <span className="logo-icon">🌩️</span>
                    <h1 className="menu-title">
                        <span className="title-synapse">SYNAPSE</span>
                        <span className="title-storm">STORM</span>
                    </h1>
                </div>

                <p className="menu-tagline">
                    {t("tagline", { defaultValue: "Juggle a storm of micro-challenges. Stay sharp. See how long your mind can keep up before the load becomes too great." })}
                </p>

                <div className="menu-features">
                    {FEATURE_KEYS.map((f, i) => (
                        <div key={i} className="feature">
                            <span className="feature-icon">{f.icon}</span>
                            {t(f.key, { defaultValue: f.defaultValue })}
                        </div>
                    ))}
                </div>

                <div className="menu-buttons">
                    <button className="start-button" onClick={onStart}>
                        {t("solo-neural-link", { defaultValue: "SOLO NEURAL LINK" })}
                        <div className="start-glow" />
                    </button>
                    {onMultiplayer && (
                        <button className="start-button multiplayer-button" onClick={onMultiplayer}>
                            {t("multiplayer-storm", { defaultValue: "MULTIPLAYER STORM" })}
                            <div className="start-glow" />
                        </button>
                    )}
                </div>

                <div className="menu-settings-section">
                    <button
                        type="button"
                        className="settings-toggle"
                        onClick={() => setSettingsOpen(!settingsOpen)}
                        aria-expanded={settingsOpen}
                    >
                        <Settings2 size={18} />
                        {t("settings", { defaultValue: "Settings" })}
                    </button>
                    {settingsOpen && (
                        <div className="settings-panel">
                            <div className="settings-row">
                                <label>{t("music", { defaultValue: "Music" })}</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={Math.round(musicVol * 100)}
                                    onChange={(e) => handleMusicChange(Number(e.target.value) / 100)}
                                />
                                <span className="settings-value">{Math.round(musicVol * 100)}%</span>
                            </div>
                            <div className="settings-row">
                                <label>{t("sound-effects", { defaultValue: "Sound effects" })}</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={Math.round(sfxVol * 100)}
                                    onChange={(e) => handleSfxChange(Number(e.target.value) / 100)}
                                />
                                <span className="settings-value">{Math.round(sfxVol * 100)}%</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="menu-instructions">
                    <h3>{t("transmission-protocol", { defaultValue: "Transmission Protocol:" })}</h3>
                    <ul>
                        <li>{t("instruction-solve-cards", { defaultValue: "Solve cards before they expire to maintain system stability." })}</li>
                        <li>{t("instruction-combos", { defaultValue: "Maintain combos to exponentially increase your score." })}</li>
                        <li>{t("instruction-integrity", { defaultValue: "Integrity failure occurs after 5 data casualties (Misses)." })}</li>
                        <li>{t("instruction-difficulty", { defaultValue: "Difficulty scales dynamically with your neural efficiency." })}</li>
                    </ul>
                </div>

                <GlobalLeaderboard currentUserId={currentUserId} />
            </div>
        </div>
    );
};
