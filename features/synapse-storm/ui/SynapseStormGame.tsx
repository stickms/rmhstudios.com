import React, { useEffect, useState } from 'react';
import { useGameEngine } from '../engine/engine';
import { MainMenu } from './MainMenu';
import { GameBoard } from './GameBoard';
import { GameOver } from './GameOver';
import { MultiplayerGame } from './MultiplayerGame';
import { MultiplayerProvider } from '../engine/MultiplayerProvider';
import type { ScoreSaveData } from '../engine/persistence';
import type { PuzzleCategory } from '../engine/types';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import './SynapseStorm.css';
import { useGameSession } from '@/hooks/useGameSession';
import { ResultMomentSlot, useScoreMoment } from '@/components/games/result-moment-slot';
import { AssistStartNotice, parseRanked, useAssistRun } from '@/components/games/assist-run';
import { SynapseAssistContext } from './assist-context';
import { NO_ASSIST_FLAGS, synapseAssistFlags, type SynapseAssistFlags } from '../engine/assist-profile';

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
    const { state, startGame, startCustomGame, solvePuzzle, skipMemoryPhase, returnToMenu, configureAssist, endRun } = useGameEngine();
    // R14: set while the current run is an unranked training storm. Such a run never submits.
    const [training, setTraining] = useState<PuzzleCategory[] | null>(null);
    // Assists (settings > Game assists): the server hands the profile out at run start and records that the
    // run is assisted; the run starts once it answers (a failed call is the plain game).
    const signedIn = Boolean(currentUserId);
    const startAssistRun = useAssistRun('synapse-storm', signedIn);
    const [assist, setAssist] = useState<SynapseAssistFlags>(NO_ASSIST_FLAGS);
    const [ranked, setRanked] = useState<boolean | null>(null);
    const beginRun = async (begin: () => void) => {
        const flags = synapseAssistFlags(await startAssistRun());
        setAssist(flags);
        configureAssist(flags);
        begin();
    };
    const playStorm = () => { setTraining(null); setRanked(null); void beginRun(startGame); };
    const playTraining = (categories: PuzzleCategory[]) => { setTraining(categories); setRanked(null); void beginRun(() => startCustomGame(categories)); };
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
        if (state.status === 'gameover' && onSaveScore && !training) {
            setScoreSaved(false);
            onSaveScore({
                score: state.score,
                puzzlesSolved: state.puzzlesSolved,
                maxCombo: state.maxCombo,
                peakDifficulty: state.difficulty,
                totalTime: state.totalTime,
            }).then((body) => {
                setScoreSaved(true);
                setRanked(parseRanked(body));
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
        <SynapseAssistContext.Provider value={assist}>
        <div
            className="synapse-storm-root"
            data-assist-calm={assist.calm ? '' : undefined}
            data-assist-color-safe={assist.colorSafe ? '' : undefined}
        >
            <div className="scanline-overlay" />
            <div className="app-container">
                {state.status === 'menu' && <AssistStartNotice signedIn={signedIn} className="assist-note" />}
                {state.status === 'menu' && (
                    <MainMenu
                        onStart={playStorm}
                        onCustom={playTraining}
                        onMultiplayer={() => setTopView('multiplayer')}
                        currentUserId={currentUserId}
                    />
                )}
                {state.status === 'playing' && (
                    <GameBoard state={state} onSolve={solvePuzzle} onSkipPhase={skipMemoryPhase} onEndRun={endRun} />
                )}
                {state.status === 'gameover' && (
                    <ResultMomentSlot moment={scoreMoment} gameName="Synapse Storm" onDismiss={clearScoreMoment} />
                )}
                {state.status === 'gameover' && (
                    <GameOver state={state} onRestart={training ? () => playTraining(training) : playStorm} onMenu={returnToMenu} currentUserId={currentUserId} scoreSaved={scoreSaved} newBest={!!scoreMoment} training={!!training} ranked={ranked} />
                )}
            </div>
        </div>
        </SynapseAssistContext.Provider>
    );
};
