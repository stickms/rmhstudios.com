'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { CLASS_DISPLAY, CLASS_STATS, ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { networkClient } from '@/lib/kowloon-knockout/network/client';
import type { FighterClass } from '@/lib/kowloon-knockout/game/fighters/types';
import type { ServerMessage } from '@/lib/kowloon-knockout/network/types';

function pickOpponent(allClasses: FighterClass[]): FighterClass {
    return allClasses[Math.floor(Math.random() * allClasses.length)];
}

/** Renders the idle sprite of a fighter onto a small canvas */
function FighterSpritePreview({ fighterClass, size = 120 }: { fighterClass: FighterClass; size?: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Import sprite drawing dynamically to avoid SSR issues
        import('@/lib/kowloon-knockout/game/sprites').then(({ drawFighter }) => {
            const display = CLASS_DISPLAY[fighterClass];
            const stats = CLASS_STATS[fighterClass];

            // Create a mock fighter for sprite rendering
            const mockFighter = {
                x: canvas.width / 2,
                y: canvas.height - 10,
                facingRight: true,
                state: 'idle' as const,
                stateFrame: 0,
                health: stats.maxHealth,
                stamina: stats.stamina,
                stats,
                className: fighterClass,
                currentPunch: null,
                punchFrame: 0,
                hitCooldown: 0,
                blockHeld: false,
                comboHistory: [],
                punchConnected: false,
                knockoutTimer: 0,
                displayName: display.name,
                spriteColor: display.color,
                spriteAccentColor: display.accent,
            };

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawFighter(ctx, mockFighter, 0);
        });
    }, [fighterClass]);

    return (
        <canvas
            ref={canvasRef}
            width={80}
            height={80}
            style={{
                width: size,
                height: size,
                imageRendering: 'pixelated',
            }}
        />
    );
}

export default function CharacterSelect() {
    const {
        selectedClass, setSelectedClass, setOpponentClass, setPhase,
        isMultiplayer, resetMultiplayer, setIsHost, setConnectionStatus,
    } = useGameStore();
    const [waitingForOpponent, setWaitingForOpponent] = useState(false);
    const [opponentReady, setOpponentReady] = useState(false);
    const cleanupRef = useRef(false);

    const selectedIdx = ALL_FIGHTERS.indexOf(selectedClass);

    const isRematch = isMultiplayer && networkClient.connected;

    useEffect(() => {
        if (!isRematch) return;

        const onOpponentReady = (msg: ServerMessage) => {
            if (msg.type === 'opponent_ready') {
                setOpponentReady(true);
            }
        };

        const onRoomJoined = (msg: ServerMessage) => {
            if (msg.type === 'room_joined' && !cleanupRef.current) {
                setIsHost(msg.isHost);
                const oppClass = msg.isHost ? msg.guestClass : msg.hostClass;
                setOpponentClass(oppClass);
                setConnectionStatus('playing');
                setPhase('fight');
            }
        };

        const onDisconnect = (msg: ServerMessage) => {
            if (msg.type === 'opponent_disconnected' && !cleanupRef.current) {
                setWaitingForOpponent(false);
                setOpponentReady(false);
                resetMultiplayer();
                setPhase('menu');
            }
        };

        networkClient.on('opponent_ready', onOpponentReady);
        networkClient.on('room_joined', onRoomJoined);
        networkClient.on('opponent_disconnected', onDisconnect);

        return () => {
            cleanupRef.current = true;
            networkClient.off('opponent_ready', onOpponentReady);
            networkClient.off('room_joined', onRoomJoined);
            networkClient.off('opponent_disconnected', onDisconnect);
        };
    }, [isRematch, setIsHost, setOpponentClass, setConnectionStatus, setPhase, resetMultiplayer]);

    const navigate = useCallback((dir: -1 | 1) => {
        if (waitingForOpponent) return;
        const newIdx = (selectedIdx + dir + ALL_FIGHTERS.length) % ALL_FIGHTERS.length;
        setSelectedClass(ALL_FIGHTERS[newIdx]);
    }, [selectedIdx, waitingForOpponent, setSelectedClass]);

    // Keyboard navigation
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'a') navigate(-1);
            if (e.key === 'ArrowRight' || e.key === 'd') navigate(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [navigate]);

    const handleFight = () => {
        if (isRematch) {
            networkClient.fighterReady(selectedClass);
            setWaitingForOpponent(true);
        } else if (isMultiplayer) {
            setPhase('lobby');
        } else {
            setOpponentClass(pickOpponent(ALL_FIGHTERS));
            setPhase('fight');
        }
    };

    const handleBack = () => {
        if (waitingForOpponent) return;
        if (isRematch) {
            networkClient.disconnect();
            networkClient.clearHandlers();
        }
        resetMultiplayer();
        setPhase('menu');
    };

    const display = CLASS_DISPLAY[selectedClass];
    const stats = CLASS_STATS[selectedClass];

    return (
        <div className="select-container">
            <motion.div
                className="select-step"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <h1 className="select-title">
                    {isRematch ? 'REMATCH — CHOOSE YOUR FIGHTER' : 'CHOOSE YOUR FIGHTER'}
                </h1>

                {/* Fighter carousel */}
                <div className="fighter-carousel">
                    <button
                        className="carousel-arrow carousel-arrow-left"
                        onClick={() => navigate(-1)}
                        disabled={waitingForOpponent}
                    >
                        ◀
                    </button>

                    <div className="carousel-center">
                        {/* Fighter roster strip */}
                        <div className="roster-strip">
                            {ALL_FIGHTERS.map((cls, idx) => {
                                const d = CLASS_DISPLAY[cls];
                                const isSelected = selectedClass === cls;
                                return (
                                    <motion.div
                                        key={cls}
                                        className={`roster-slot ${isSelected ? 'roster-slot-selected' : ''}`}
                                        style={{
                                            borderColor: isSelected ? d.color : '#333',
                                            boxShadow: isSelected ? `0 0 12px ${d.color}60` : 'none',
                                        }}
                                        onClick={() => {
                                            if (!waitingForOpponent) setSelectedClass(cls);
                                        }}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <FighterSpritePreview fighterClass={cls} size={48} />
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Selected fighter detail */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={selectedClass}
                                className="fighter-detail"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="fighter-detail-sprite">
                                    <FighterSpritePreview fighterClass={selectedClass} size={160} />
                                </div>
                                <div className="fighter-detail-info">
                                    <h2
                                        className="fighter-name"
                                        style={{ color: display.color, textShadow: `0 0 10px ${display.color}80` }}
                                    >
                                        {display.name}
                                    </h2>
                                    <p className="fighter-desc">{display.description}</p>
                                    <div className="stat-bars">
                                        <StatBar label="HEALTH" value={stats.maxHealth} max={130} color={display.color} />
                                        <StatBar label="POWER" value={stats.power * 100 / 1.8} max={100} color={display.color} />
                                        <StatBar label="SPEED" value={stats.punchSpeed * 100 / 1.6} max={100} color={display.color} />
                                        <StatBar label="DEFENSE" value={stats.defense * 100 / 1.4} max={100} color={display.color} />
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <button
                        className="carousel-arrow carousel-arrow-right"
                        onClick={() => navigate(1)}
                        disabled={waitingForOpponent}
                    >
                        ▶
                    </button>
                </div>

                <SelectActions
                    waiting={waitingForOpponent}
                    opponentReady={opponentReady}
                    onFight={handleFight}
                    onBack={handleBack}
                    isRematch={isRematch}
                />
            </motion.div>
        </div>
    );
}

function SelectActions({ waiting, opponentReady, onFight, onBack, isRematch }: {
    waiting: boolean;
    opponentReady: boolean;
    onFight: () => void;
    onBack: () => void;
    isRematch: boolean;
}) {
    return (
        <div className="select-actions">
            {!waiting && (
                <button className="neon-button neon-button-back" onClick={onBack}>
                    {isRematch ? 'LEAVE' : 'BACK'}
                </button>
            )}
            {waiting ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div className="lobby-status">
                        {opponentReady ? 'OPPONENT READY — STARTING...' : 'WAITING FOR OPPONENT...'}
                    </div>
                </div>
            ) : (
                <motion.button
                    className="neon-button neon-button-fight fight-button-large"
                    onClick={onFight}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    {isRematch ? 'READY!' : 'FIGHT!'}
                </motion.button>
            )}
        </div>
    );
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = Math.min(100, (value / max) * 100);

    return (
        <div className="stat-bar">
            <span className="stat-label">{label}</span>
            <div className="stat-track">
                <motion.div
                    className="stat-fill"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </div>
        </div>
    );
}
