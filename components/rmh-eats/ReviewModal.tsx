'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Star } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { toast } from 'sonner';

export default function ReviewModal() {
    const { orders, reviewTargetOrderId, submitReview, setView } = useEatsStore();

    const order = useMemo(
        () => orders.find((o) => o.id === reviewTargetOrderId),
        [orders, reviewTargetOrderId]
    );

    const [rating, setRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [itemRatings, setItemRatings] = useState<Record<string, number>>({});

    if (!order) {
        return (
            <div className="flex flex-col items-center gap-4 py-24">
                <span className="text-5xl">⭐</span>
                <p className="text-slate-400">No order to review.</p>
                <button onClick={() => setView('home')} className="text-orange-400 hover:text-orange-300 text-sm">
                    Go home
                </button>
            </div>
        );
    }

    const handleSubmit = () => {
        submitReview({
            restaurantId: order.restaurantId,
            orderId: order.id,
            rating,
            comment,
            itemRatings: Object.keys(itemRatings).length > 0 ? itemRatings : undefined,
        });
        toast.success('Review submitted! Thank you!', { icon: '⭐' });
    };

    const displayRating = hoverRating || rating;

    const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

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
                    <h2 className="text-xl font-bold text-white">Leave a Review</h2>
                    <p className="text-sm text-slate-400">{order.restaurantName}</p>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {/* Overall rating */}
                <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                    <h3 className="font-semibold text-white mb-4 text-center">
                        How was your overall experience?
                    </h3>
                    <div className="flex justify-center gap-2 mb-3">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                onClick={() => setRating(star)}
                                className="p-1 transition-transform hover:scale-110 active:scale-95"
                            >
                                <Star
                                    className={`h-10 w-10 transition-colors ${
                                        star <= displayRating
                                            ? 'fill-yellow-400 text-yellow-400'
                                            : 'text-slate-600'
                                    }`}
                                />
                            </button>
                        ))}
                    </div>
                    <p className="text-center text-sm font-medium text-yellow-400">
                        {ratingLabels[displayRating]}
                    </p>
                </div>

                {/* Item ratings */}
                <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                    <h3 className="font-semibold text-white mb-3">Rate individual items (optional)</h3>
                    <div className="space-y-3">
                        {order.items.map((item) => (
                            <div key={item.menuItemId} className="flex items-center justify-between gap-3">
                                <p className="text-sm text-slate-300 flex-1 min-w-0 truncate">{item.name}</p>
                                <div className="flex gap-1 flex-shrink-0">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            onClick={() =>
                                                setItemRatings((prev) => ({
                                                    ...prev,
                                                    [item.menuItemId]: star,
                                                }))
                                            }
                                            className="transition-transform hover:scale-110"
                                        >
                                            <Star
                                                className={`h-5 w-5 transition-colors ${
                                                    star <= (itemRatings[item.menuItemId] ?? 0)
                                                        ? 'fill-yellow-400 text-yellow-400'
                                                        : 'text-slate-600 hover:text-yellow-400'
                                                }`}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Written review */}
                <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                    <h3 className="font-semibold text-white mb-3">Write a review (optional)</h3>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Share your thoughts about the food, delivery, and overall experience..."
                        rows={4}
                        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500 resize-none"
                    />
                    <p className="text-xs text-slate-500 mt-1 text-right">
                        {comment.length}/500 characters
                    </p>
                </div>

                {/* Submit */}
                <motion.button
                    onClick={handleSubmit}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 hover:bg-orange-400 py-4 text-lg font-bold text-white transition-colors shadow-xl shadow-orange-500/20"
                >
                    <Star className="h-5 w-5 fill-current" />
                    Submit Review
                </motion.button>

                <button
                    onClick={() => setView('history')}
                    className="text-center text-sm text-slate-500 hover:text-slate-300 transition-colors pb-4"
                >
                    Skip for now
                </button>
            </div>
        </div>
    );
}
