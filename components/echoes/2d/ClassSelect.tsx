'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CLASSES, GameClass } from '@/lib/echoes/game2d/ClassStore';
import { useGameStore } from '@/lib/echoes/game2d/GameStore';

interface ClassSelectProps {
    onSelect: (cls: GameClass) => void;
}

const DIFFICULTY_COLOR: Record<string, string> = {
    Easy: 'text-green-400',
    Medium: 'text-yellow-400',
    Hard: 'text-red-400',
};

export default function ClassSelect({ onSelect }: ClassSelectProps) {
    const [hovered, setHovered] = useState<GameClass>(CLASSES[0]);
    const [selected, setSelected] = useState<GameClass | null>(null);
    const { setPhase } = useGameStore();

    const handleConfirm = () => {
        if (selected) onSelect(selected);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 gap-6"
        >
            {/* Back button */}
            <button
                onClick={() => setPhase('menu')}
                className="absolute top-5 left-5 flex items-center gap-2 text-white/40 hover:text-white text-sm font-mono transition-colors"
            >
                ← Back
            </button>

            <div className="text-center">
                <div className="text-white/30 text-xs font-mono tracking-[0.4em] uppercase mb-2">Choose Your Path</div>
                <h2 className="text-4xl font-black text-white">Select Class</h2>
            </div>

            {/* Class cards */}
            <div className="flex gap-3 flex-wrap justify-center">
                {CLASSES.map(cls => (
                    <motion.button
                        key={cls.id}
                        whileHover={{ scale: 1.04, y: -4 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setSelected(cls); setHovered(cls); }}
                        onMouseEnter={() => setHovered(cls)}
                        className={`relative w-36 h-44 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                            selected?.id === cls.id
                                ? 'border-white/60 bg-white/10'
                                : 'border-white/10 bg-white/5 hover:border-white/30'
                        }`}
                        style={selected?.id === cls.id ? { borderColor: cls.color, boxShadow: `0 0 20px ${cls.color}44` } : {}}
                    >
                        <span className="text-4xl">{cls.icon}</span>
                        <span className="text-white font-bold text-sm">{cls.name}</span>
                        <span className={`text-xs font-mono ${DIFFICULTY_COLOR[cls.difficulty]}`}>{cls.difficulty}</span>
                        {selected?.id === cls.id && (
                            <motion.div
                                layoutId="selected-ring"
                                className="absolute inset-0 rounded-2xl border-2 pointer-events-none"
                                style={{ borderColor: cls.color }}
                            />
                        )}
                    </motion.button>
                ))}
            </div>

            {/* Detail panel */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={hovered.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-2xl p-5 flex gap-6"
                >
                    {/* Left: stats */}
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="text-3xl">{hovered.icon}</span>
                            <div>
                                <div className="text-white font-black text-lg" style={{ color: hovered.color }}>{hovered.name}</div>
                                <div className="text-white/40 text-xs italic">{hovered.tagline}</div>
                            </div>
                        </div>
                        <p className="text-white/60 text-sm mb-4">{hovered.description}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                            {[
                                ['HP', hovered.maxHp],
                                ['Damage', hovered.stats.damage],
                                ['Fire Rate', hovered.stats.fireRate + '/s'],
                                ['Speed', hovered.stats.moveSpeed],
                                ['Crit', Math.round(hovered.stats.critChance * 100) + '%'],
                                ['Regen', hovered.stats.hpRegen + '/s'],
                            ].map(([label, val]) => (
                                <div key={String(label)} className="flex justify-between">
                                    <span className="text-white/40">{label}</span>
                                    <span className="text-white">{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: abilities */}
                    <div className="flex-1">
                        <div className="text-white/40 text-xs font-mono uppercase tracking-widest mb-2">Abilities</div>
                        <div className="flex flex-col gap-2">
                            {hovered.abilities.map(ab => (
                                <div key={ab.id} className="flex items-start gap-3 bg-white/5 rounded-lg p-2">
                                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                                        <span className="text-xl">{ab.icon}</span>
                                        <span className="text-white/30 text-xs font-mono">[{ab.key}]</span>
                                    </div>
                                    <div>
                                        <div className="text-white text-sm font-bold">{ab.name}</div>
                                        <div className="text-white/50 text-xs">{ab.description}</div>
                                        <div className="text-white/30 text-xs font-mono mt-0.5">{ab.cooldown}s cooldown</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Confirm */}
            <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                onClick={handleConfirm}
                disabled={!selected}
                className="px-12 py-3 font-bold text-white rounded-lg tracking-widest uppercase transition-all disabled:opacity-30"
                style={selected ? { backgroundColor: selected.color } : { backgroundColor: '#555' }}
            >
                {selected ? `Play as ${selected.name}` : 'Select a Class'}
            </motion.button>
        </motion.div>
    );
}
