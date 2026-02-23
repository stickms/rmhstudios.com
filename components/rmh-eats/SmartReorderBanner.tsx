'use client';

import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { toast } from 'sonner';

interface Props {
    restaurantId: string;
}

export default function SmartReorderBanner({ restaurantId }: Props) {
    const { orders, addToCart } = useEatsStore();

    const lastOrder = useMemo(
        () => orders.find((o) => o.restaurantId === restaurantId),
        [orders, restaurantId]
    );

    if (!lastOrder) return null;

    const restaurant = mockRestaurants.find((r) => r.id === restaurantId);
    if (!restaurant) return null;

    function handleReorder() {
        let added = 0;
        lastOrder!.items.forEach((item) => {
            const menuItem = restaurant!.menu.find((m) => m.id === item.menuItemId);
            if (menuItem) {
                addToCart(menuItem, restaurant!.id, restaurant!.name, item.quantity, item.selectedOptions);
                added++;
            }
        });
        if (added > 0) {
            toast.success(`${added} item${added !== 1 ? 's' : ''} added to cart!`, { icon: '🛒' });
        }
    }

    const itemNames = lastOrder.items.map((i) => i.name).join(', ');
    const preview = itemNames.length > 50 ? itemNames.slice(0, 47) + '…' : itemNames;

    return (
        <div className="mx-0 mb-4 rounded-2xl bg-orange-500/10 border border-orange-500/30 px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-400">Welcome back!</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Last time: {preview}
                </p>
            </div>
            <button
                onClick={handleReorder}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 px-3 py-2 text-xs font-medium text-white transition-colors flex-shrink-0"
            >
                <RotateCcw className="h-3.5 w-3.5" />
                Reorder
            </button>
        </div>
    );
}
