'use client';
import React from 'react';
import { Zap, Brain, Activity, Target, Layers, Timer } from 'lucide-react';
import { GlobalLeaderboard } from './GlobalLeaderboard';

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
