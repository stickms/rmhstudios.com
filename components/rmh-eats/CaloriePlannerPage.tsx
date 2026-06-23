'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Flame, TrendingDown, ChevronRight } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

function isToday(dateStr: string): boolean {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
}

export default function CaloriePlannerPage() {
    const { t } = useTranslation('c-rmh-eats');
    const { orders, calorieBudget, setCalorieBudget, selectRestaurant, setView } = useEatsStore();
    const [inputValue, setInputValue] = useState(calorieBudget?.toString() ?? '');

    const todayCalories = useMemo(() => {
        return orders
            .filter((o) => o.status === 'delivered' && isToday(o.placedAt))
            .reduce((sum, order) => {
                return sum + order.items.reduce((s, item) => {
                    const menuItem = mockRestaurants
                        .find((r) => r.id === order.restaurantId)
                        ?.menu.find((m) => m.id === item.menuItemId);
                    return s + (menuItem?.calories ?? item.calories ?? 0) * item.quantity;
                }, 0);
            }, 0);
    }, [orders]);

    const remaining = calorieBudget ? calorieBudget - todayCalories : null;
    const progressPct = calorieBudget ? Math.min(100, (todayCalories / calorieBudget) * 100) : 0;

    const withinBudgetItems = useMemo(() => {
        if (!remaining || remaining <= 0) return [];
        const results: { restaurantId: string; restaurantName: string; restaurantImage: string; item: typeof mockRestaurants[0]['menu'][0] }[] = [];
        for (const restaurant of mockRestaurants) {
            for (const item of restaurant.menu) {
                if (item.calories <= remaining) {
                    results.push({
                        restaurantId: restaurant.id,
                        restaurantName: restaurant.name,
                        restaurantImage: restaurant.image,
                        item,
                    });
                }
            }
        }
        return results.sort((a, b) => b.item.calories - a.item.calories).slice(0, 20);
    }, [remaining]);

    function handleSet() {
        const n = parseInt(inputValue);
        if (isNaN(n) || n < 100) {
            toast.error(t('invalid-calorie-target', { defaultValue: 'Please enter a valid calorie target (min 100)' }));
            return;
        }
        setCalorieBudget(n);
        toast.success(t('budget-set-success', { n, defaultValue: 'Daily calorie budget set to {{n}} cal' }));
    }

    return (
        <div className="max-w-lg mx-auto space-y-5 pb-8">
            <div className="flex items-center gap-3 mb-2">
                <button
                    onClick={() => setView('home')}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white">{t('calorie-planner', { defaultValue: 'Calorie Planner' })}</h2>
                    <p className="text-sm text-slate-400">{t('track-daily-intake', { defaultValue: 'Track your daily calorie intake' })}</p>
                </div>
            </div>

            {/* Budget setter */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Flame className="h-5 w-5 text-orange-400" />
                    <h3 className="font-semibold text-white">{t('daily-budget', { defaultValue: 'Daily Budget' })}</h3>
                </div>
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSet()}
                        placeholder="e.g. 2000"
                        className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500"
                    />
                    <span className="flex items-center text-sm text-slate-400 pr-1">{t('cal-unit', { defaultValue: 'cal' })}</span>
                    <button
                        onClick={handleSet}
                        className="rounded-xl bg-orange-500 hover:bg-orange-400 px-4 py-2.5 text-sm font-medium text-white transition-colors"
                    >
                        {t('set', { defaultValue: 'Set' })}
                    </button>
                    {calorieBudget && (
                        <button
                            onClick={() => { setCalorieBudget(null); setInputValue(''); }}
                            className="rounded-xl bg-slate-700 hover:bg-slate-600 px-3 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            {t('clear', { defaultValue: 'Clear' })}
                        </button>
                    )}
                </div>
            </div>

            {calorieBudget && (
                <>
                    {/* Progress */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5"
                    >
                        <h3 className="font-semibold text-white mb-4">{t('todays-progress', { defaultValue: "Today's Progress" })}</h3>

                        {/* Big numbers */}
                        <div className="flex justify-between items-end mb-3">
                            <div>
                                <p className="text-xs text-slate-400">{t('consumed', { defaultValue: 'Consumed' })}</p>
                                <p className="text-3xl font-bold text-orange-400">{todayCalories}</p>
                                <p className="text-xs text-slate-500">{t('of-cal', { calorieBudget, defaultValue: 'of {{calorieBudget}} cal' })}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400">{t('remaining', { defaultValue: 'Remaining' })}</p>
                                <p className={`text-3xl font-bold ${remaining! > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {Math.max(0, remaining!)}
                                </p>
                                <p className="text-xs text-slate-500">{t('cal-left', { defaultValue: 'cal left' })}</p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-700 rounded-full h-3 mb-2 overflow-hidden">
                            <motion.div
                                className={`h-3 rounded-full ${progressPct >= 100 ? 'bg-red-500' : progressPct >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                        </div>
                        <p className="text-xs text-slate-500 text-right">{t('pct-used', { pct: progressPct.toFixed(0), defaultValue: '{{pct}}% used' })}</p>

                        {progressPct >= 100 && (
                            <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                                {t('budget-reached-today', { defaultValue: "You've reached your daily calorie budget for today." })}
                            </div>
                        )}
                        {todayCalories === 0 && (
                            <p className="text-xs text-slate-500 mt-2">
                                {t('no-orders-today', { defaultValue: 'No delivered orders today yet — your intake will appear here.' })}
                            </p>
                        )}
                    </motion.div>

                    {/* Browse within budget */}
                    {remaining! > 0 && withinBudgetItems.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <TrendingDown className="h-5 w-5 text-green-400" />
                                <h3 className="font-semibold text-white">{t('browse-within-budget', { defaultValue: 'Browse Within Budget' })}</h3>
                                <span className="text-xs text-slate-400">({t('cal-remaining', { remaining, defaultValue: '{{remaining}} cal remaining' })})</span>
                            </div>
                            <div className="space-y-2">
                                {withinBudgetItems.map(({ restaurantId, restaurantName, restaurantImage, item }, i) => (
                                    <motion.div
                                        key={`${restaurantId}-${item.id}`}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="flex items-center gap-3 rounded-xl bg-slate-900/50 border border-slate-700/30 p-3 cursor-pointer hover:border-green-500/30 transition-colors"
                                        onClick={() => selectRestaurant(restaurantId)}
                                    >
                                        <span className="text-xl">{item.image}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate font-medium">{item.name}</p>
                                            <p className="text-xs text-slate-400">{restaurantImage} {restaurantName}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-xs font-semibold text-green-400">{item.calories} cal</p>
                                            <p className="text-xs text-slate-500">${item.price.toFixed(2)}</p>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {remaining! <= 0 && (
                        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-5 text-center">
                            <span className="text-4xl">🚫</span>
                            <p className="font-semibold text-red-400 mt-3">{t('budget-reached', { defaultValue: 'Budget Reached' })}</p>
                            <p className="text-sm text-slate-400 mt-1">
                                {t('budget-hit-resets-tomorrow', { calorieBudget, defaultValue: "You've hit your {{calorieBudget}} cal daily budget. Your budget resets tomorrow." })}
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
