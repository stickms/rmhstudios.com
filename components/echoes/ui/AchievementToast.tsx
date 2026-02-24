'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAchievementStore } from '@/lib/echoes/campaign/AchievementStore';

export default function AchievementToast() {
    const { recentlyUnlocked, clearRecent } = useAchievementStore();

    useEffect(() => {
        if (recentlyUnlocked) {
            const timer = setTimeout(clearRecent, 4000);
            return () => clearTimeout(timer);
        }
    }, [recentlyUnlocked, clearRecent]);

    return (
        <AnimatePresence>
            {recentlyUnlocked && (
                <motion.div
                    key={recentlyUnlocked.id}
                    initial={{ x: 400, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 400, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed top-6 right-6 z-100 pointer-events-none"
                >
                    <div className="flex items-center gap-3 bg-black/90 border border-yellow-400/60 rounded-lg px-4 py-3 shadow-2xl backdrop-blur-md min-w-[280px]">
                        {/* Gold accent bar */}
                        <div className="w-1 h-12 bg-linear-to-b from-yellow-300 to-yellow-600 rounded-full shrink-0" />

                        {/* Icon */}
                        <div className="text-3xl shrink-0">{recentlyUnlocked.icon}</div>

                        {/* Text */}
                        <div className="flex flex-col">
                            <span className="text-yellow-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                                Achievement Unlocked · {recentlyUnlocked.points}pts
                            </span>
                            <span className="text-white font-bold text-sm leading-tight">
                                {recentlyUnlocked.title}
                            </span>
                            <span className="text-white/60 text-xs leading-tight mt-0.5">
                                {recentlyUnlocked.description}
                            </span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
