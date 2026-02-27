'use client';

import { useGameStore } from '@/lib/echoes/game2d/GameStore';
import { motion, AnimatePresence } from 'framer-motion';

// ─── HUD ─────────────────────────────────────────────────────────────────────
export function GameHUD() {
    const { hp, maxHp, xp, level, kills, timeSurvived, wave, xpToNextLevel, stats } = useGameStore();
    const xpNeeded = xpToNextLevel();
    const mins = Math.floor(timeSurvived / 60).toString().padStart(2, '0');
    const secs = Math.floor(timeSurvived % 60).toString().padStart(2, '0');

    return (
        <div className="absolute inset-0 pointer-events-none select-none">
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 md:px-6 md:py-3 bg-black/60 backdrop-blur-sm transition-all">
                {/* HP */}
                <div className="flex flex-col gap-1 w-32 md:w-48 transition-all">
                    <div className="flex justify-between text-[10px] md:text-xs text-white/70 font-mono">
                        <span>HP</span>
                        <span>{Math.ceil(hp)} / {maxHp}</span>
                    </div>
                    <div className="h-2 md:h-3 bg-white/10 rounded-full overflow-hidden transition-all">
                        <motion.div
                            className="h-full rounded-full"
                            style={{
                                background: hp / maxHp > 0.5 ? '#22cc44' : hp / maxHp > 0.25 ? '#ffaa00' : '#ff2244',
                                width: `${(hp / maxHp) * 100}%`
                            }}
                            animate={{ width: `${(hp / maxHp) * 100}%` }}
                            transition={{ duration: 0.1 }}
                        />
                    </div>
                </div>

                {/* Center info */}
                <div className="flex flex-col items-center gap-0.5">
                    <div className="text-white font-mono text-lg md:text-xl font-bold tracking-widest transition-all">{mins}:{secs}</div>
                    <div className="text-white/50 text-[10px] md:text-xs font-mono">WAVE {wave}</div>
                </div>

                {/* Kills */}
                <div className="flex flex-col items-end gap-0.5">
                    <div className="text-white font-bold text-base md:text-lg font-mono transition-all">{kills}</div>
                    <div className="text-white/50 text-[10px] md:text-xs font-mono">KILLS</div>
                </div>
            </div>

            {/* XP Bar + Level */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-3 py-2 md:px-6 md:py-3 bg-black/60 backdrop-blur-sm transition-all">
                <div className="text-neon-purple font-bold text-xs md:text-sm font-mono w-12 md:w-16 whitespace-nowrap">LVL {level}</div>
                <div className="flex-1 h-2 md:h-3 bg-white/10 rounded-full overflow-hidden transition-all">
                    <motion.div
                        className="h-full rounded-full bg-linear-to-r from-purple-600 to-pink-500"
                        animate={{ width: `${(xp / xpNeeded) * 100}%` }}
                        transition={{ duration: 0.2 }}
                    />
                </div>
                <div className="text-white/50 text-[10px] md:text-xs font-mono w-20 md:w-24 text-right whitespace-nowrap">{xp} / {xpNeeded} XP</div>
            </div>

            {/* Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-6 h-6">
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/60 -translate-y-1/2" />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/60 -translate-x-1/2" />
                    <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 border border-white/60 rounded-full -translate-x-1/2 -translate-y-1/2" />
                </div>
            </div>
        </div>
    );
}

// ─── Upgrade Picker ───────────────────────────────────────────────────────────
export function UpgradePicker() {
    const { phase, upgradeChoices, pickUpgrade, level } = useGameStore();

    return (
        <AnimatePresence>
            {phase === 'upgrading' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-40 overflow-y-auto py-8"
                >
                    <motion.div
                        initial={{ y: -30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-center mb-8 shrink-0"
                    >
                        <div className="text-yellow-400 text-xs font-mono tracking-[0.3em] uppercase mb-1">Level Up!</div>
                        <div className="text-white text-3xl font-black">Level {level}</div>
                        <div className="text-white/50 text-sm mt-1">Choose an upgrade</div>
                    </motion.div>

                    <div className="flex flex-col md:flex-row gap-4 px-4 w-full max-w-4xl justify-center items-stretch md:items-center shrink-0 pb-8">
                        {upgradeChoices.map((upgrade, i) => (
                            <motion.button
                                key={upgrade.id}
                                initial={{ y: 30, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.15 + i * 0.08 }}
                                onClick={() => pickUpgrade(upgrade)}
                                className="group flex-1 md:w-52 p-5 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500 hover:bg-purple-500/10 transition-all text-left cursor-pointer flex flex-row md:flex-col items-center md:items-start gap-4 md:gap-0"
                            >
                                <div className="text-3xl md:text-4xl md:mb-3">{upgrade.icon}</div>
                                <div>
                                    <div className="text-white font-bold text-base mb-1">{upgrade.name}</div>
                                    <div className="text-white/60 text-sm leading-relaxed">{upgrade.description}</div>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

