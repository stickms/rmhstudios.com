'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, Plus, Star, Flame } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { toast } from 'sonner';
import type { MenuItem, Restaurant } from '@/lib/rmh-eats/types';

interface Result {
    restaurant: Restaurant;
    item: MenuItem;
}

export default function PriceComparePage() {
    const { addToCart, setView } = useEatsStore();
    const [query, setQuery] = useState('');

    const results: Result[] = useMemo(() => {
        if (query.trim().length < 2) return [];
        const q = query.toLowerCase();
        const matches: Result[] = [];
        for (const restaurant of mockRestaurants) {
            for (const item of restaurant.menu) {
                if (item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
                    matches.push({ restaurant, item });
                }
            }
        }
        return matches.sort((a, b) => a.item.price - b.item.price);
    }, [query]);

    const cheapestPrice = results[0]?.item.price;

    function handleAdd(result: Result) {
        addToCart(result.item, result.restaurant.id, result.restaurant.name, 1);
        toast.success(`${result.item.name} added to cart!`);
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => setView('home')}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white">Price Comparison</h2>
                    <p className="text-sm text-slate-400">Search a dish to compare prices across all restaurants</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder='Try "burger", "chicken", "pasta"...'
                    className="w-full rounded-2xl bg-slate-800 border border-slate-700 pl-10 pr-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500 transition-colors"
                />
            </div>

            {query.trim().length < 2 && (
                <div className="text-center py-16 text-slate-500">
                    <span className="text-5xl">🔍</span>
                    <p className="mt-4 font-medium text-slate-400">Type at least 2 characters to search</p>
                    <p className="text-sm mt-1">Compare dishes across all {mockRestaurants.length} restaurants</p>
                </div>
            )}

            {query.trim().length >= 2 && results.length === 0 && (
                <div className="text-center py-16 text-slate-500">
                    <span className="text-5xl">😔</span>
                    <p className="mt-4 font-medium text-slate-400">No dishes found for "{query}"</p>
                    <p className="text-sm mt-1">Try a different search term</p>
                </div>
            )}

            {results.length > 0 && (
                <>
                    <p className="text-xs text-slate-500 mb-3">
                        {results.length} result{results.length !== 1 ? 's' : ''} · sorted by price (lowest first)
                    </p>
                    <div className="space-y-3">
                        {results.map(({ restaurant, item }, i) => {
                            const isCheapest = item.price === cheapestPrice;
                            return (
                                <motion.div
                                    key={`${restaurant.id}-${item.id}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className={`flex items-center gap-3 rounded-2xl p-4 border transition-colors ${
                                        isCheapest
                                            ? 'bg-green-500/5 border-green-500/30'
                                            : 'bg-slate-800/50 border-slate-700/50'
                                    }`}
                                >
                                    <div className="h-12 w-12 shrink-0 rounded-xl bg-slate-700 flex items-center justify-center text-2xl">
                                        {item.image}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                                            {isCheapest && (
                                                <span className="rounded-full bg-green-500/20 border border-green-500/30 px-2 py-0.5 text-xs font-medium text-green-400 shrink-0">
                                                    Best Value
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5 truncate">{restaurant.name}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <Flame className="h-3 w-3 text-orange-400" />
                                                {item.calories} cal
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Star className="h-3 w-3 text-yellow-400 fill-current" />
                                                {restaurant.rating}
                                            </span>
                                            {item.vegetarian && <span className="text-green-400">🌿 Veg</span>}
                                            {item.spicy && <span className="text-red-400">🌶️ Spicy</span>}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-lg font-bold text-orange-400">${item.price.toFixed(2)}</p>
                                        <button
                                            onClick={() => handleAdd({ restaurant, item })}
                                            className="mt-1 flex items-center gap-1 rounded-lg bg-orange-500 hover:bg-orange-400 px-2.5 py-1.5 text-xs font-medium text-white transition-colors"
                                        >
                                            <Plus className="h-3 w-3" />
                                            Add
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
