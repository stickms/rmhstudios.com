'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { CLASS_DISPLAY, CLASS_STATS } from '@/lib/kowloon-knockout/game/fighters/stats';
import type { FighterClass } from '@/lib/kowloon-knockout/game/fighters/types';

const CLASSES: FighterClass[] = ['power', 'speed', 'resistance'];

function pickOpponent(): FighterClass {
    return CLASSES[Math.floor(Math.random() * CLASSES.length)];
}

export default function CharacterSelect() {
    const { selectedClass, setSelectedClass, setOpponentClass, setPhase, isMultiplayer, resetMultiplayer } = useGameStore();

    const handleFight = () => {
        if (isMultiplayer) {
            setPhase('lobby');
        } else {
            setOpponentClass(pickOpponent());
            setPhase('fight');
        }
    };

    const handleBack = () => {
        resetMultiplayer();
        setPhase('menu');
    };

    return (
        <div className="select-container">
            <motion.h1
                className="select-title"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                CHOOSE YOUR FIGHTER
            </motion.h1>

            <div className="fighters-row">
                {CLASSES.map((cls, idx) => {
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

                            <div className="stat-bars">
                                <StatBar label="HEALTH" value={stats.maxHealth} max={130} color={display.color} />
                                <StatBar label="POWER" value={stats.power * 100 / 1.5} max={100} color={display.color} />
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

            <motion.div
                className="select-actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
            >
                <button
                    className="neon-button neon-button-back"
                    onClick={handleBack}
                >
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
            </motion.div>
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
