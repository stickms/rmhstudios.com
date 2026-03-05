'use client';
import React from 'react';
import { GameState } from '../../lib/synapse-storm/types';
import { HUD } from './HUD';
import { PuzzleCard } from './PuzzleCard';

interface GameBoardProps {
    state: GameState;
    onSolve: (id: string, correct: boolean) => void;
    onSkipPhase?: (id: string) => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({ state, onSolve, onSkipPhase }) => {
    const boardClass = [
        'game-board',
        state.isSaturated ? 'saturated' : '',
        state.burstActive ? 'burst-mode' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={boardClass}>
            <HUD state={state} />

            <div className="playfield">
                {state.activePuzzles.length === 0 && (
                    <div className="playfield-empty">
                        <span className="loading-pulse">🌩️</span>
                        <p>Preparing sequence...</p>
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
                        <span className="combo-text">{state.combo}× COMBO!</span>
                    </div>
                )}
            </div>
        </div>
    );
};
