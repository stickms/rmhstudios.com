'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { CLASS_DISPLAY, CLASS_STATS, ORDER_SUBCLASSES } from '@/lib/kowloon-knockout/game/fighters/stats';
import { networkClient } from '@/lib/kowloon-knockout/network/client';
import type { FighterClass } from '@/lib/kowloon-knockout/game/fighters/types';
import type { ServerMessage } from '@/lib/kowloon-knockout/network/types';

const ORDERS: FighterClass[] = ['power', 'speed', 'resistance'];

function pickOpponent(allClasses: FighterClass[]): FighterClass {
    return allClasses[Math.floor(Math.random() * allClasses.length)];
}

// All selectable fighter classes (orders without subclasses + all subclasses)
const ALL_FIGHTER_CLASSES: FighterClass[] = [
    ...ORDERS.filter(o => !ORDER_SUBCLASSES[o]),
    ...Object.values(ORDER_SUBCLASSES).flat() as FighterClass[],
];

export default function CharacterSelect() {
    const {
        selectedClass, setSelectedClass, setOpponentClass, setPhase,
        isMultiplayer, resetMultiplayer, setIsHost, setConnectionStatus,
    } = useGameStore();
    const [step, setStep] = useState<'order' | 'subclass'>('order');
    const [selectedOrder, setSelectedOrder] = useState<FighterClass | null>(null);
    const [waitingForOpponent, setWaitingForOpponent] = useState(false);
    const [opponentReady, setOpponentReady] = useState(false);
    const cleanupRef = useRef(false);

    // Whether we're in a rematch (multiplayer + already connected)
    const isRematch = isMultiplayer && networkClient.connected;

    // Listen for rematch events when in rematch mode
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

    const handleOrderSelect = (cls: FighterClass) => {
        if (waitingForOpponent) return;
        const subclasses = ORDER_SUBCLASSES[cls];
        if (subclasses) {
            setSelectedOrder(cls);
            setSelectedClass(subclasses[0]);
            setStep('subclass');
        } else {
            setSelectedOrder(null);
            setSelectedClass(cls);
        }
    };

    const handleFight = () => {
        if (isRematch) {
            // Send fighter selection and wait for opponent
            networkClient.fighterReady(selectedClass);
            setWaitingForOpponent(true);
        } else if (isMultiplayer) {
            setPhase('lobby');
        } else {
            setOpponentClass(pickOpponent(ALL_FIGHTER_CLASSES));
            setPhase('fight');
        }
    };

    const handleBack = () => {
        if (waitingForOpponent) return;
        if (step === 'subclass') {
            setStep('order');
            setSelectedOrder(null);
            setSelectedClass('power');
            return;
        }
        if (isRematch) {
            networkClient.disconnect();
            networkClient.clearHandlers();
        }
        resetMultiplayer();
        setPhase('menu');
    };

    return (
        <div className="select-container">
            <AnimatePresence mode="wait">
                {step === 'order' ? (
                    <motion.div
                        key="order-step"
                        className="select-step"
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.3 }}
                    >
                        <h1 className="select-title">
                            {isRematch ? 'REMATCH — CHOOSE YOUR ORDER' : 'CHOOSE YOUR ORDER'}
                        </h1>

                        <div className="fighters-row">
                            {ORDERS.map((cls, idx) => {
                                const display = CLASS_DISPLAY[cls];
                                const stats = CLASS_STATS[cls];
                                const isSelected = selectedClass === cls && !selectedOrder;
                                const hasSubclasses = !!ORDER_SUBCLASSES[cls];

                                return (
                                    <motion.div
                                        key={cls}
                                        className={`fighter-card ${isSelected ? 'fighter-card-selected' : ''}`}
                                        style={{
                                            '--fighter-color': display.color,
                                            '--fighter-accent': display.accent,
                                        } as React.CSSProperties}
                                        onClick={() => handleOrderSelect(cls)}
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.15, duration: 0.5 }}
                                        whileHover={{ scale: 1.03, y: -5 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <div className="fighter-preview" style={{ borderColor: display.color }}>
                                            <div className="fighter-silhouette" style={{
                                                backgroundColor: display.color,
                                                boxShadow: `0 0 30px ${display.color}40`,
                                            }}>
                                                <div className="silhouette-head" />
                                                <div className="silhouette-body" />
                                                <div className="silhouette-arms" />
                                            </div>
                                        </div>

                                        <h2
                                            className="fighter-name"
                                            style={{ color: display.color, textShadow: `0 0 10px ${display.color}80` }}
                                        >
                                            {display.name}
                                        </h2>

                                        <p className="fighter-desc">{display.description}</p>

                                        {hasSubclasses && (
                                            <div className="subclass-badge">
                                                {ORDER_SUBCLASSES[cls]!.length} FIGHTERS
                                            </div>
                                        )}

                                        <div className="stat-bars">
                                            <StatBar label="HEALTH" value={stats.maxHealth} max={130} color={display.color} />
                                            <StatBar label="POWER" value={stats.power * 100 / 1.8} max={100} color={display.color} />
                                            <StatBar label="SPEED" value={stats.punchSpeed * 100 / 1.6} max={100} color={display.color} />
                                            <StatBar label="DEFENSE" value={stats.defense * 100 / 1.4} max={100} color={display.color} />
                                        </div>

                                        {isSelected && (
                                            <motion.div
                                                className="selected-indicator"
                                                style={{ backgroundColor: display.color }}
                                                layoutId="selected"
                                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                            >
                                                SELECTED
                                            </motion.div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>

                        <SelectActions
                            showFight={!!selectedClass && !selectedOrder && !ORDER_SUBCLASSES[selectedClass]}
                            waiting={waitingForOpponent}
                            opponentReady={opponentReady}
                            onFight={handleFight}
                            onBack={handleBack}
                            isRematch={isRematch}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="subclass-step"
                        className="select-step"
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 30 }}
                        transition={{ duration: 0.3 }}
                    >
                        <h1 className="select-title">
                            <span className="select-title-order" style={{
                                color: CLASS_DISPLAY[selectedOrder!].color,
                                textShadow: `0 0 10px ${CLASS_DISPLAY[selectedOrder!].color}80`,
                            }}>
                                {CLASS_DISPLAY[selectedOrder!].name}
                            </span>
                            {' — '}
                            CHOOSE YOUR FIGHTER
                        </h1>

                        <div className="fighters-row">
                            {ORDER_SUBCLASSES[selectedOrder!]!.map((cls, idx) => {
                                const display = CLASS_DISPLAY[cls];
                                const stats = CLASS_STATS[cls];
                                const isSelected = selectedClass === cls;

                                return (
                                    <motion.div
                                        key={cls}
                                        className={`fighter-card ${isSelected ? 'fighter-card-selected' : ''}`}
                                        style={{
                                            '--fighter-color': display.color,
                                            '--fighter-accent': display.accent,
                                        } as React.CSSProperties}
                                        onClick={() => { if (!waitingForOpponent) setSelectedClass(cls); }}
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.12, duration: 0.4 }}
                                        whileHover={{ scale: 1.03, y: -5 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <div className="fighter-preview" style={{ borderColor: display.color }}>
                                            <div className="fighter-silhouette" style={{
                                                backgroundColor: display.color,
                                                boxShadow: `0 0 30px ${display.color}40`,
                                            }}>
                                                <div className="silhouette-head" />
                                                <div className="silhouette-body" />
                                                <div className="silhouette-arms" />
                                            </div>
                                        </div>

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

                                        {isSelected && (
                                            <motion.div
                                                className="selected-indicator"
                                                style={{ backgroundColor: display.color }}
                                                layoutId="selected"
                                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                            >
                                                SELECTED
                                            </motion.div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>

                        <SelectActions
                            showFight={true}
                            waiting={waitingForOpponent}
                            opponentReady={opponentReady}
                            onFight={handleFight}
                            onBack={handleBack}
                            isRematch={isRematch}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SelectActions({ showFight, waiting, opponentReady, onFight, onBack, isRematch }: {
    showFight: boolean;
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
            ) : showFight ? (
                <motion.button
                    className="neon-button neon-button-fight fight-button-large"
                    onClick={onFight}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    {isRematch ? 'READY!' : 'FIGHT!'}
                </motion.button>
            ) : null}
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
