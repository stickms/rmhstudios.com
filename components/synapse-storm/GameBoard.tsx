'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { GameState } from '../../lib/synapse-storm/types';
import { HUD } from './HUD';
import { PuzzleCard } from './PuzzleCard';

interface GameBoardProps {
    state: GameState;
    onSolve: (id: string, correct: boolean) => void;
    onSkipPhase?: (id: string) => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({ state, onSolve, onSkipPhase }) => {
    const { t } = useTranslation("c-synapse-storm");
    return (
        <div className={`game-board ${state.isSaturated ? 'saturated' : ''}`}>
            <HUD state={state} />

            <div className="playfield">
                {state.activePuzzles.length === 0 && (
                    <div className="playfield-empty">
                        <span className="loading-pulse">🌩️</span>
                        <p>{t("preparing-sequence", { defaultValue: "Preparing sequence..." })}</p>
                    </div>
                )}

                <div className="playfield-grid">
                    {state.activePuzzles.map((puzzle) => (
                        <PuzzleCard
                            key={puzzle.id}
                            puzzle={puzzle}
                            gameState={state}
                            onSolve={onSolve}
                            onSkipPhase={onSkipPhase}
                        />
                    ))}
                </div>

                {state.combo >= 10 && (
                    <div className="combo-overlay">
                        <span className="combo-text">{t("combo-count", { defaultValue: "{{combo}} COMBO!", combo: state.combo })}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
