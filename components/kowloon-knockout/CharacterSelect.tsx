'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { CLASS_DISPLAY, CLASS_STATS, ORDER_SUBCLASSES } from '@/lib/kowloon-knockout/game/fighters/stats';
import type { FighterClass } from '@/lib/kowloon-knockout/game/fighters/types';

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
    const { selectedClass, setSelectedClass, setOpponentClass, setPhase, isMultiplayer, resetMultiplayer } = useGameStore();
    const [step, setStep] = useState<'order' | 'subclass'>('order');
    const [selectedOrder, setSelectedOrder] = useState<FighterClass | null>(null);

    const handleOrderSelect = (cls: FighterClass) => {
        const subclasses = ORDER_SUBCLASSES[cls];
        if (subclasses) {
            // This order has subclasses — select the order and show subclass step
            setSelectedOrder(cls);
            setSelectedClass(subclasses[0]); // default to first subclass
            setStep('subclass');
        } else {
            // No subclasses — select directly
            setSelectedOrder(null);
            setSelectedClass(cls);
        }
    };

    const handleFight = () => {
        if (isMultiplayer) {
            setPhase('lobby');
        } else {
            setOpponentClass(pickOpponent(ALL_FIGHTER_CLASSES));
            setPhase('fight');
        }
    };

    const handleBack = () => {
        if (step === 'subclass') {
            setStep('order');
            setSelectedOrder(null);
            setSelectedClass('power');
            return;
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
                        <h1 className="select-title">CHOOSE YOUR ORDER</h1>

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

                        <div className="select-actions">
                            <button className="neon-button neon-button-back" onClick={handleBack}>
                                BACK
                            </button>
                            {selectedClass && !selectedOrder && !ORDER_SUBCLASSES[selectedClass] && (
                                <motion.button
                                    className="neon-button neon-button-fight fight-button-large"
                                    onClick={handleFight}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    FIGHT!
                                </motion.button>
                            )}
                        </div>
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
                                        onClick={() => setSelectedClass(cls)}
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

                        <div className="select-actions">
                            <button className="neon-button neon-button-back" onClick={handleBack}>
                                BACK
                            </button>
                            <motion.button
                                className="neon-button neon-button-fight fight-button-large"
                                onClick={handleFight}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                FIGHT!
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
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
