'use client';

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, MapPin, CreditCard, Package } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { toast } from 'sonner';

export default function OrderConfirmation() {
    const { orders, selectedOrderId, setView, openTracker } = useEatsStore();

    const order = useMemo(
        () => orders.find((o) => o.id === selectedOrderId),
        [orders, selectedOrderId]
    );

    useEffect(() => {
        if (order) {
            // Simulate order progression
            const timers = [
                setTimeout(() => {
                    useEatsStore.getState().advanceOrderStatus(order.id);
                    toast.success('Your order is being prepared!', {
                        icon: '👨‍🍳',
                    });
                }, 5000),
                setTimeout(() => {
                    useEatsStore.getState().advanceOrderStatus(order.id);
                    toast.success('Your order is on its way!', {
                        icon: '🛵',
                    });
                }, 15000),
                setTimeout(() => {
                    useEatsStore.getState().advanceOrderStatus(order.id);
                    toast.success('Your order has been delivered! Enjoy!', {
                        icon: '🎉',
                    });
                }, 30000),
            ];
            return () => timers.forEach(clearTimeout);
        }
    }, [order?.id]);

    if (!order) {
        return (
            <div className="flex flex-col items-center gap-4 py-24">
                <span className="text-5xl">❓</span>
                <p className="text-slate-400">Order not found.</p>
                <button onClick={() => setView('home')} className="text-orange-400 hover:text-orange-300 text-sm">
                    Go home
                </button>
            </div>
        );
    }

    const estimatedTime = new Date(order.estimatedDelivery);
    const timeStr = estimatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="max-w-lg mx-auto">
            {/* Success animation */}
            <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                className="flex flex-col items-center text-center mb-8"
            >
                <div className="relative mb-4">
                    <div className="h-24 w-24 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                        <CheckCircle className="h-12 w-12 text-green-400" />
                    </div>
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        className="absolute -top-1 -right-1 text-2xl"
                    >
                        🎉
                    </motion.div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Order Placed!</h2>
                <p className="text-slate-400 text-sm">
                    Your order has been received by {order.restaurantName}
                </p>
                <div className="mt-3 rounded-xl bg-orange-500/10 border border-orange-500/30 px-4 py-2">
                    <p className="text-xs text-orange-400 font-medium uppercase tracking-wide">Order ID</p>
                    <p className="text-lg font-mono font-bold text-orange-400">#{order.id}</p>
                </div>
            </motion.div>

            <div className="flex flex-col gap-4">
                {/* Estimated time */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4"
                >
                    <div className="flex items-center gap-3 mb-3">
                        <Clock className="h-5 w-5 text-orange-400" />
                        <h3 className="font-semibold text-white">Estimated Delivery</h3>
                    </div>
                    <p className="text-3xl font-bold text-white mb-1">{timeStr}</p>
                    <p className="text-sm text-slate-400">Your food should arrive around this time</p>
                </motion.div>

                {/* Order details */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4"
                >
                    <h3 className="font-semibold text-white mb-3">Order Details</h3>
                    <div className="space-y-2 mb-3">
                        {order.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                                <span className="text-slate-300">
                                    {item.quantity}× {item.name}
                                </span>
                                <span className="text-slate-400">
                                    ${(item.price * item.quantity).toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-slate-700 pt-3 space-y-1">
                        <div className="flex justify-between text-sm text-slate-400">
                            <span>Subtotal</span>
                            <span>${order.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-slate-400">
                            <span>Delivery fee</span>
                            <span>{order.deliveryFee === 0 ? 'Free' : `$${order.deliveryFee.toFixed(2)}`}</span>
                        </div>
                        {order.tip > 0 && (
                            <div className="flex justify-between text-sm text-slate-400">
                                <span>Tip</span>
                                <span>${order.tip.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-white pt-1">
                            <span>Total charged</span>
                            <span className="text-orange-400">${order.total.toFixed(2)}</span>
                        </div>
                    </div>
                </motion.div>

                {/* Delivery address */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4 flex gap-3"
                >
                    <MapPin className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-white mb-0.5">Delivering to</p>
                        <p className="text-sm text-slate-400">
                            {order.address.street}, {order.address.city}, {order.address.state}{' '}
                            {order.address.zip}
                        </p>
                    </div>
                </motion.div>

                {/* Payment */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4 flex gap-3"
                >
                    <CreditCard className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-white mb-0.5">Paid with</p>
                        <p className="text-sm text-slate-400">{order.paymentMethod.label}</p>
                    </div>
                </motion.div>

                {/* Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                    className="flex gap-3"
                >
                    <button
                        onClick={() => openTracker(order.id)}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-orange-500 hover:bg-orange-400 py-3.5 font-semibold text-white transition-colors shadow-lg shadow-orange-500/20"
                    >
                        <Package className="h-5 w-5" />
                        Track Order
                    </button>
                    <button
                        onClick={() => setView('home')}
                        className="flex-1 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 py-3.5 font-semibold text-white transition-colors"
                    >
                        Back to Home
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
