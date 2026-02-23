import type { Order, Restaurant, MenuItem } from './types';

export interface Recommendation {
    restaurant: Restaurant;
    items: MenuItem[];
    reason: string;
}

export function getMealRecommendations(
    orders: Order[],
    restaurants: Restaurant[],
    calorieBudget: number | null
): Recommendation[] {
    const suggestions: Recommendation[] = [];

    const hour = new Date().getHours();
    const isBreakfast = hour >= 6 && hour < 11;
    const isLunch = hour >= 11 && hour < 15;

    // Suggestion 1: "Usual order" from most visited restaurant
    if (orders.length > 0) {
        const restaurantFreq = orders.reduce<Record<string, number>>((acc, o) => {
            acc[o.restaurantId] = (acc[o.restaurantId] ?? 0) + 1;
            return acc;
        }, {});
        const topRestaurantId = Object.entries(restaurantFreq).sort(([, a], [, b]) => b - a)[0]?.[0];

        if (topRestaurantId) {
            const restaurant = restaurants.find((r) => r.id === topRestaurantId);
            if (restaurant) {
                const itemFreq = orders
                    .filter((o) => o.restaurantId === topRestaurantId)
                    .flatMap((o) => o.items)
                    .reduce<Record<string, number>>((acc, i) => {
                        acc[i.menuItemId] = (acc[i.menuItemId] ?? 0) + i.quantity;
                        return acc;
                    }, {});

                const topItems = restaurant.menu
                    .filter((m) => itemFreq[m.id])
                    .sort((a, b) => (itemFreq[b.id] ?? 0) - (itemFreq[a.id] ?? 0))
                    .slice(0, 2);

                if (topItems.length > 0) {
                    suggestions.push({
                        restaurant,
                        items: topItems,
                        reason: 'Your usual order',
                    });
                }
            }
        }
    }

    // Suggestion 2: Time-of-day appropriate
    const calorieTarget = isBreakfast ? 400 : isLunch ? 650 : 800;
    const timeLabel = isBreakfast ? 'Light morning option' : isLunch ? 'Perfect for lunch' : 'Great for dinner';

    const timeMatch = restaurants
        .flatMap((r) => r.menu.map((item) => ({ restaurant: r, item })))
        .filter(({ item }) => Math.abs(item.calories - calorieTarget) < 200)
        .sort((a, b) => b.restaurant.rating - a.restaurant.rating)[0];

    if (timeMatch) {
        suggestions.push({
            restaurant: timeMatch.restaurant,
            items: [timeMatch.item],
            reason: timeLabel,
        });
    }

    // Suggestion 3: Calorie-budget aware (if set)
    if (calorieBudget) {
        const budgetMatch = restaurants
            .flatMap((r) => r.menu.map((item) => ({ restaurant: r, item })))
            .filter(({ item }) => item.calories <= calorieBudget && item.calories > 100)
            .sort((a, b) => b.restaurant.rating - a.restaurant.rating)[0];

        if (budgetMatch) {
            suggestions.push({
                restaurant: budgetMatch.restaurant,
                items: [budgetMatch.item],
                reason: 'Fits your calorie budget',
            });
        }
    }

    // Suggestion 4: Highest-rated popular item we haven't suggested yet
    const usedRestaurantIds = new Set(suggestions.map((s) => s.restaurant.id));
    const popularMatch = restaurants
        .filter((r) => !usedRestaurantIds.has(r.id))
        .sort((a, b) => b.rating - a.rating)
        .flatMap((r) => r.menu.filter((m) => m.popular).map((item) => ({ restaurant: r, item })))[0];

    if (popularMatch) {
        suggestions.push({
            restaurant: popularMatch.restaurant,
            items: [popularMatch.item],
            reason: 'Trending & highly rated',
        });
    }

    return suggestions.slice(0, 3);
}
