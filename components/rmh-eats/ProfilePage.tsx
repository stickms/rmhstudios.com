'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trophy, BookmarkCheck, Leaf, Trash2, ShoppingBag, Flame, Sparkles, ChevronRight } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { getMealRecommendations } from '@/lib/rmh-eats/recommendations';
import { toast } from 'sonner';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-slate-600'}`}
        >
            <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
            />
        </button>
    );
}

export default function ProfilePage() {
    const {
        loyaltyPoints, orders, savedOrders, cart, cartRestaurantId,
        deleteSavedOrder, loadSavedOrder, saveCurrentCart,
        dietFilters, setDietFilter, calorieBudget, setCalorieBudget,
        setView,
    } = useEatsStore();

    const [showSaveForm, setShowSaveForm] = useState(false);
    const [saveLabel, setSaveLabel] = useState('');
    const [showRecs, setShowRecs] = useState(false);
    const [calorieInput, setCalorieInput] = useState(calorieBudget?.toString() ?? '');

    const recommendations = showRecs
        ? getMealRecommendations(orders, mockRestaurants, calorieBudget)
        : [];

    const totalSpent = orders.reduce((s, o) => s + o.total, 0);
    const pointsToNextReward = 100 - (loyaltyPoints % 100);

    function handleSaveCart() {
        if (!saveLabel.trim()) {
            toast.error('Please enter a name for this order');
            return;
        }
        saveCurrentCart(saveLabel.trim());
        setSaveLabel('');
        setShowSaveForm(false);
        toast.success('Order saved!');
    }

    function handleLoadSaved(id: string) {
        loadSavedOrder(id);
        setView('home');
        toast.success('Items added to cart!');
    }

    function handleSetBudget() {
        const n = parseInt(calorieInput);
        if (isNaN(n) || n < 100) {
            toast.error('Enter a valid calorie target (min 100)');
            return;
        }
        setCalorieBudget(n);
        toast.success(`Calorie budget set to ${n} cal/day`);
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
                <h2 className="text-xl font-bold text-white">Profile</h2>
            </div>

            {/* Loyalty Points */}
            <div className="rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-5 w-5 text-orange-400" />
                    <h3 className="font-semibold text-white">Loyalty Points</h3>
                </div>
                <div className="flex items-end gap-2 mb-3">
                    <span className="text-4xl font-bold text-orange-400">{loyaltyPoints}</span>
                    <span className="text-slate-400 mb-1">pts</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                    <div
                        className="h-2 rounded-full bg-orange-500 transition-all"
                        style={{ width: `${((loyaltyPoints % 100) / 100) * 100}%` }}
                    />
                </div>
                <p className="text-xs text-slate-400">
                    {pointsToNextReward} pts until your next $1.00 reward · ${Math.floor(loyaltyPoints / 100).toFixed(2)} redeemable
                </p>
                <p className="text-xs text-slate-500 mt-2">
                    ${totalSpent.toFixed(2)} lifetime spent · {orders.length} orders
                </p>
                <p className="text-xs text-slate-500 mt-1">Redeem at checkout — 100 pts = $1.00 off</p>
            </div>

            {/* Dietary Preferences */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Leaf className="h-5 w-5 text-green-400" />
                    <h3 className="font-semibold text-white">Dietary Preferences</h3>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                    Active filters apply across the whole app — restaurant cards and menus will be filtered automatically.
                </p>
                <div className="space-y-3">
                    {([
                        { key: 'vegetarian' as const, label: '🌿 Vegetarian', desc: 'Show only vegetarian options' },
                        { key: 'vegan' as const, label: '🌱 Vegan', desc: 'Show only vegan options' },
                        { key: 'spicy' as const, label: '🌶️ Spicy', desc: 'Show only spicy dishes' },
                    ]).map(({ key, label, desc }) => (
                        <div key={key} className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-white font-medium">{label}</p>
                                <p className="text-xs text-slate-500">{desc}</p>
                            </div>
                            <Toggle checked={dietFilters[key]} onChange={(v) => setDietFilter(key, v)} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Calorie Budget */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Flame className="h-5 w-5 text-orange-400" />
                    <h3 className="font-semibold text-white">Daily Calorie Budget</h3>
                </div>
                {calorieBudget && (
                    <p className="text-sm text-green-400 mb-3">
                        Current budget: <strong>{calorieBudget} cal/day</strong>
                    </p>
                )}
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={calorieInput}
                        onChange={(e) => setCalorieInput(e.target.value)}
                        placeholder="e.g. 2000"
                        className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500"
                    />
                    <button
                        onClick={handleSetBudget}
                        className="rounded-xl bg-orange-500 hover:bg-orange-400 px-4 py-2 text-sm font-medium text-white transition-colors"
                    >
                        Set
                    </button>
                    {calorieBudget && (
                        <button
                            onClick={() => { setCalorieBudget(null); setCalorieInput(''); }}
                            className="rounded-xl bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
                <button
                    onClick={() => setView('calorie-planner')}
                    className="mt-3 flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                    Open Calorie Planner <ChevronRight className="h-3 w-3" />
                </button>
            </div>

            {/* Saved Orders */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <BookmarkCheck className="h-5 w-5 text-blue-400" />
                        <h3 className="font-semibold text-white">Saved Orders</h3>
                    </div>
                    {cart.length > 0 && cartRestaurantId && !showSaveForm && (
                        <button
                            onClick={() => setShowSaveForm(true)}
                            className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                        >
                            + Save current cart
                        </button>
                    )}
                </div>

                <AnimatePresence>
                    {showSaveForm && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-4 overflow-hidden"
                        >
                            <div className="flex gap-2">
                                <input
                                    autoFocus
                                    value={saveLabel}
                                    onChange={(e) => setSaveLabel(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCart()}
                                    placeholder='Name (e.g. "My usual sushi")'
                                    className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500"
                                />
                                <button
                                    onClick={handleSaveCart}
                                    className="rounded-xl bg-orange-500 hover:bg-orange-400 px-3 py-2 text-sm font-medium text-white transition-colors"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => setShowSaveForm(false)}
                                    className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {savedOrders.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-sm">
                        <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>No saved orders yet.</p>
                        <p className="text-xs mt-1">Build a cart and save it for quick reordering.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {savedOrders.map((so) => (
                            <div key={so.id} className="flex items-center gap-3 rounded-xl bg-slate-900/50 p-3 border border-slate-700/30">
                                <span className="text-2xl">{so.restaurantImage}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{so.label}</p>
                                    <p className="text-xs text-slate-400 truncate">{so.restaurantName} · {so.items.length} item{so.items.length !== 1 ? 's' : ''}</p>
                                </div>
                                <button
                                    onClick={() => handleLoadSaved(so.id)}
                                    className="rounded-lg bg-orange-500 hover:bg-orange-400 px-2.5 py-1.5 text-xs font-medium text-white transition-colors flex-shrink-0"
                                >
                                    Load
                                </button>
                                <button
                                    onClick={() => deleteSavedOrder(so.id)}
                                    className="text-slate-500 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* AI Recommendations */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-400" />
                        <h3 className="font-semibold text-white">AI Meal Suggestions</h3>
                    </div>
                    <button
                        onClick={() => setShowRecs(!showRecs)}
                        className="rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors"
                    >
                        {showRecs ? 'Hide' : 'Suggest a meal'}
                    </button>
                </div>

                <AnimatePresence>
                    {showRecs && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            {recommendations.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">
                                    Place a few orders first to get personalized recommendations!
                                </p>
                            ) : (
                                <div className="space-y-3 pt-1">
                                    {recommendations.map((rec, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.08 }}
                                            className="flex items-center gap-3 rounded-xl bg-purple-500/10 border border-purple-500/20 p-3 cursor-pointer hover:border-purple-500/40 transition-colors"
                                            onClick={() => { useEatsStore.getState().selectRestaurant(rec.restaurant.id); }}
                                        >
                                            <span className="text-2xl flex-shrink-0">{rec.restaurant.image}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-purple-300">{rec.reason}</p>
                                                <p className="text-sm text-white font-semibold">{rec.items[0]?.name}</p>
                                                <p className="text-xs text-slate-400">{rec.restaurant.name} · ${rec.items[0]?.price.toFixed(2)}</p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
