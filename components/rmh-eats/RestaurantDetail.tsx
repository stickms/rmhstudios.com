'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Clock, Bike, Phone, MapPin, Flame, Leaf, Search, X, Heart, TriangleAlert } from 'lucide-react';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { useEatsStore } from '@/lib/store/useEatsStore';
import MenuItemModal from './MenuItemModal';
import SmartReorderBanner from './SmartReorderBanner';
import type { MenuItem } from '@/lib/rmh-eats/types';

export default function RestaurantDetail({ restaurantId }: { restaurantId: string }) {
    const goHome = useEatsStore((s) => s.goHome);
    const recordView = useEatsStore((s) => s.recordView);
    const dietFilters = useEatsStore((s) => s.dietFilters);
    const setDietFilter = useEatsStore((s) => s.setDietFilter);
    const favoriteRestaurantIds = useEatsStore((s) => s.favoriteRestaurantIds);
    const toggleFavorite = useEatsStore((s) => s.toggleFavorite);
    const calorieBudget = useEatsStore((s) => s.calorieBudget);
    const cartCalories = useEatsStore((s) => s.cartCalories);

    const restaurant = useMemo(
        () => mockRestaurants.find((r) => r.id === restaurantId),
        [restaurantId]
    );
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        recordView(restaurantId);
    }, [restaurantId, recordView]);

    if (!restaurant) {
        return (
            <div className="flex flex-col items-center gap-4 py-24">
                <span className="text-5xl">😕</span>
                <p className="text-slate-400">Restaurant not found.</p>
                <button onClick={goHome} className="text-orange-400 hover:text-orange-300 text-sm">
                    Go back home
                </button>
            </div>
        );
    }

    const isFavorite = favoriteRestaurantIds.includes(restaurantId);
    const activeDietFilters = (Object.entries(dietFilters) as [keyof typeof dietFilters, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k);

    // Unique allergens across the whole restaurant menu
    const allAllergens = useMemo(() => {
        const set = new Set<string>();
        restaurant.menu.forEach((item) => item.allergens.forEach((a) => set.add(a)));
        return [...set].sort();
    }, [restaurant.menu]);

    // Remaining calorie budget after what's already in the cart
    const remainingCalories = calorieBudget != null ? calorieBudget - cartCalories() : null;

    const categories = ['All', ...restaurant.categories];

    const menuItems = useMemo(() => {
        return restaurant.menu.filter((item) => {
            const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
            const matchesSearch =
                search.trim() === '' ||
                item.name.toLowerCase().includes(search.toLowerCase()) ||
                item.description.toLowerCase().includes(search.toLowerCase());
            const matchesDiet =
                (!dietFilters.vegetarian || item.vegetarian) &&
                (!dietFilters.vegan || item.vegan) &&
                (!dietFilters.spicy || item.spicy);
            return matchesCat && matchesSearch && matchesDiet;
        });
    }, [restaurant.menu, selectedCategory, search, dietFilters]);

    const groupedItems = useMemo(() => {
        if (selectedCategory !== 'All') {
            return { [selectedCategory]: menuItems };
        }
        const grouped: Record<string, MenuItem[]> = {};
        for (const cat of restaurant.categories) {
            const items = menuItems.filter((i) => i.category === cat);
            if (items.length > 0) grouped[cat] = items;
        }
        return grouped;
    }, [menuItems, selectedCategory, restaurant.categories]);

    return (
        <div className="flex flex-col gap-0">
            {/* Header */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 mb-5">
                {/* Back button */}
                <button
                    onClick={goHome}
                    className="absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-xl bg-slate-900/80 backdrop-blur-sm px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border border-slate-700/50"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </button>

                {/* Favorite button */}
                <button
                    onClick={() => toggleFavorite(restaurantId)}
                    className="absolute top-4 right-4 z-10 rounded-full bg-slate-900/80 backdrop-blur-sm p-2 border border-slate-700/50 transition-colors hover:border-red-400/50"
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Heart
                        className={`h-5 w-5 transition-colors ${isFavorite ? 'fill-red-400 text-red-400' : 'text-slate-400'}`}
                    />
                </button>

                {/* Cover */}
                <div className="h-36 flex items-center justify-center text-7xl bg-gradient-to-br from-orange-500/10 to-red-500/10">
                    {restaurant.image}
                </div>

                {/* Info */}
                <div className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{restaurant.name}</h2>
                            <p className="text-sm text-slate-400">{restaurant.cuisine} · {restaurant.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-semibold text-white">{restaurant.rating}</span>
                            <span className="text-xs text-slate-400">({restaurant.reviewCount.toLocaleString()})</span>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                        <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-orange-400" />
                            {restaurant.deliveryTime}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Bike className="h-4 w-4 text-orange-400" />
                            {restaurant.deliveryFee === 0 ? 'Free delivery' : `$${restaurant.deliveryFee.toFixed(2)} delivery`}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-orange-400" />
                            {restaurant.address}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Phone className="h-4 w-4 text-orange-400" />
                            {restaurant.phone}
                        </span>
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                        🕐 {restaurant.hours} · Min. order ${restaurant.minimumOrder}
                    </p>
                </div>
            </div>

            {/* Smart Reorder Banner */}
            <SmartReorderBanner restaurantId={restaurantId} />

            {/* Allergen summary banner */}
            {allAllergens.length > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-3 py-2.5">
                    <TriangleAlert className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">
                        <span className="font-semibold">Allergens on this menu: </span>
                        {allAllergens.join(', ')}
                    </p>
                </div>
            )}

            {/* Menu search + category tabs */}
            <div className="sticky top-0 z-20 bg-slate-950 pt-2 pb-3 -mx-1 px-1">
                {/* Calorie budget chip */}
                {calorieBudget != null && (
                    <div className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
                        remainingCalories! < 0
                            ? 'bg-red-500/10 border-red-500/40 text-red-400'
                            : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    }`}>
                        <Flame className="h-3 w-3" />
                        {remainingCalories! >= 0
                            ? `${remainingCalories} cal remaining today`
                            : `${Math.abs(remainingCalories!)} cal over budget`}
                    </div>
                )}

                {/* Active diet filter pills */}
                {activeDietFilters.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {activeDietFilters.map((key) => (
                            <button
                                key={key}
                                onClick={() => setDietFilter(key, false)}
                                className="flex items-center gap-1 rounded-full bg-green-500/15 border border-green-500/40 px-2.5 py-1 text-xs font-medium text-green-300 hover:bg-green-500/25 transition-colors"
                            >
                                {key === 'vegetarian' ? '🌿' : key === 'vegan' ? '🌱' : '🌶️'}
                                {key.charAt(0).toUpperCase() + key.slice(1)}
                                <X className="h-3 w-3 ml-0.5" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Search */}
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search menu..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-xl bg-slate-800 border border-slate-700 py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Category tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                                selectedCategory === cat
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Menu Items */}
            {Object.keys(groupedItems).length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
                    <span className="text-4xl">🔍</span>
                    <p>No items match your search{activeDietFilters.length > 0 ? ' or active filters' : ''}.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    {Object.entries(groupedItems).map(([category, items]) => (
                        <div key={category}>
                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                {category}
                                <span className="text-sm font-normal text-slate-500">({items.length})</span>
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {items.map((item, i) => (
                                    <MenuItemCard
                                        key={item.id}
                                        item={item}
                                        index={i}
                                        remainingCalories={remainingCalories}
                                        onClick={() => setSelectedItem(item)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Item Modal */}
            {selectedItem && (
                <MenuItemModal
                    item={selectedItem}
                    restaurantId={restaurant.id}
                    restaurantName={restaurant.name}
                    onClose={() => setSelectedItem(null)}
                />
            )}
        </div>
    );
}

function MenuItemCard({
    item,
    index,
    remainingCalories,
    onClick,
}: {
    item: MenuItem;
    index: number;
    remainingCalories: number | null;
    onClick: () => void;
}) {
    const overBudget = remainingCalories != null && item.calories > remainingCalories;

    return (
        <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={onClick}
            className={`group w-full text-left flex gap-3 rounded-xl border p-4 hover:border-orange-500/40 transition-all ${
                overBudget
                    ? 'bg-orange-500/5 border-orange-500/30 hover:bg-orange-500/10'
                    : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
            }`}
        >
            {/* Emoji */}
            <div className="shrink-0 h-16 w-16 rounded-xl bg-slate-700 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform">
                {item.image}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-white text-sm group-hover:text-orange-400 transition-colors">
                            {item.name}
                        </span>
                        {item.popular && (
                            <span className="text-xs text-orange-400">⭐</span>
                        )}
                        {item.vegetarian && (
                            <Leaf className="h-3.5 w-3.5 text-green-400 shrink-0" />
                        )}
                        {item.spicy && (
                            <Flame className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        {overBudget && (
                            <TriangleAlert className="h-3.5 w-3.5 text-orange-400 shrink-0" aria-label="Over calorie budget" />
                        )}
                    </div>
                    <span className="text-sm font-semibold text-orange-400 shrink-0">
                        ${item.price.toFixed(2)}
                    </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {item.description}
                </p>
                <p className={`text-xs mt-1 ${overBudget ? 'text-orange-400' : 'text-slate-500'}`}>
                    {item.calories} cal{overBudget && remainingCalories != null ? ` · ${item.calories - remainingCalories} over budget` : ''}
                </p>
            </div>
        </motion.button>
    );
}
