'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Star, Clock, Bike, X, Leaf, Heart, Zap, Smile, Shuffle } from 'lucide-react';
import { mockRestaurants, cuisineTypes } from '@/lib/rmh-eats/mockData';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { toast } from 'sonner';
import type { Restaurant } from '@/lib/rmh-eats/types';

function carbonColor(score: number) {
    if (score <= 3) return 'text-green-400';
    if (score <= 6) return 'text-yellow-400';
    return 'text-red-400';
}

function carbonLabel(score: number) {
    if (score <= 3) return 'Eco';
    if (score <= 6) return 'Moderate';
    return 'High CO₂';
}

export default function RestaurantsList() {
    const selectRestaurant = useEatsStore((s) => s.selectRestaurant);
    const setView = useEatsStore((s) => s.setView);
    const addToCart = useEatsStore((s) => s.addToCart);
    const dietFilters = useEatsStore((s) => s.dietFilters);
    const setDietFilter = useEatsStore((s) => s.setDietFilter);
    const recentlyViewedIds = useEatsStore((s) => s.recentlyViewedIds);
    const favoriteRestaurantIds = useEatsStore((s) => s.favoriteRestaurantIds);
    const toggleFavorite = useEatsStore((s) => s.toggleFavorite);
    const moodCuisineFilter = useEatsStore((s) => s.moodCuisineFilter);
    const setMoodFilter = useEatsStore((s) => s.setMoodFilter);

    const [search, setSearch] = useState('');
    const [selectedCuisine, setSelectedCuisine] = useState('All');
    const [fastestFirst, setFastestFirst] = useState(false);

    // Apply mood filter on mount / when it changes
    useEffect(() => {
        if (moodCuisineFilter) {
            setSelectedCuisine(moodCuisineFilter);
            setMoodFilter(null); // clear after consuming
        }
    }, [moodCuisineFilter, setMoodFilter]);

    const recentlyViewed = useMemo(
        () => recentlyViewedIds
            .map((id) => mockRestaurants.find((r) => r.id === id))
            .filter(Boolean) as Restaurant[],
        [recentlyViewedIds]
    );

    const filtered = useMemo(() => {
        let results = mockRestaurants.filter((r) => {
            const matchesCuisine = selectedCuisine === 'All' || r.cuisine === selectedCuisine;
            const matchesSearch =
                search.trim() === '' ||
                r.name.toLowerCase().includes(search.toLowerCase()) ||
                r.cuisine.toLowerCase().includes(search.toLowerCase()) ||
                r.menu.some((item) =>
                    item.name.toLowerCase().includes(search.toLowerCase())
                );
            const matchesDiet =
                (!dietFilters.vegetarian || r.menu.some((i) => i.vegetarian)) &&
                (!dietFilters.vegan || r.menu.some((i) => i.vegan)) &&
                (!dietFilters.spicy || r.menu.some((i) => i.spicy));
            return matchesCuisine && matchesSearch && matchesDiet;
        });
        if (fastestFirst) {
            results = [...results].sort((a, b) => a.deliveryTimeMinutes - b.deliveryTimeMinutes);
        }
        return results;
    }, [search, selectedCuisine, dietFilters, fastestFirst]);

    function handleSurpriseMe() {
        const eligible = mockRestaurants.filter((r) => r.rating >= 4.0);
        if (eligible.length === 0) return;
        const restaurant = eligible[Math.floor(Math.random() * eligible.length)];
        const popular = restaurant.menu.filter((i) => i.popular);
        const toAdd = popular.length > 0 ? popular.slice(0, 2) : restaurant.menu.slice(0, 2);
        toAdd.forEach((item) => addToCart(item, restaurant.id, restaurant.name, 1));
        toast.success(`Taking you to ${restaurant.name}!`, { icon: '🎲' });
        selectRestaurant(restaurant.id);
    }

    const activeDietCount = Object.values(dietFilters).filter(Boolean).length;

    return (
        <div className="flex flex-col gap-6">
            {/* Hero / Search Header */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-red-500 to-rose-600 p-6 md:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
                <div className="relative z-10">
                    <p className="mb-1 text-sm font-medium text-orange-100 uppercase tracking-widest">
                        Delivering to Springfield, IL
                    </p>
                    <h2 className="mb-4 text-2xl md:text-3xl font-bold text-white">
                        What are you craving?
                    </h2>
                    {/* Search */}
                    <div className="relative max-w-xl mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search restaurants or dishes..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl bg-white/95 py-3 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-orange-400 shadow-lg"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {/* Hero action buttons */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handleSurpriseMe}
                            className="flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-2 text-sm font-medium text-white transition-colors border border-white/20"
                        >
                            <Shuffle className="h-4 w-4" />
                            Surprise Me
                        </button>
                        <button
                            onClick={() => setView('mood')}
                            className="flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-2 text-sm font-medium text-white transition-colors border border-white/20"
                        >
                            <Smile className="h-4 w-4" />
                            Order by Mood
                        </button>
                    </div>
                </div>
            </div>

            {/* Recently Viewed */}
            {recentlyViewed.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Recently Viewed</p>
                    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                        {recentlyViewed.map((r) => (
                            <button
                                key={r.id}
                                onClick={() => selectRestaurant(r.id)}
                                className="shrink-0 flex items-center gap-2 rounded-xl bg-slate-800/60 border border-slate-700/50 px-3 py-2 hover:border-orange-500/40 transition-colors"
                            >
                                <span className="text-xl">{r.image}</span>
                                <div className="text-left">
                                    <p className="text-xs font-medium text-white">{r.name}</p>
                                    <p className="text-xs text-slate-500">{r.deliveryTime}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Cuisine Filter Chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {cuisineTypes.map((cuisine) => (
                    <button
                        key={cuisine}
                        onClick={() => setSelectedCuisine(cuisine)}
                        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                            selectedCuisine === cuisine
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                        {cuisine}
                    </button>
                ))}
            </div>

            {/* Diet + Sort controls */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Filter:</span>
                {([
                    { key: 'vegetarian' as const, label: '🌿 Veg', },
                    { key: 'vegan' as const, label: '🌱 Vegan' },
                    { key: 'spicy' as const, label: '🌶️ Spicy' },
                ] as const).map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setDietFilter(key, !dietFilters[key])}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-all border ${
                            dietFilters[key]
                                ? 'bg-green-500/20 border-green-500/50 text-green-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                    >
                        {label}
                    </button>
                ))}
                <div className="ml-auto">
                    <button
                        onClick={() => setFastestFirst(!fastestFirst)}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all border ${
                            fastestFirst
                                ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                    >
                        <Zap className="h-3 w-3" />
                        Fastest First
                    </button>
                </div>
            </div>

            {/* Results */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
                    <span className="text-5xl">🍽️</span>
                    <p className="text-lg font-medium">No restaurants found</p>
                    <p className="text-sm">Try a different search or cuisine filter.</p>
                </div>
            ) : (
                <>
                    <p className="text-sm text-slate-400 -mt-2">
                        {filtered.length} restaurant{filtered.length !== 1 ? 's' : ''} available
                        {selectedCuisine !== 'All' && ` · ${selectedCuisine}`}
                        {activeDietCount > 0 && ` · ${activeDietCount} diet filter${activeDietCount !== 1 ? 's' : ''} active`}
                        {fastestFirst && ' · Sorted by speed'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((restaurant, i) => (
                            <RestaurantCard
                                key={restaurant.id}
                                restaurant={restaurant}
                                index={i}
                                isFavorite={favoriteRestaurantIds.includes(restaurant.id)}
                                onSelect={() => selectRestaurant(restaurant.id)}
                                onToggleFavorite={() => toggleFavorite(restaurant.id)}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function RestaurantCard({
    restaurant,
    index,
    isFavorite,
    onSelect,
    onToggleFavorite,
}: {
    restaurant: Restaurant;
    index: number;
    isFavorite: boolean;
    onSelect: () => void;
    onToggleFavorite: () => void;
}) {
    const hasVeg = restaurant.menu.some((i) => i.vegetarian);
    const hasVegan = restaurant.menu.some((i) => i.vegan);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="group relative rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden hover:border-orange-500/40 hover:bg-slate-800 transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/10 cursor-pointer"
            onClick={onSelect}
        >
            {/* Cover / Emoji Area */}
            <div className="h-32 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-6xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-red-500/10 group-hover:from-orange-500/20 group-hover:to-red-500/20 transition-all duration-200" />
                <span className="relative z-10">{restaurant.image}</span>

                {/* Tags */}
                <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                    {restaurant.tags.slice(0, 2).map((tag) => (
                        <span
                            key={tag}
                            className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm"
                        >
                            {tag}
                        </span>
                    ))}
                </div>

                {/* Carbon badge */}
                <div className={`absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium backdrop-blur-sm ${carbonColor(restaurant.carbonScore)}`}>
                    <Leaf className="h-3 w-3" />
                    {carbonLabel(restaurant.carbonScore)}
                </div>

                {/* Favorite button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                    className="absolute top-2 right-2 z-10 rounded-full bg-black/50 p-1.5 backdrop-blur-sm transition-colors hover:bg-black/70"
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Heart className={`h-3.5 w-3.5 transition-colors ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white'}`} />
                </button>
            </div>

            {/* Info */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-white text-base group-hover:text-orange-400 transition-colors">
                        {restaurant.name}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0 text-yellow-400">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span className="text-sm font-medium text-white">{restaurant.rating}</span>
                        <span className="text-xs text-slate-400">
                            ({restaurant.reviewCount.toLocaleString()})
                        </span>
                    </div>
                </div>
                <p className="text-sm text-slate-400 mb-2">{restaurant.cuisine}</p>

                {/* Dietary badges */}
                {(hasVeg || hasVegan) && (
                    <div className="flex gap-1 mb-2">
                        {hasVegan && (
                            <span className="rounded-full bg-green-500/15 border border-green-500/30 px-2 py-0.5 text-xs text-green-400">
                                🌱 Vegan options
                            </span>
                        )}
                        {hasVeg && !hasVegan && (
                            <span className="rounded-full bg-green-500/15 border border-green-500/30 px-2 py-0.5 text-xs text-green-400">
                                🌿 Veg options
                            </span>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-orange-400" />
                        {restaurant.deliveryTime}
                    </span>
                    <span className="flex items-center gap-1">
                        <Bike className="h-3.5 w-3.5 text-orange-400" />
                        {restaurant.deliveryFee === 0
                            ? 'Free delivery'
                            : `$${restaurant.deliveryFee.toFixed(2)} delivery`}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}
