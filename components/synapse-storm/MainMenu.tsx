'use client';
import React, { useState, useEffect } from 'react';
import { Zap, Brain, Activity, Target, Layers, Timer, Settings2 } from 'lucide-react';
import { GlobalLeaderboard } from './GlobalLeaderboard';
import { getSettings, setMusicVolume, setSfxVolume } from '@/lib/synapse-storm/settings';
import { soundManager } from '@/lib/synapse-storm/sounds';
import { synapseStormMusic } from '@/lib/synapse-storm/music';

interface MainMenuProps {
    onStart: () => void;
    onMultiplayer?: () => void;
    currentUserId?: string;
}

const FEATURES = [
    { icon: <Zap size={14} />, label: 'Reaction' },
    { icon: <Brain size={14} />, label: 'Memory' },
    { icon: <Layers size={14} />, label: 'Patterns' },
    { icon: <Target size={14} />, label: 'Spatial' },
    { icon: <Activity size={14} />, label: 'Math' },
    { icon: <Timer size={14} />, label: 'Fast-paced' },
];

export const MainMenu: React.FC<MainMenuProps> = ({ onStart, onMultiplayer, currentUserId }) => {
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
                    Juggle a storm of micro-challenges. Stay sharp.
                    See how long your mind can keep up before the load becomes too great.
                </p>

                <div className="menu-features">
                    {FEATURES.map((f, i) => (
                        <div key={i} className="feature">
                            <span className="feature-icon">{f.icon}</span>
                            {f.label}
                        </div>
                    ))}
                </div>

                <div className="menu-buttons">
                    <button className="start-button" onClick={onStart}>
                        SOLO NEURAL LINK
                        <div className="start-glow" />
                    </button>
                    {onMultiplayer && (
                        <button className="start-button multiplayer-button" onClick={onMultiplayer}>
                            MULTIPLAYER STORM
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
                        Settings
                    </button>
                    {settingsOpen && (
                        <div className="settings-panel">
                            <div className="settings-row">
                                <label>Music</label>
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
                                <label>Sound effects</label>
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
                    <h3>Transmission Protocol:</h3>
                    <ul>
                        <li>Solve cards before they expire to maintain system stability.</li>
                        <li>Maintain combos to exponentially increase your score.</li>
                        <li>Integrity failure occurs after 5 data casualties (Misses).</li>
                        <li>Difficulty scales dynamically with your neural efficiency.</li>
                    </ul>
                </div>

                <GlobalLeaderboard currentUserId={currentUserId} compact />
            </div>
        </div>
    );
};
