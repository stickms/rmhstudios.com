'use client';
import React from 'react';
import { GameState } from '../../lib/synapse-storm/types';

interface HUDProps {
    state: GameState;
}

export const HUD: React.FC<HUDProps> = ({ state }) => {
    const intensity = (state.difficulty - 1) / 9;
    const comboClass = state.combo >= 10 ? 'mega' : state.combo >= 3 ? 'active' : '';
    const { burstActive, activeEffect } = state;

    return (
        <div className="hud">
            {/* Score */}
            <div className="hud-seg hud-score">
                <span className="hud-label">Score</span>
                <span className="hud-value">{state.score.toLocaleString()}</span>
            </div>

            {/* Combo */}
            <div className="hud-seg">
                <span className="hud-label">Combo</span>
                <span className={`hud-combo-val ${comboClass}`}>
                    {state.combo >= 3 ? `×${state.combo}` : '—'}
                </span>
            </div>

            {/* Lives / Integrity */}
            <div className="hud-seg">
                <span className="hud-label">Integrity</span>
                <div className="hud-lives">
                    {Array.from({ length: state.missThreshold }).map((_, i) => (
                        <div
                            key={i}
                            className={`life-pip ${i < state.missThreshold - state.puzzlesMissed ? 'alive' : 'dead'}`}
                        />
                    ))}
                </div>
            </div>

            {/* Intensity */}
            <div className="hud-seg">
                <span className="hud-label">Intensity</span>
                <div className="hud-intensity-wrap">
                    <div className="hud-intensity-bar">
                        <div
                            className="hud-intensity-fill"
                            style={{ width: `${Math.min(intensity * 100, 100)}%` }}
                        />
                    </div>
                    <span className="hud-intensity-lv">Lv.{Math.floor(state.difficulty)}</span>
                </div>
            </div>

            {/* Time */}
            <div className="hud-seg">
                <span className="hud-label">Survived</span>
                <span className="hud-value">{Math.floor(state.totalTime)}s</span>
            </div>

            {/* Solved */}
            <div className="hud-seg">
                <span className="hud-label">Solved</span>
                <span className="hud-value">{state.puzzlesSolved}</span>
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Active effect badges */}
            {burstActive && (
                <div className="hud-seg" style={{ borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <span className="hud-effect-badge burst">⚡ BURST</span>
                </div>
            )}
            {activeEffect && !burstActive && (
                <div className="hud-seg" style={{ borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <span className="hud-effect-badge">
                        {activeEffect.type === 'timeDilation' ? '⏱ SLOW TIME' :
                         activeEffect.type === 'purge' ? '🌀 PURGE' :
                         '❤ 2ND CHANCE'}
                    </span>
                </div>
            )}
        </div>
    );
};
