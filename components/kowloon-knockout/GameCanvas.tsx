'use client';

import { useRef, useEffect, useCallback } from 'react';
import { initGame } from '@/lib/kowloon-knockout/game/engine';
import { initMultiplayerGame } from '@/lib/kowloon-knockout/game/multiplayerEngine';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import type { GameState } from '@/lib/kowloon-knockout/game/fighters/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, SCALE } from '@/lib/kowloon-knockout/game/fighters/types';

export default function GameCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const { selectedClass, opponentClass, isMultiplayer, isHost, setPhase, updateFightState } = useGameStore();

    const onStateChange = useCallback((state: GameState) => {
        updateFightState({
            playerHealth: state.player.health,
            opponentHealth: state.opponent.health,
            playerMaxHealth: state.player.stats.maxHealth,
            opponentMaxHealth: state.opponent.stats.maxHealth,
            playerStamina: state.player.stamina,
            opponentStamina: state.opponent.stamina,
            playerMaxStamina: state.player.stats.stamina,
            opponentMaxStamina: state.opponent.stats.stamina,
            round: state.round,
            roundTime: state.roundTime,
            comboText: state.comboText,
            result: state.result,
            playerWins: state.playerScore,
            opponentWins: state.opponentScore,
        });

        if (state.phase === 'result') {
            setTimeout(() => setPhase('result'), 1500);
        }
    }, [updateFightState, setPhase]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;

        if (isMultiplayer) {
            cleanupRef.current = initMultiplayerGame(canvas, selectedClass, opponentClass, isHost, onStateChange);
        } else {
            cleanupRef.current = initGame(canvas, selectedClass, opponentClass, onStateChange);
        }

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, [selectedClass, opponentClass, isMultiplayer, isHost, onStateChange]);

    return (
        <div className="game-canvas-container">
            <canvas
                ref={canvasRef}
                className="game-canvas"
                style={{
                    width: CANVAS_WIDTH * SCALE,
                    height: CANVAS_HEIGHT * SCALE,
                    imageRendering: 'pixelated',
                }}
            />
            <div className="controls-hint">
                <div className="control-group">
                    <span className="control-key">A/D</span>
                    <span className="control-label">Move</span>
                </div>
                <div className="control-group">
                    <span className="control-key">S</span>
                    <span className="control-label">Block</span>
                </div>
                <div className="control-group">
                    <span className="control-key">J</span>
                    <span className="control-label">Jab</span>
                </div>
                <div className="control-group">
                    <span className="control-key">K</span>
                    <span className="control-label">Cross</span>
                </div>
                <div className="control-group">
                    <span className="control-key">L</span>
                    <span className="control-label">Hook</span>
                </div>
                <div className="control-group">
                    <span className="control-key">U</span>
                    <span className="control-label">Uppercut</span>
                </div>
            </div>
        </div>
    );
}
