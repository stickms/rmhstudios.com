'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, ShoppingCart, Trash2, ArrowRight, Info, Flame } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const SERVICE_FEE_RATE = 0.08; // 8%

interface CartProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function Cart({ isOpen, onClose }: CartProps) {
    const { t } = useTranslation("c-rmh-eats");
    const cart = useEatsStore((s) => s.cart);
    const cartRestaurantId = useEatsStore((s) => s.cartRestaurantId);
    const updateQuantity = useEatsStore((s) => s.updateQuantity);
    const removeFromCart = useEatsStore((s) => s.removeFromCart);
    const clearCart = useEatsStore((s) => s.clearCart);
    const setView = useEatsStore((s) => s.setView);
    const cartTotal = useEatsStore((s) => s.cartTotal);
    const cartCalories = useEatsStore((s) => s.cartCalories);
    const calorieBudget = useEatsStore((s) => s.calorieBudget);

    const restaurant = useMemo(
        () => mockRestaurants.find((r) => r.id === cartRestaurantId),
        [cartRestaurantId]
    );

    const subtotal = cartTotal();
    const deliveryFee = restaurant?.deliveryFee ?? 0;
    const serviceFee = subtotal * SERVICE_FEE_RATE;
    const grandTotal = subtotal + deliveryFee + serviceFee;

    const meetsMinimum = !restaurant || subtotal >= restaurant.minimumOrder;

    const handleCheckout = () => {
        onClose();
        setView('checkout');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-700">
                            <div className="flex items-center gap-2">
                                <ShoppingCart className="h-5 w-5 text-orange-400" />
                                <h2 className="font-semibold text-white">{t("your-cart", { defaultValue: "Your Cart" })}</h2>
                                {cart.length > 0 && (
                                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-medium text-white">
                                        {cart.reduce((s, i) => s + i.quantity, 0)}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content */}
                        {cart.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500 p-6">
                                <ShoppingCart className="h-12 w-12 opacity-30" />
                                <p className="font-medium">{t("cart-empty", { defaultValue: "Your cart is empty" })}</p>
                                <p className="text-sm text-center">{t("cart-empty-hint", { defaultValue: "Browse restaurants and add something delicious!" })}</p>
                                <button
                                    onClick={onClose}
                                    className="mt-2 rounded-xl bg-orange-500 hover:bg-orange-400 px-5 py-2.5 text-sm font-medium text-white transition-colors"
                                >
                                    {t("browse-restaurants", { defaultValue: "Browse Restaurants" })}
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Restaurant name */}
                                {restaurant && (
                                    <div className="px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
                                        <p className="text-sm text-slate-300">
                                            <span className="mr-1">{restaurant.image}</span>
                                            {restaurant.name}
                                        </p>
                                        <button
                                            onClick={clearCart}
                                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                            {t("clear", { defaultValue: "Clear" })}
                                        </button>
                                    </div>
                                )}

                                {/* Items */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {cart.map((cartItem) => (
                                        <div
                                            key={`${cartItem.menuItem.id}-${JSON.stringify(cartItem.selectedOptions)}`}
                                            className="flex gap-3 rounded-xl bg-slate-800/50 p-3 border border-slate-700/30"
                                        >
                                            <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-700 flex items-center justify-center text-2xl">
                                                {cartItem.menuItem.image}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">
                                                    {cartItem.menuItem.name}
                                                </p>
                                                {cartItem.selectedOptions &&
                                                    Object.entries(cartItem.selectedOptions).map(([, v]) => (
                                                        <p key={v} className="text-xs text-slate-400">{v}</p>
                                                    ))}
                                                {cartItem.specialInstructions && (
                                                    <p className="text-xs text-slate-500 italic mt-0.5 truncate">
                                                        "{cartItem.specialInstructions}"
                                                    </p>
                                                )}
                                                <div className="mt-1.5 flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-orange-400">
                                                        ${(cartItem.menuItem.price * cartItem.quantity).toFixed(2)}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() =>
                                                                updateQuantity(
                                                                    cartItem.menuItem.id,
                                                                    cartItem.quantity - 1
                                                                )
                                                            }
                                                            className="rounded-md bg-slate-700 p-1 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
                                                        >
                                                            <Minus className="h-3 w-3" />
                                                        </button>
                                                        <span className="text-sm text-white w-4 text-center">
                                                            {cartItem.quantity}
                                                        </span>
                                                        <button
                                                            onClick={() =>
                                                                updateQuantity(
                                                                    cartItem.menuItem.id,
                                                                    cartItem.quantity + 1
                                                                )
                                                            }
                                                            className="rounded-md bg-slate-700 p-1 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                removeFromCart(cartItem.menuItem.id)
                                                            }
                                                            className="ml-1 text-red-400 hover:text-red-300 transition-colors"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Fees breakdown */}
                                <div className="border-t border-slate-700 p-4 space-y-2">
                                    <div className="flex justify-between text-sm text-slate-400">
                                        <span>{t("subtotal", { defaultValue: "Subtotal" })}</span>
                                        <span>${subtotal.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-400">
                                        <span>{t("delivery-fee", { defaultValue: "Delivery fee" })}</span>
                                        <span>
                                            {deliveryFee === 0 ? (
                                                <span className="text-green-400">{t("free", { defaultValue: "Free" })}</span>
                                            ) : (
                                                `$${deliveryFee.toFixed(2)}`
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-400">
                                        <span className="flex items-center gap-1">
                                            {t("service-fee", { defaultValue: "Service fee" })}
                                            <Info className="h-3 w-3" />
                                        </span>
                                        <span>${serviceFee.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold text-white text-base pt-1 border-t border-slate-700/50">
                                        <span>{t("total", { defaultValue: "Total" })}</span>
                                        <span>${grandTotal.toFixed(2)}</span>
                                    </div>

                                    {!meetsMinimum && (
                                        <p className="text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2 mt-2">
                                            {t("minimum-order-notice", { defaultValue: "Minimum order is ${{min}}. Add ${{remaining}} more.", min: restaurant!.minimumOrder, remaining: (restaurant!.minimumOrder - subtotal).toFixed(2) })}
                                        </p>
                                    )}

                                    {/* Calorie total */}
                                    {cartCalories() > 0 && (
                                        <div className="flex items-center gap-2 text-xs text-slate-500 pt-1 border-t border-slate-700/30">
                                            <Flame className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                                            <span>{t("cal-total", { defaultValue: "Est. {{cal}} cal total", cal: cartCalories() })}</span>
                                            {calorieBudget && (
                                                <span className={calorieBudget - cartCalories() < 0 ? 'text-red-400' : 'text-green-400'}>
                                                    {t("cal-remaining", { defaultValue: "· {{remaining}} cal remaining after", remaining: calorieBudget - cartCalories() })}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleCheckout}
                                        disabled={!meetsMinimum}
                                        className="mt-2 w-full flex items-center justify-between gap-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 font-semibold text-white transition-colors shadow-lg shadow-orange-500/20"
                                    >
                                        <span>{t("proceed-to-checkout", { defaultValue: "Proceed to Checkout" })}</span>
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
