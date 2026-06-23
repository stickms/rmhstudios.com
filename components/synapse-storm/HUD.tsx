'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { GameState } from '../../lib/synapse-storm/types';

interface HUDProps {
    state: GameState;
}

export const HUD: React.FC<HUDProps> = ({ state }) => {
    const { t } = useTranslation("c-synapse-storm");
    const intensity = (state.difficulty - 1) / 9;

    return (
        <div className="hud">
            <div className="hud-section hud-score">
                <span className="hud-label">{t("score", { defaultValue: "Score" })}</span>
                <span className="hud-value score-value">{state.score.toLocaleString()}</span>
            </div>

            <div className="hud-section hud-combo">
                <span className="hud-label">{t("combo", { defaultValue: "Combo" })}</span>
                <span className={`hud-value combo-value ${state.combo >= 5 ? 'combo-active' : ''}`}>
                    {state.combo >= 3 ? `x${state.combo}` : '—'}
                </span>
            </div>

            <div className="hud-section hud-difficulty">
                <span className="hud-label">{t("intensity", { defaultValue: "Intensity" })}</span>
                <div className="difficulty-bar">
                    <div
                        className="difficulty-fill"
                        style={{ width: `${intensity * 100}%` }}
                    />
                </div>
                <span className="difficulty-level">{t("level", { defaultValue: "Lv. {{level}}", level: Math.floor(state.difficulty) })}</span>
            </div>

            <div className="hud-section hud-lives">
                <span className="hud-label">{t("integrity", { defaultValue: "Integrity" })}</span>
                <div className="lives-display">
                    {Array.from({ length: state.missThreshold }).map((_, i) => (
                        <span
                            key={i}
                            className={`life-pip ${i < state.missThreshold - state.puzzlesMissed ? 'alive' : 'dead'}`}
                        >
                            ●
                        </span>
                    ))}
                </div>
            </div>

            <div className="hud-section hud-timer">
                <span className="hud-label">{t("time-survived", { defaultValue: "Time Survived" })}</span>
                <span className="hud-value">{Math.floor(state.totalTime)}s</span>
            </div>

            <div className="hud-section hud-stat">
                <span className="hud-label">{t("solved", { defaultValue: "Solved" })}</span>
                <span className="hud-value">{state.puzzlesSolved}</span>
            </div>

            {state.combo === 0 && state.maxCombo >= 3 && (
                <div className="hud-section hud-best-streak">
                    <span className="hud-label">{t("best-streak", { defaultValue: "Best Streak" })}</span>
                    <span className="hud-value best-streak-value">x{state.maxCombo}</span>
                </div>
            )}
        </div>
    );
};
