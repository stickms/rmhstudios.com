'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { GameState } from '../../lib/synapse-storm/types';
import { GlobalLeaderboard } from './GlobalLeaderboard';

interface GameOverProps {
    state: GameState;
    onRestart: () => void;
    onMenu: () => void;
    currentUserId?: string;
    scoreSaved?: boolean;
}

export const GameOver: React.FC<GameOverProps> = ({ state, onRestart, onMenu, currentUserId, scoreSaved }) => {
    const { t } = useTranslation("c-synapse-storm");
    const accuracy = state.puzzlesSolved > 0
        ? Math.round((state.puzzlesSolved / (state.puzzlesSolved + state.puzzlesMissed)) * 100)
        : 0;

    const rank = state.score > 20000 ? 'S+' : (state.score > 10000 ? 'A' : (state.score > 5000 ? 'B' : 'C'));

    return (
        <div className="game-over">
            <div className="menu-bg-effect" style={{ opacity: 0.3 }} />

            <div className="go-content">
                <h2 className="hud-label" style={{ fontSize: '1.2rem', color: 'var(--accent-red)' }}>
                    {t("neural-collapse", { defaultValue: "NEURAL COLLAPSE" })}
                </h2>

                <div className="go-final-score">{state.score.toLocaleString()}</div>
                <p className="menu-tagline">{t("final-rating-prefix", { defaultValue: "Final Neural Efficiency Rating:" })} <span style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>{rank}</span></p>

                <div className="go-stats-grid">
                    <div className="go-stat">
                        <span className="hud-label">{t("stat-solved", { defaultValue: "Solved" })}</span>
                        <div className="hud-value">{state.puzzlesSolved}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">{t("stat-max-combo", { defaultValue: "Max Combo" })}</span>
                        <div className="hud-value">{state.maxCombo}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">{t("stat-accuracy", { defaultValue: "Accuracy" })}</span>
                        <div className="hud-value">{accuracy}%</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">{t("stat-survival", { defaultValue: "Survival" })}</span>
                        <div className="hud-value">{Math.floor(state.totalTime)}s</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">{t("stat-peak-intensity", { defaultValue: "Peak Intensity" })}</span>
                        <div className="hud-value">{state.difficulty.toFixed(1)}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">{t("stat-new-best", { defaultValue: "New Best?" })}</span>
                        <div className="hud-value" style={{ color: 'var(--accent-gold)' }}>--</div>
                    </div>
                </div>

                <GlobalLeaderboard
                    currentUserId={currentUserId}
                    currentScore={state.score}
                    autoRefresh
                    refreshKey={scoreSaved ? 1 : 0}
                />

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '1rem' }}>
                    <button className="go-button go-restart" onClick={onRestart}>
                        {t("reboot-neural-link", { defaultValue: "REBOOT NEURAL LINK" })}
                    </button>
                    <button className="go-button" style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }} onClick={onMenu}>
                        {t("return-to-hub", { defaultValue: "RETURN TO HUB" })}
                    </button>
                </div>
            </div>
        </div>
    );
};
