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
import { useGameSession } from '@/hooks/useGameSession';
import { ResultMomentSlot, useScoreMoment } from '@/components/games/result-moment-slot';

interface SynapseStormGameProps {
    /** Resolves with the score endpoint's JSON body (or nothing for a guest). */
    onSaveScore?: (data: ScoreSaveData) => Promise<unknown>;
    currentUserId?: string;
}

type TopLevelView = 'main' | 'multiplayer';

export const SynapseStormGame: React.FC<SynapseStormGameProps> = ({ onSaveScore, currentUserId }) => {
    const [topView, setTopView] = useState<TopLevelView>('main');
    const [scoreSaved, setScoreSaved] = useState(false);
    const [scoreMoment, takeScoreMoment, clearScoreMoment] = useScoreMoment();
    const { state, startGame, solvePuzzle, skipMemoryPhase, returnToMenu } = useGameEngine();
    // Session contract: keep the screen on while a round is running.
    useGameSession({ id: 'synapse-storm', active: state.status === 'playing' });
    useEffect(() => {
        if (state.status === 'playing') clearScoreMoment();
    }, [state.status, clearScoreMoment]);

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
            }).then((body) => {
                setScoreSaved(true);
                void takeScoreMoment(body);
            });
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
                    <ResultMomentSlot moment={scoreMoment} gameName="Synapse Storm" onDismiss={clearScoreMoment} />
                )}
                {state.status === 'gameover' && (
                    <GameOver state={state} onRestart={startGame} onMenu={returnToMenu} currentUserId={currentUserId} scoreSaved={scoreSaved} />
                )}
            </div>
        </div>
    );
};
