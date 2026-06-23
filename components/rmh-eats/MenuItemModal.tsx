'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, ShoppingCart, Flame, Leaf, Wheat, TriangleAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { toast } from 'sonner';
import type { MenuItem } from '@/lib/rmh-eats/types';
import { useTranslation } from 'react-i18next';

interface MenuItemModalProps {
    item: MenuItem;
    restaurantId: string;
    restaurantName: string;
    onClose: () => void;
}

const ALLERGEN_ICONS: Record<string, string> = {
    Gluten: '🌾',
    Dairy: '🥛',
    Egg: '🥚',
    Soy: '🫘',
    Sesame: '🌱',
    Peanuts: '🥜',
    Nuts: '🥜',
    Fish: '🐟',
    Shellfish: '🦐',
    Corn: '🌽',
    Oyster: '🦪',
};

export default function MenuItemModal({
    item,
    restaurantId,
    restaurantName,
    onClose,
}: MenuItemModalProps) {
    const { t } = useTranslation("c-rmh-eats");
    const addToCart = useEatsStore((s) => s.addToCart);
    const [qty, setQty] = useState(1);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
        const defaults: Record<string, string> = {};
        item.customizations?.forEach((c) => {
            if (c.required) defaults[c.id] = c.choices[0].label;
        });
        return defaults;
    });
    const [instructions, setInstructions] = useState('');
    const [showNutrition, setShowNutrition] = useState(false);

    // Mocked macro calculations from calorie ratios
    const protein = Math.round((item.calories * 0.18) / 4);
    const carbs = Math.round((item.calories * 0.55) / 4);
    const fat = Math.round((item.calories * 0.27) / 9);
    const sodium = Math.round(item.calories * 1.8);

    // Calculate total price including modifiers
    let unitPrice = item.price;
    if (item.customizations) {
        for (const [customId, choiceLabel] of Object.entries(selectedOptions)) {
            const custom = item.customizations.find((c) => c.id === customId);
            const choice = custom?.choices.find((ch) => ch.label === choiceLabel);
            if (choice) unitPrice += choice.priceModifier;
        }
    }

    const total = unitPrice * qty;

    const handleAddToCart = () => {
        // Check required customizations
        const missingRequired = item.customizations?.find(
            (c) => c.required && !selectedOptions[c.id]
        );
        if (missingRequired) {
            toast.error(t("please-select", { defaultValue: "Please select a {{name}}", name: missingRequired.name }));
            return;
        }

        addToCart(
            item,
            restaurantId,
            restaurantName,
            qty,
            Object.keys(selectedOptions).length > 0 ? selectedOptions : undefined,
            instructions.trim() || undefined
        );
        toast.success(t("added-to-cart", { defaultValue: "{{name}} added to cart", name: item.name }));
        onClose();
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
                onClick={onClose}
            >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                <motion.div
                    initial={{ y: 60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 60, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative z-10 w-full sm:max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
                >
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-20 rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Emoji / Image area */}
                    <div className="h-40 bg-linear-to-br from-slate-800 to-slate-700 flex items-center justify-center shrink-0">
                        <span className="text-7xl">{item.image}</span>
                    </div>

                    {/* Scrollable content */}
                    <div className="overflow-y-auto flex-1 p-5">
                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {item.popular && (
                                <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/30">
                                    {t("popular", { defaultValue: "Popular" })}
                                </span>
                            )}
                            {item.vegetarian && (
                                <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400 border border-green-500/30">
                                    <Leaf className="h-3 w-3" />
                                    {item.vegan ? t("vegan", { defaultValue: "Vegan" }) : t("vegetarian", { defaultValue: "Vegetarian" })}
                                </span>
                            )}
                            {item.spicy && (
                                <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-400 border border-red-500/30">
                                    <Flame className="h-3 w-3" />
                                    {t("spicy", { defaultValue: "Spicy" })}
                                </span>
                            )}
                        </div>

                        <h2 className="text-xl font-bold text-white mb-2">{item.name}</h2>
                        <p className="text-sm text-slate-400 leading-relaxed mb-4">{item.description}</p>

                        {/* Price and calories */}
                        <div className="flex items-center gap-4 mb-2">
                            <span className="text-2xl font-bold text-orange-400">
                                ${item.price.toFixed(2)}
                            </span>
                            <span className="flex items-center gap-1 text-sm text-slate-400">
                                <Flame className="h-3.5 w-3.5 text-orange-500" />
                                {item.calories} cal
                            </span>
                        </div>

                        {/* Nutrition toggle */}
                        <button
                            onClick={() => setShowNutrition(!showNutrition)}
                            className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 mb-4 transition-colors"
                        >
                            {t("nutrition-info", { defaultValue: "Nutrition Info" })}
                            {showNutrition ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>

                        <AnimatePresence>
                            {showNutrition && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-4 overflow-hidden"
                                >
                                    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-3">
                                        <div className="grid grid-cols-5 gap-2 text-center">
                                            {[
                                                { label: t("calories", { defaultValue: "Calories" }), value: item.calories, unit: '' },
                                                { label: t("protein", { defaultValue: "Protein" }), value: protein, unit: 'g' },
                                                { label: t("carbs", { defaultValue: "Carbs" }), value: carbs, unit: 'g' },
                                                { label: t("fat", { defaultValue: "Fat" }), value: fat, unit: 'g' },
                                                { label: t("sodium", { defaultValue: "Sodium" }), value: sodium, unit: 'mg' },
                                            ].map(({ label, value, unit }) => (
                                                <div key={label} className="flex flex-col gap-0.5">
                                                    <span className="text-sm font-semibold text-white">{value}{unit}</span>
                                                    <span className="text-xs text-slate-500">{label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-slate-600 mt-2 text-center">{t("approximate-values", { defaultValue: "* Approximate values" })}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Allergens */}
                        {item.allergens.length > 0 && (
                            <div className="mb-5 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/30">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <TriangleAlert className="h-4 w-4 text-yellow-400" />
                                    <p className="text-xs font-medium text-yellow-400 uppercase tracking-wide">
                                        {t("contains-allergens", { defaultValue: "Contains Allergens" })}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {item.allergens.map((a) => (
                                        <span
                                            key={a}
                                            className="flex items-center gap-1 rounded-md bg-yellow-500/15 border border-yellow-500/40 px-2 py-0.5 text-xs text-yellow-300"
                                        >
                                            {ALLERGEN_ICONS[a] || '⚠️'} {a}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Customizations */}
                        {item.customizations?.map((customization) => (
                            <div key={customization.id} className="mb-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="text-sm font-semibold text-white">
                                        {customization.name}
                                    </p>
                                    {customization.required && (
                                        <span className="text-xs text-orange-400 bg-orange-500/10 rounded-full px-2 py-0.5">
                                            {t("required", { defaultValue: "Required" })}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {customization.choices.map((choice) => (
                                        <button
                                            key={choice.label}
                                            onClick={() =>
                                                setSelectedOptions((prev) => ({
                                                    ...prev,
                                                    [customization.id]: choice.label,
                                                }))
                                            }
                                            className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm border transition-all ${
                                                selectedOptions[customization.id] === choice.label
                                                    ? 'border-orange-500 bg-orange-500/10 text-white'
                                                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                                            }`}
                                        >
                                            <span>{choice.label}</span>
                                            {choice.priceModifier !== 0 && (
                                                <span className="text-xs text-orange-400">
                                                    +${choice.priceModifier.toFixed(2)}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Special Instructions */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                {t("special-instructions", { defaultValue: "Special Instructions" })}
                            </label>
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder={t("instructions-placeholder", { defaultValue: "Any allergies, special requests, or notes for the kitchen..." })}
                                rows={2}
                                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500 resize-none"
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-700/50 bg-slate-900 flex items-center gap-3 shrink-0">
                        {/* Quantity */}
                        <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-3 py-2">
                            <button
                                onClick={() => setQty(Math.max(1, qty - 1))}
                                className="text-slate-300 hover:text-white transition-colors"
                            >
                                <Minus className="h-4 w-4" />
                            </button>
                            <span className="text-white font-semibold w-5 text-center">{qty}</span>
                            <button
                                onClick={() => setQty(qty + 1)}
                                className="text-slate-300 hover:text-white transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Add to cart */}
                        <button
                            onClick={handleAddToCart}
                            className="flex-1 flex items-center justify-between gap-2 rounded-xl bg-orange-500 hover:bg-orange-400 px-4 py-3 font-semibold text-white transition-colors shadow-lg shadow-orange-500/20"
                        >
                            <div className="flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4" />
                                <span>{t("add-to-cart", { defaultValue: "Add to Cart" })}</span>
                            </div>
                            <span>${total.toFixed(2)}</span>
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
