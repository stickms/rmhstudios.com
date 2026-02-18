'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useRef } from 'react';
import { GameHUD, UpgradePicker } from '@/components/echoes/2d/GameUI';
import { StartScreen, GameOverScreen } from '@/components/echoes/2d/LeaderboardUI';
import ClassSelect from '@/components/echoes/2d/ClassSelect';
import AbilityHUD from '@/components/echoes/2d/AbilityHUD';
import MobileAbilityButtons from '@/components/echoes/2d/MobileAbilityButtons';
import KeybindSettings from '@/components/echoes/2d/KeybindSettings';
import AchievementToast from '@/components/echoes/ui/AchievementToast';
import MobileDPad from '@/components/echoes/2d/MobileDPad';
import { useGameStore } from '@/lib/echoes/game2d/GameStore';
import { AbilityState, makeAbilityStates } from '@/lib/echoes/game2d/ClassStore';
import type { GameClass } from '@/lib/echoes/game2d/ClassStore';

const EchoesGame = dynamic(() => import('@/components/echoes/2d/EchoesGame'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center w-full h-full bg-black text-purple-400 font-mono tracking-widest animate-pulse">
            INITIALIZING...
        </div>
    )
});

export default function EchoesPage() {
    const { phase, showClassSelect, startGame, togglePause } = useGameStore();
    const [mobileInput, setMobileInput] = useState({ dx: 0, dy: 0 });
    const [showDPad, setShowDPad] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [abilityStates, setAbilityStates] = useState<AbilityState[]>(makeAbilityStates());
    const [abilityTrigger, setAbilityTrigger] = useState<number | null>(null);
    const abilityTriggerSeq = useRef(0);

    const selectedClass = useGameStore(s => s.selectedClass);

    useEffect(() => {
        const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        setShowDPad(isTouchDevice);
        const onTouch = () => setShowDPad(true);
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Escape') { togglePause(); return; }
            setShowDPad(false);
        };
        window.addEventListener('touchstart', onTouch);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('touchstart', onTouch); window.removeEventListener('keydown', onKey); };
    }, [togglePause]);

    const handleDPad = useCallback((dx: number, dy: number) => setMobileInput({ dx, dy }), []);

    const handleAbilityStatesChange = useCallback((states: AbilityState[]) => setAbilityStates(states), []);

    const handleMobileAbility = useCallback((index: number) => {
        abilityTriggerSeq.current++;
        setAbilityTrigger(index);
        // Reset after one frame so re-tapping same ability works
        setTimeout(() => setAbilityTrigger(null), 50);
    }, []);

    const handleClassSelect = useCallback((cls: GameClass) => {
        startGame(cls);
    }, [startGame]);

    return (
        <main className="fixed inset-0 bg-black overflow-hidden">
            <EchoesGame
                mobileInput={mobileInput}
                onAbilityStatesChange={handleAbilityStatesChange}
                abilityTrigger={abilityTrigger}
            />

            {/* HUD */}
            {phase === 'playing' && <GameHUD />}

            {/* Ability HUD (keyboard) */}
            {phase === 'playing' && selectedClass && (
                <AbilityHUD gameClass={selectedClass} abilityStates={abilityStates} />
            )}

            {/* Mobile controls */}
            {showDPad && phase === 'playing' && <MobileDPad onChange={handleDPad} />}
            {showDPad && phase === 'playing' && selectedClass && (
                <MobileAbilityButtons
                    gameClass={selectedClass}
                    abilityStates={abilityStates}
                    onActivate={handleMobileAbility}
                />
            )}

            {/* Settings gear — below the HUD top bar (~56px tall) */}
            {(phase === 'playing' || phase === 'paused') && (
                <button
                    onClick={() => setShowSettings(true)}
                    className="absolute top-14 right-4 z-40 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all text-sm"
                >⚙</button>
            )}

            {/* Pause overlay */}
            {phase === 'paused' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="text-white/30 text-xs font-mono tracking-[0.4em] uppercase mb-2">Game Paused</div>
                    <h2 className="text-4xl font-black text-white mb-8">PAUSED</h2>
                    <div className="flex flex-col gap-3 w-48">
                        <button onClick={togglePause}
                            className="py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg tracking-widest uppercase transition-colors">
                            Resume
                        </button>
                        <button onClick={() => setShowSettings(true)}
                            className="py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-lg tracking-widest uppercase transition-colors">
                            ⚙ Settings
                        </button>
                        <button onClick={showClassSelect}
                            className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-bold rounded-lg tracking-widest uppercase transition-colors text-sm">
                            Quit to Menu
                        </button>
                    </div>
                    <div className="text-white/20 text-xs font-mono mt-6">[Esc] to resume</div>
                </div>
            )}

            {/* Upgrade picker */}
            <UpgradePicker />

            {/* Class select */}
            {phase === 'class_select' && <ClassSelect onSelect={handleClassSelect} />}

            {/* Start screen — "Begin" now goes to class select */}
            <StartScreen />

            {/* Game over */}
            <GameOverScreen />

            {/* Keybind settings */}
            <KeybindSettings open={showSettings} onClose={() => setShowSettings(false)} />

            <AchievementToast />
        </main>
    );
}
