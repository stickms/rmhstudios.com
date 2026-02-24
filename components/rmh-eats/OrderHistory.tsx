'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Package, Clock, Star, ChevronRight, RotateCcw, AlertTriangle, Users } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { toast } from 'sonner';
import type { Order } from '@/lib/rmh-eats/types';

const STATUS_LABELS: Record<string, string> = {
    received: 'Order Received',
    preparing: 'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
};

const STATUS_COLORS: Record<string, string> = {
    received: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    preparing: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    out_for_delivery: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    delivered: 'text-green-400 bg-green-500/10 border-green-500/30',
};

export default function OrderHistory() {
    const { orders, setView, openTracker, openReview, addToCart, openIssueReport, openSplitBill } = useEatsStore();

    if (orders.length === 0) {
        return (
            <div className="max-w-lg mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <button
                        onClick={() => setView('home')}
                        className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <h2 className="text-xl font-bold text-white">Order History</h2>
                </div>

                <div className="flex flex-col items-center gap-3 py-20 text-slate-500">
                    <Package className="h-12 w-12 opacity-30" />
                    <p className="font-medium text-slate-400">No orders yet</p>
                    <p className="text-sm text-center">Place your first order to see it here!</p>
                    <button
                        onClick={() => setView('home')}
                        className="mt-3 rounded-xl bg-orange-500 hover:bg-orange-400 px-5 py-2.5 text-sm font-medium text-white transition-colors"
                    >
                        Browse Restaurants
                    </button>
                </div>
            </div>
        );
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
                    <h2 className="text-xl font-bold text-white">Order History</h2>
                    <p className="text-sm text-slate-400">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                </div>
            </div>

            <div className="space-y-4">
                {orders.map((order, i) => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        index={i}
                        onTrack={() => openTracker(order.id)}
                        onReview={() => openReview(order.id)}
                        onReportIssue={() => openIssueReport(order.id)}
                        onSplitBill={() => openSplitBill(order.id)}
                        onReorder={() => {
                            const restaurant = mockRestaurants.find((r) => r.id === order.restaurantId);
                            if (!restaurant) return;
                            let added = 0;
                            order.items.forEach((item) => {
                                const menuItem = restaurant.menu.find((m) => m.id === item.menuItemId);
                                if (menuItem) {
                                    addToCart(menuItem, restaurant.id, restaurant.name, item.quantity);
                                    added++;
                                }
                            });
                            if (added > 0) {
                                toast.success(`${added} item${added !== 1 ? 's' : ''} added to cart!`);
                                setView('home');
                            } else {
                                toast.error('Could not reorder — items no longer available');
                            }
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

function OrderCard({
    order,
    index,
    onTrack,
    onReview,
    onReorder,
    onReportIssue,
    onSplitBill,
}: {
    order: Order;
    index: number;
    onTrack: () => void;
    onReview: () => void;
    onReorder: () => void;
    onReportIssue: () => void;
    onSplitBill: () => void;
}) {
    const restaurant = mockRestaurants.find((r) => r.id === order.restaurantId);
    const date = new Date(order.placedAt);
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isActive = order.status !== 'delivered';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{restaurant?.image ?? '🍽️'}</span>
                    <div>
                        <p className="font-semibold text-white">{order.restaurantName}</p>
                        <p className="text-xs text-slate-400">
                            {dateStr} at {timeStr}
                        </p>
                    </div>
                </div>
                <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[order.status]}`}
                >
                    {STATUS_LABELS[order.status]}
                </span>
            </div>

            {/* Items */}
            <div className="px-4 py-3">
                <p className="text-sm text-slate-300">
                    {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                </p>
                <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-semibold text-orange-400">${order.total.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">
                        {order.items.reduce((s, i) => s + i.quantity, 0)} item
                        {order.items.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-4 pb-4">
                {isActive && (
                    <button
                        onClick={onTrack}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 px-3 py-2 text-sm font-medium text-white transition-colors"
                    >
                        <Clock className="h-4 w-4" />
                        Track
                    </button>
                )}
                {order.status === 'delivered' && !order.reviewed && (
                    <button
                        onClick={onReview}
                        className="flex items-center gap-1.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 px-3 py-2 text-sm font-medium text-slate-900 transition-colors"
                    >
                        <Star className="h-4 w-4" />
                        Review
                    </button>
                )}
                {order.status === 'delivered' && order.reviewed && (
                    <span className="flex items-center gap-1.5 rounded-xl bg-green-500/10 border border-green-500/30 px-3 py-2 text-sm text-green-400">
                        <Star className="h-4 w-4 fill-current" />
                        Reviewed
                    </span>
                )}
                <button
                    onClick={onReorder}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium text-white transition-colors"
                >
                    <RotateCcw className="h-4 w-4" />
                    Reorder
                </button>
                {order.status === 'delivered' && (
                    <button
                        onClick={onSplitBill}
                        className="flex items-center gap-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium text-white transition-colors"
                    >
                        <Users className="h-4 w-4" />
                        Split
                    </button>
                )}
                {order.status === 'delivered' && !order.issueReported && (
                    <button
                        onClick={onReportIssue}
                        className="flex items-center gap-1.5 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-700/50 px-3 py-2 text-sm font-medium text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                        <AlertTriangle className="h-4 w-4" />
                        Issue
                    </button>
                )}
                {order.status === 'delivered' && order.issueReported && (
                    <span className="flex items-center gap-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-xs text-yellow-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Issue filed
                    </span>
                )}
                {isActive && (
                    <button
                        onClick={onTrack}
                        className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-orange-400 transition-colors"
                    >
                        Details
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </motion.div>
    );
}
