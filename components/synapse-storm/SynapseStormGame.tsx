'use client';
import React, { useEffect, useState } from 'react';
import { useGameEngine } from '../../lib/synapse-storm/engine';
import { MainMenu } from './MainMenu';
import { GameBoard } from './GameBoard';
import { GameOver } from './GameOver';
import { MultiplayerGame } from './MultiplayerGame';
import { MultiplayerProvider } from '../../lib/synapse-storm/MultiplayerProvider';
import type { ScoreSaveData } from '../../lib/synapse-storm/persistence';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import './SynapseStorm.css';

interface SynapseStormGameProps {
    onSaveScore?: (data: ScoreSaveData) => Promise<void>;
    currentUserId?: string;
}

type TopLevelView = 'main' | 'multiplayer';

export const SynapseStormGame: React.FC<SynapseStormGameProps> = ({ onSaveScore, currentUserId }) => {
    const [topView, setTopView] = useState<TopLevelView>('main');
    const [scoreSaved, setScoreSaved] = useState(false);
    const { state, startGame, solvePuzzle, skipMemoryPhase, returnToMenu } = useGameEngine();

    // Several puzzle types are typed, so a keyboard can be up at any moment
    // during a run. Publishing its height lets the shell end where the keyboard
    // begins — which is what stops the browser magnifying the playfield to
    // reveal a field it thinks is hidden. See `hooks/useKeyboardInset`.
    useKeyboardInset();

    // An invite link opens on the multiplayer side of the game; the menu there
    // does the joining once the neural link is up.
    const invite = useLobbyInvite();
    useEffect(() => {
        if (invite) setTopView('multiplayer');
    }, [invite]);

    useEffect(() => {
        if (state.status === 'gameover' && onSaveScore) {
            setScoreSaved(false);
            onSaveScore({
                score: state.score,
                puzzlesSolved: state.puzzlesSolved,
                maxCombo: state.maxCombo,
                peakDifficulty: state.difficulty,
                totalTime: state.totalTime,
            }).then(() => setScoreSaved(true));
        }
    }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    <GameOver state={state} onRestart={startGame} onMenu={returnToMenu} currentUserId={currentUserId} scoreSaved={scoreSaved} />
                )}
            </div>
        </div>
    );
};
