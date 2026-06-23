'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Heart, Star, Clock, Leaf } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';

function carbonColor(score: number) {
    if (score <= 3) return 'text-green-400';
    if (score <= 6) return 'text-yellow-400';
    return 'text-red-400';
}

export default function FavoritesPage() {
    const { t } = useTranslation("c-rmh-eats");
    const { favoriteRestaurantIds, toggleFavorite, selectRestaurant, setView } = useEatsStore();
    const favorites = mockRestaurants.filter((r) => favoriteRestaurantIds.includes(r.id));

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
                    <h2 className="text-xl font-bold text-white">{t("favorites", { defaultValue: "Favorites" })}</h2>
                    <p className="text-sm text-slate-400">
                        {t("saved-restaurants-count", { count: favorites.length, defaultValue: "{{count}} saved restaurant" })}
                    </p>
                </div>
            </div>

            {favorites.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
                    <Heart className="h-12 w-12 opacity-30" />
                    <p className="font-medium text-slate-400">{t("no-favorites-yet", { defaultValue: "No favorites yet" })}</p>
                    <p className="text-sm text-center">
                        {t("tap-heart-hint", { defaultValue: "Tap the heart icon on any restaurant to save it here." })}
                    </p>
                    <button
                        onClick={() => setView('home')}
                        className="mt-3 rounded-xl bg-orange-500 hover:bg-orange-400 px-5 py-2.5 text-sm font-medium text-white transition-colors"
                    >
                        {t("browse-restaurants", { defaultValue: "Browse Restaurants" })}
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {favorites.map((r, i) => (
                        <motion.div
                            key={r.id}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="relative rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden cursor-pointer hover:border-orange-500/50 transition-colors group"
                            onClick={() => selectRestaurant(r.id)}
                        >
                            {/* Cover */}
                            <div className="h-28 bg-linear-to-br from-slate-700 to-slate-800 flex items-center justify-center text-5xl relative">
                                {r.image}
                                {/* Unfavorite button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(r.id);
                                    }}
                                    className="absolute top-2 right-2 rounded-full bg-black/40 p-1.5 text-red-400 hover:text-red-300 transition-colors"
                                >
                                    <Heart className="h-4 w-4 fill-current" />
                                </button>
                                {/* Carbon score */}
                                <div className={`absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium ${carbonColor(r.carbonScore)}`}>
                                    <Leaf className="h-3 w-3" />
                                    {r.carbonScore <= 3 ? t("carbon-eco", { defaultValue: "Eco" }) : r.carbonScore <= 6 ? t("carbon-moderate", { defaultValue: "Moderate" }) : t("carbon-high", { defaultValue: "High CO₂" })}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-3">
                                <p className="font-semibold text-white text-sm">{r.name}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{r.cuisine}</p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                                    <span className="flex items-center gap-1 text-yellow-400">
                                        <Star className="h-3 w-3 fill-current" />
                                        {r.rating}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {r.deliveryTime}
                                    </span>
                                    <span>
                                        {r.deliveryFee === 0 ? (
                                            <span className="text-green-400">{t("free-delivery", { defaultValue: "Free delivery" })}</span>
                                        ) : (
                                            t("delivery-fee", { fee: r.deliveryFee.toFixed(2), defaultValue: "${{fee}} delivery" })
                                        )}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
