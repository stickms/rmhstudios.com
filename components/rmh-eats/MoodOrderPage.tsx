'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';

const MOODS = [
    { emoji: '🤗', label: 'Comfort Food', desc: 'Cozy classics to warm the soul', cuisines: ['American', 'Chinese'] },
    { emoji: '🌍', label: 'Adventurous', desc: 'Try something new and bold', cuisines: ['Indian', 'Mediterranean'] },
    { emoji: '🥗', label: 'Light & Clean', desc: 'Fresh, nourishing, and healthy', cuisines: ['Healthy'] },
    { emoji: '🌶️', label: 'Turn Up the Heat', desc: 'Fiery dishes with serious kick', cuisines: ['Mexican', 'Indian'] },
    { emoji: '🕯️', label: 'Date Night', desc: 'Treat yourself to something special', cuisines: ['Italian', 'Japanese'] },
    { emoji: '⚡', label: 'Quick Fix', desc: 'Fast, satisfying, no fuss', cuisines: ['American', 'Mexican'] },
    { emoji: '🌿', label: 'Plant-Based', desc: 'All the greens, all the goodness', cuisines: ['Healthy', 'Mediterranean'] },
];

export default function MoodOrderPage() {
    const { setMoodFilter, setView } = useEatsStore();

    function handleMood(cuisines: string[]) {
        setMoodFilter(cuisines[0]);
    }

    return (
        <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => setView('home')}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white">What's your mood?</h2>
                    <p className="text-sm text-slate-400">We'll find the perfect restaurant for you</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {MOODS.map((mood, i) => (
                    <motion.button
                        key={mood.label}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleMood(mood.cuisines)}
                        className={`flex flex-col items-center gap-2 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5 hover:border-orange-500/50 hover:bg-slate-800 transition-all text-center ${
                            i === MOODS.length - 1 && MOODS.length % 2 !== 0 ? 'col-span-2 max-w-xs mx-auto w-full' : ''
                        }`}
                    >
                        <span className="text-5xl">{mood.emoji}</span>
                        <p className="font-semibold text-white text-sm">{mood.label}</p>
                        <p className="text-xs text-slate-400 leading-snug">{mood.desc}</p>
                        <div className="flex flex-wrap gap-1 justify-center mt-1">
                            {mood.cuisines.map((c) => (
                                <span key={c} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                                    {c}
                                </span>
                            ))}
                        </div>
                    </motion.button>
                ))}
            </div>

            <p className="text-center text-xs text-slate-500 mt-6">
                Tap a mood to filter restaurants on the home page
            </p>
        </div>
    );
}
