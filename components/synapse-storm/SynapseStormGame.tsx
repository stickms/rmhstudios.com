'use client';
import React, { useEffect, useState } from 'react';
import { useGameEngine } from '../../lib/synapse-storm/engine';
import { MainMenu } from './MainMenu';
import { GameBoard } from './GameBoard';
import { GameOver } from './GameOver';
import { MultiplayerGame } from './MultiplayerGame';
import { MultiplayerProvider } from '../../lib/synapse-storm/MultiplayerProvider';
import './SynapseStorm.css';

interface SynapseStormGameProps {
    onSaveScore?: (score: number) => void;
    currentUserId?: string;
}

type TopLevelView = 'main' | 'multiplayer';

export const SynapseStormGame: React.FC<SynapseStormGameProps> = ({ onSaveScore, currentUserId }) => {
    const [topView, setTopView] = useState<TopLevelView>('main');
    const { state, startGame, solvePuzzle, skipMemoryPhase, returnToMenu } = useGameEngine();

    useEffect(() => {
        if (state.status === 'gameover' && onSaveScore) {
            onSaveScore(state.score);
        }
    }, [state.status, state.score, onSaveScore]);

    if (topView === 'multiplayer') {
        return (
            <MultiplayerProvider>
                <MultiplayerGame onBackToMain={() => setTopView('main')} />
            </MultiplayerProvider>
        );
    }

    return (
        <div className="synapse-storm-root">
            <div className="scanline-overlay" />
            <div className="app-container">
                {state.status === 'menu' && (
                    <MainMenu
                        onStart={startGame}
                        onMultiplayer={() => setTopView('multiplayer')}
                        currentUserId={currentUserId}
                    />
                )}
                {state.status === 'playing' && (
                    <GameBoard state={state} onSolve={solvePuzzle} onSkipPhase={skipMemoryPhase} />
                )}
                {state.status === 'gameover' && (
                    <GameOver state={state} onRestart={startGame} onMenu={returnToMenu} currentUserId={currentUserId} />
                )}
            </div>
        </div>
    );
};
