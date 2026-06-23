'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    CheckCircle2,
    Circle,
    Clock,
    ChefHat,
    Bike,
    PartyPopper,
    Star,
    Phone,
    AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEatsStore } from '@/lib/store/useEatsStore';
import type { OrderStatus } from '@/lib/rmh-eats/types';

const STATUS_STEPS: {
    status: OrderStatus;
    icon: React.ReactNode;
}[] = [
    {
        status: 'received',
        icon: <Clock className="h-5 w-5" />,
    },
    {
        status: 'preparing',
        icon: <ChefHat className="h-5 w-5" />,
    },
    {
        status: 'out_for_delivery',
        icon: <Bike className="h-5 w-5" />,
    },
    {
        status: 'delivered',
        icon: <PartyPopper className="h-5 w-5" />,
    },
];

const STATUS_ORDER: OrderStatus[] = ['received', 'preparing', 'out_for_delivery', 'delivered'];

export default function OrderTracker() {
    const { t } = useTranslation("c-rmh-eats");
    const { orders, selectedOrderId, setView, openReview, openIssueReport } = useEatsStore();

    const statusLabels: Record<OrderStatus, string> = {
        received: t("status-received-label", { defaultValue: "Order Received" }),
        preparing: t("status-preparing-label", { defaultValue: "Preparing" }),
        out_for_delivery: t("status-out-for-delivery-label", { defaultValue: "Out for Delivery" }),
        delivered: t("status-delivered-label", { defaultValue: "Delivered" }),
    };

    const statusDescriptions: Record<OrderStatus, string> = {
        received: t("status-received-desc", { defaultValue: "Your order has been confirmed and sent to the restaurant." }),
        preparing: t("status-preparing-desc", { defaultValue: "The kitchen is cooking your food right now." }),
        out_for_delivery: t("status-out-for-delivery-desc", { defaultValue: "Your driver has picked up the order and is on their way." }),
        delivered: t("status-delivered-desc", { defaultValue: "Your order has arrived. Enjoy your meal!" }),
    };

    const order = useMemo(
        () => orders.find((o) => o.id === selectedOrderId),
        [orders, selectedOrderId]
    );

    if (!order) {
        return (
            <div className="flex flex-col items-center gap-4 py-24">
                <span className="text-5xl">❓</span>
                <p className="text-slate-400">{t("order-not-found", { defaultValue: "Order not found." })}</p>
                <button onClick={() => setView('home')} className="text-orange-400 hover:text-orange-300 text-sm">
                    {t("go-home", { defaultValue: "Go home" })}
                </button>
            </div>
        );
    }

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const isDelivered = order.status === 'delivered';

    return (
        <div className="max-w-lg mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => setView('history')}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white">{t("track-order", { defaultValue: "Track Order" })}</h2>
                    <p className="text-sm text-slate-400">#{order.id} · {order.restaurantName}</p>
                </div>
            </div>

            {/* Status steps */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5 mb-4">
                <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-700" />
                    <div
                        className="absolute left-[19px] top-6 w-0.5 bg-orange-500 transition-all duration-700"
                        style={{
                            height: `${(currentIdx / (STATUS_STEPS.length - 1)) * 100}%`,
                        }}
                    />

                    <div className="space-y-6">
                        {STATUS_STEPS.map((step, i) => {
                            const isPast = i < currentIdx;
                            const isCurrent = i === currentIdx;
                            const isFuture = i > currentIdx;

                            return (
                                <div key={step.status} className="flex gap-4 relative">
                                    {/* Icon circle */}
                                    <div
                                        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                                            isPast
                                                ? 'border-orange-500 bg-orange-500 text-white'
                                                : isCurrent
                                                ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                                                : 'border-slate-600 bg-slate-800 text-slate-600'
                                        }`}
                                    >
                                        {isPast ? (
                                            <CheckCircle2 className="h-5 w-5" />
                                        ) : isCurrent ? (
                                            <motion.div
                                                animate={{ scale: [1, 1.1, 1] }}
                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                            >
                                                {step.icon}
                                            </motion.div>
                                        ) : (
                                            step.icon
                                        )}
                                    </div>

                                    {/* Text */}
                                    <div className="flex-1 pt-1.5">
                                        <p
                                            className={`font-semibold ${
                                                isCurrent ? 'text-orange-400' : isPast ? 'text-white' : 'text-slate-600'
                                            }`}
                                        >
                                            {statusLabels[step.status]}
                                        </p>
                                        {(isCurrent || isPast) && (
                                            <p className="text-sm text-slate-400 mt-0.5">{statusDescriptions[step.status]}</p>
                                        )}
                                        {/* Timestamp from history */}
                                        {order.statusHistory.find((h) => h.status === step.status) && (
                                            <p className="text-xs text-slate-500 mt-1">
                                                {new Date(
                                                    order.statusHistory.find((h) => h.status === step.status)!.timestamp
                                                ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Driver info card */}
            {order.status === 'out_for_delivery' && order.driver && (
                <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4 mb-4 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-slate-700 flex items-center justify-center text-2xl shrink-0">
                        {order.driver.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{t("your-driver", { defaultValue: "Your Driver" })}</p>
                        <p className="font-semibold text-white">{order.driver.name}</p>
                        <div className="flex items-center gap-1 text-xs text-yellow-400">
                            <Star className="h-3 w-3 fill-current" />
                            <span>{order.driver.rating.toFixed(1)}</span>
                        </div>
                    </div>
                    <a
                        href={`tel:${order.driver.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-xl bg-slate-700 hover:bg-slate-600 p-2.5 text-slate-300 hover:text-white transition-colors"
                        aria-label={t("call-driver", { defaultValue: "Call driver" })}
                    >
                        <Phone className="h-4 w-4" />
                    </a>
                </div>
            )}

            {/* ETA */}
            {!isDelivered && (
                <div className="rounded-2xl bg-orange-500/10 border border-orange-500/30 p-4 mb-4">
                    <p className="text-sm text-orange-400 font-medium">{t("estimated-arrival", { defaultValue: "Estimated Arrival" })}</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        {new Date(order.estimatedDelivery).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </p>
                </div>
            )}

            {/* Order items */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4 mb-4">
                <h3 className="font-semibold text-white mb-3">{t("your-order", { defaultValue: "Your Order" })}</h3>
                <div className="space-y-1.5">
                    {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                            <span className="text-slate-300">
                                {item.quantity}× {item.name}
                            </span>
                            <span className="text-slate-400">${(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-medium text-white text-sm">
                        <span>{t("total", { defaultValue: "Total" })}</span>
                        <span>${order.total.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                    {isDelivered && !order.reviewed && (
                        <button
                            onClick={() => openReview(order.id)}
                            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-orange-500 hover:bg-orange-400 py-3.5 font-semibold text-white transition-colors shadow-lg shadow-orange-500/20"
                        >
                            <Star className="h-5 w-5" />
                            {t("leave-a-review", { defaultValue: "Leave a Review" })}
                        </button>
                    )}
                    <button
                        onClick={() => setView('home')}
                        className="flex-1 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 py-3.5 font-semibold text-white transition-colors"
                    >
                        {t("back-to-home", { defaultValue: "Back to Home" })}
                    </button>
                </div>
                {isDelivered && !order.issueReported && (
                    <button
                        onClick={() => openIssueReport(order.id)}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 py-3 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                    >
                        <AlertTriangle className="h-4 w-4 text-yellow-400" />
                        {t("report-an-issue", { defaultValue: "Report an Issue" })}
                    </button>
                )}
            </div>
        </div>
    );
}
