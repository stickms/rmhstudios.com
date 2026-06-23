'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEatsStore } from '@/lib/store/useEatsStore';

const MOODS = [
    { emoji: '🤗', labelKey: 'mood-comfort-food', labelDefault: 'Comfort Food', descKey: 'mood-comfort-food-desc', descDefault: 'Cozy classics to warm the soul', cuisines: ['American', 'Chinese'] },
    { emoji: '🌍', labelKey: 'mood-adventurous', labelDefault: 'Adventurous', descKey: 'mood-adventurous-desc', descDefault: 'Try something new and bold', cuisines: ['Indian', 'Mediterranean'] },
    { emoji: '🥗', labelKey: 'mood-light-clean', labelDefault: 'Light & Clean', descKey: 'mood-light-clean-desc', descDefault: 'Fresh, nourishing, and healthy', cuisines: ['Healthy'] },
    { emoji: '🌶️', labelKey: 'mood-turn-up-heat', labelDefault: 'Turn Up the Heat', descKey: 'mood-turn-up-heat-desc', descDefault: 'Fiery dishes with serious kick', cuisines: ['Mexican', 'Indian'] },
    { emoji: '🕯️', labelKey: 'mood-date-night', labelDefault: 'Date Night', descKey: 'mood-date-night-desc', descDefault: 'Treat yourself to something special', cuisines: ['Italian', 'Japanese'] },
    { emoji: '⚡', labelKey: 'mood-quick-fix', labelDefault: 'Quick Fix', descKey: 'mood-quick-fix-desc', descDefault: 'Fast, satisfying, no fuss', cuisines: ['American', 'Mexican'] },
    { emoji: '🌿', labelKey: 'mood-plant-based', labelDefault: 'Plant-Based', descKey: 'mood-plant-based-desc', descDefault: 'All the greens, all the goodness', cuisines: ['Healthy', 'Mediterranean'] },
];

export default function MoodOrderPage() {
    const { t } = useTranslation("c-rmh-eats");
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
                    <h2 className="text-xl font-bold text-white">{t("whats-your-mood", { defaultValue: "What's your mood?" })}</h2>
                    <p className="text-sm text-slate-400">{t("mood-subtitle", { defaultValue: "We'll find the perfect restaurant for you" })}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {MOODS.map((mood, i) => (
                    <motion.button
                        key={mood.labelKey}
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
                        <p className="font-semibold text-white text-sm">{t(mood.labelKey, { defaultValue: mood.labelDefault })}</p>
                        <p className="text-xs text-slate-400 leading-snug">{t(mood.descKey, { defaultValue: mood.descDefault })}</p>
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
                {t("mood-filter-hint", { defaultValue: "Tap a mood to filter restaurants on the home page" })}
            </p>
        </div>
    );
}
