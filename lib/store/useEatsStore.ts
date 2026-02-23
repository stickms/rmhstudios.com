import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    CartItem,
    Address,
    PaymentMethod,
    Order,
    Review,
    EatsView,
    OrderStatus,
    MenuItem,
    OrderIssue,
    IssueType,
    SavedOrder,
} from '@/lib/rmh-eats/types';
import { mockDrivers } from '@/lib/rmh-eats/mockData';

interface DietFilters {
    vegetarian: boolean;
    vegan: boolean;
    spicy: boolean;
}

interface EatsState {
    // Navigation
    view: EatsView;
    selectedRestaurantId: string | null;
    selectedOrderId: string | null;
    reviewTargetOrderId: string | null;
    issueTargetOrderId: string | null;
    splitBillTargetOrderId: string | null;
    previousView: EatsView | null;

    // Cart
    cart: CartItem[];
    cartRestaurantId: string | null;
    cartRestaurantName: string | null;

    // Addresses
    addresses: Address[];

    // Payment Methods
    paymentMethods: PaymentMethod[];

    // Orders
    orders: Order[];

    // Reviews
    reviews: Review[];

    // Favorites
    favoriteRestaurantIds: string[];

    // Recently viewed
    recentlyViewedIds: string[];

    // Saved orders
    savedOrders: SavedOrder[];

    // Loyalty points
    loyaltyPoints: number;

    // Dietary filters
    dietFilters: DietFilters;

    // Issue reports
    orderIssues: OrderIssue[];

    // Calorie budget
    calorieBudget: number | null;

    // Mood filter
    moodCuisineFilter: string | null;

    // Actions — Navigation
    setView: (view: EatsView) => void;
    selectRestaurant: (id: string) => void;
    goHome: () => void;
    openTracker: (orderId: string) => void;
    openReview: (orderId: string) => void;
    openIssueReport: (orderId: string) => void;
    openSplitBill: (orderId: string) => void;
    openChatbot: () => void;
    goBack: () => void;

    // Actions — Cart
    addToCart: (item: MenuItem, restaurantId: string, restaurantName: string, qty: number, options?: Record<string, string>, instructions?: string) => void;
    removeFromCart: (itemId: string) => void;
    updateQuantity: (itemId: string, qty: number) => void;
    clearCart: () => void;

    // Actions — Addresses
    addAddress: (address: Omit<Address, 'id'>) => void;
    updateAddress: (id: string, data: Partial<Address>) => void;
    deleteAddress: (id: string) => void;
    setDefaultAddress: (id: string) => void;

    // Actions — Payment Methods
    addPaymentMethod: (method: Omit<PaymentMethod, 'id'>) => void;
    deletePaymentMethod: (id: string) => void;
    setDefaultPaymentMethod: (id: string) => void;

    // Actions — Orders
    placeOrder: (order: Omit<Order, 'id' | 'status' | 'placedAt' | 'statusHistory' | 'estimatedDelivery'>) => string;
    advanceOrderStatus: (orderId: string) => void;

    // Actions — Reviews
    submitReview: (review: Omit<Review, 'createdAt'>) => void;

    // Actions — Favorites
    toggleFavorite: (restaurantId: string) => void;

    // Actions — Recently viewed
    recordView: (restaurantId: string) => void;

    // Actions — Saved orders
    saveCurrentCart: (label: string) => void;
    deleteSavedOrder: (id: string) => void;
    loadSavedOrder: (savedOrderId: string) => void;

    // Actions — Diet filters
    setDietFilter: (key: keyof DietFilters, value: boolean) => void;

    // Actions — Issues
    reportIssue: (issue: Omit<OrderIssue, 'id' | 'reportedAt' | 'status'> & { refundAmount?: number }) => void;
    resolveIssue: (issueId: string) => void;

    // Actions — Calorie budget
    setCalorieBudget: (calories: number | null) => void;

    // Actions — Mood filter
    setMoodFilter: (cuisine: string | null) => void;

    // Computed helpers
    cartTotal: () => number;
    cartItemCount: () => number;
    cartCalories: () => number;
}

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function estimatedDelivery(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + Math.floor(Math.random() * 25) + 20);
    return now.toISOString();
}

export const useEatsStore = create<EatsState>()(
    persist(
        (set, get) => ({
            view: 'home',
            selectedRestaurantId: null,
            selectedOrderId: null,
            reviewTargetOrderId: null,
            issueTargetOrderId: null,
            splitBillTargetOrderId: null,
            previousView: null,

            cart: [],
            cartRestaurantId: null,
            cartRestaurantName: null,

            addresses: [
                {
                    id: uid(),
                    label: 'Home',
                    street: '42 Maple Street',
                    city: 'Springfield',
                    state: 'IL',
                    zip: '62701',
                    isDefault: true,
                },
            ],

            paymentMethods: [
                {
                    id: uid(),
                    type: 'card',
                    label: 'Visa ending in 4242',
                    last4: '4242',
                    brand: 'Visa',
                    expiryMonth: 12,
                    expiryYear: 2027,
                    isDefault: true,
                },
            ],

            orders: [],
            reviews: [],
            favoriteRestaurantIds: [],
            recentlyViewedIds: [],
            savedOrders: [],
            loyaltyPoints: 0,
            dietFilters: { vegetarian: false, vegan: false, spicy: false },
            orderIssues: [],
            calorieBudget: null,
            moodCuisineFilter: null,

            // Navigation
            setView: (view) => set((s) => ({ previousView: s.view, view })),
            selectRestaurant: (id) => set((s) => ({ previousView: s.view, selectedRestaurantId: id, view: 'restaurant' })),
            goHome: () => set({ previousView: null, view: 'home', selectedRestaurantId: null }),
            goBack: () => set((s) => {
                const prev = s.previousView ?? 'home';
                return { view: prev, previousView: null, selectedRestaurantId: prev === 'home' ? null : s.selectedRestaurantId };
            }),
            openTracker: (orderId) => set((s) => ({ previousView: s.view, selectedOrderId: orderId, view: 'tracker' })),
            openReview: (orderId) => set((s) => ({ previousView: s.view, reviewTargetOrderId: orderId, view: 'reviews' })),
            openIssueReport: (orderId) => set((s) => ({ previousView: s.view, issueTargetOrderId: orderId, view: 'issue-report' })),
            openSplitBill: (orderId) => set((s) => ({ previousView: s.view, splitBillTargetOrderId: orderId, view: 'split-bill' })),
            openChatbot: () => set((s) => ({ previousView: s.view, view: 'chatbot' })),

            // Cart
            addToCart: (item, restaurantId, restaurantName, qty, options, instructions) => {
                const { cart, cartRestaurantId } = get();

                if (cartRestaurantId && cartRestaurantId !== restaurantId) {
                    set({
                        cart: [],
                        cartRestaurantId: restaurantId,
                        cartRestaurantName: restaurantName,
                    });
                }

                const existing = cart.find(
                    (c) =>
                        c.menuItem.id === item.id &&
                        JSON.stringify(c.selectedOptions) === JSON.stringify(options)
                );

                if (existing) {
                    set({
                        cart: cart.map((c) =>
                            c.menuItem.id === item.id &&
                            JSON.stringify(c.selectedOptions) === JSON.stringify(options)
                                ? { ...c, quantity: c.quantity + qty }
                                : c
                        ),
                        cartRestaurantId: restaurantId,
                        cartRestaurantName: restaurantName,
                    });
                } else {
                    set({
                        cart: [
                            ...cart,
                            {
                                menuItem: item,
                                quantity: qty,
                                restaurantId,
                                restaurantName,
                                selectedOptions: options,
                                specialInstructions: instructions,
                            },
                        ],
                        cartRestaurantId: restaurantId,
                        cartRestaurantName: restaurantName,
                    });
                }
            },

            removeFromCart: (itemId) => {
                const newCart = get().cart.filter((c) => c.menuItem.id !== itemId);
                set({
                    cart: newCart,
                    cartRestaurantId: newCart.length === 0 ? null : get().cartRestaurantId,
                    cartRestaurantName: newCart.length === 0 ? null : get().cartRestaurantName,
                });
            },

            updateQuantity: (itemId, qty) => {
                if (qty <= 0) {
                    get().removeFromCart(itemId);
                    return;
                }
                set({
                    cart: get().cart.map((c) =>
                        c.menuItem.id === itemId ? { ...c, quantity: qty } : c
                    ),
                });
            },

            clearCart: () =>
                set({ cart: [], cartRestaurantId: null, cartRestaurantName: null }),

            // Addresses
            addAddress: (address) => {
                const newAddress: Address = { ...address, id: uid() };
                const existing = get().addresses;
                set({
                    addresses: existing.length === 0 || address.isDefault
                        ? [
                              ...existing.map((a) => ({ ...a, isDefault: false })),
                              { ...newAddress, isDefault: true },
                          ]
                        : [...existing, newAddress],
                });
            },

            updateAddress: (id, data) => {
                set({
                    addresses: get().addresses.map((a) =>
                        a.id === id ? { ...a, ...data } : a
                    ),
                });
            },

            deleteAddress: (id) => {
                const remaining = get().addresses.filter((a) => a.id !== id);
                if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
                    remaining[0].isDefault = true;
                }
                set({ addresses: remaining });
            },

            setDefaultAddress: (id) => {
                set({
                    addresses: get().addresses.map((a) => ({
                        ...a,
                        isDefault: a.id === id,
                    })),
                });
            },

            // Payment Methods
            addPaymentMethod: (method) => {
                const newMethod: PaymentMethod = { ...method, id: uid() };
                const existing = get().paymentMethods;
                set({
                    paymentMethods: existing.length === 0 || method.isDefault
                        ? [
                              ...existing.map((m) => ({ ...m, isDefault: false })),
                              { ...newMethod, isDefault: true },
                          ]
                        : [...existing, newMethod],
                });
            },

            deletePaymentMethod: (id) => {
                const remaining = get().paymentMethods.filter((m) => m.id !== id);
                if (remaining.length > 0 && !remaining.some((m) => m.isDefault)) {
                    remaining[0].isDefault = true;
                }
                set({ paymentMethods: remaining });
            },

            setDefaultPaymentMethod: (id) => {
                set({
                    paymentMethods: get().paymentMethods.map((m) => ({
                        ...m,
                        isDefault: m.id === id,
                    })),
                });
            },

            // Orders
            placeOrder: (orderData) => {
                const id = uid().toUpperCase();
                const now = new Date().toISOString();
                const pointsEarned = Math.floor(orderData.total);
                const order: Order = {
                    ...orderData,
                    id,
                    status: 'received',
                    placedAt: now,
                    estimatedDelivery: estimatedDelivery(),
                    statusHistory: [{ status: 'received', timestamp: now }],
                    loyaltyPointsEarned: pointsEarned,
                };
                set({
                    orders: [order, ...get().orders],
                    loyaltyPoints: get().loyaltyPoints + pointsEarned,
                });
                return id;
            },

            advanceOrderStatus: (orderId) => {
                const statusFlow: OrderStatus[] = [
                    'received',
                    'preparing',
                    'out_for_delivery',
                    'delivered',
                ];
                const now = new Date().toISOString();
                set({
                    orders: get().orders.map((o) => {
                        if (o.id !== orderId) return o;
                        const currentIdx = statusFlow.indexOf(o.status);
                        const nextStatus = statusFlow[Math.min(currentIdx + 1, statusFlow.length - 1)];
                        const driver = nextStatus === 'out_for_delivery' && !o.driver
                            ? mockDrivers[Math.floor(Math.random() * mockDrivers.length)]
                            : o.driver;
                        return {
                            ...o,
                            status: nextStatus,
                            statusHistory: [...o.statusHistory, { status: nextStatus, timestamp: now }],
                            driver,
                        };
                    }),
                });
            },

            // Reviews
            submitReview: (reviewData) => {
                const review: Review = {
                    ...reviewData,
                    createdAt: new Date().toISOString(),
                };
                set({
                    reviews: [...get().reviews, review],
                    orders: get().orders.map((o) =>
                        o.id === reviewData.orderId ? { ...o, reviewed: true } : o
                    ),
                    view: 'home',
                    reviewTargetOrderId: null,
                });
            },

            // Favorites
            toggleFavorite: (restaurantId) => {
                const { favoriteRestaurantIds } = get();
                const isFav = favoriteRestaurantIds.includes(restaurantId);
                set({
                    favoriteRestaurantIds: isFav
                        ? favoriteRestaurantIds.filter((id) => id !== restaurantId)
                        : [...favoriteRestaurantIds, restaurantId],
                });
            },

            // Recently viewed
            recordView: (restaurantId) => {
                const prev = get().recentlyViewedIds.filter((id) => id !== restaurantId);
                set({ recentlyViewedIds: [restaurantId, ...prev].slice(0, 8) });
            },

            // Saved orders
            saveCurrentCart: (label) => {
                const { cart, cartRestaurantId, cartRestaurantName } = get();
                if (!cartRestaurantId || cart.length === 0) return;
                const { mockRestaurants } = require('@/lib/rmh-eats/mockData');
                const restaurant = mockRestaurants.find((r: { id: string; image: string }) => r.id === cartRestaurantId);
                const savedOrder: SavedOrder = {
                    id: uid(),
                    label,
                    restaurantId: cartRestaurantId,
                    restaurantName: cartRestaurantName ?? '',
                    restaurantImage: restaurant?.image ?? '🍽️',
                    items: cart.map((c) => ({
                        menuItemId: c.menuItem.id,
                        name: c.menuItem.name,
                        quantity: c.quantity,
                        selectedOptions: c.selectedOptions,
                    })),
                    savedAt: new Date().toISOString(),
                };
                set({ savedOrders: [savedOrder, ...get().savedOrders] });
            },

            deleteSavedOrder: (id) => {
                set({ savedOrders: get().savedOrders.filter((s) => s.id !== id) });
            },

            loadSavedOrder: (savedOrderId) => {
                const savedOrder = get().savedOrders.find((s) => s.id === savedOrderId);
                if (!savedOrder) return;
                const { mockRestaurants } = require('@/lib/rmh-eats/mockData');
                const restaurant = mockRestaurants.find((r: { id: string }) => r.id === savedOrder.restaurantId);
                if (!restaurant) return;
                set({ cart: [], cartRestaurantId: null, cartRestaurantName: null });
                savedOrder.items.forEach((item) => {
                    const menuItem = restaurant.menu.find((m: { id: string }) => m.id === item.menuItemId);
                    if (menuItem) {
                        get().addToCart(menuItem, restaurant.id, restaurant.name, item.quantity, item.selectedOptions);
                    }
                });
            },

            // Diet filters
            setDietFilter: (key, value) => {
                set({ dietFilters: { ...get().dietFilters, [key]: value } });
            },

            // Issues
            reportIssue: (issueData) => {
                const issue: OrderIssue = {
                    ...issueData,
                    id: uid(),
                    reportedAt: new Date().toISOString(),
                    status: 'pending',
                };
                set({
                    orderIssues: [...get().orderIssues, issue],
                    orders: get().orders.map((o) =>
                        o.id === issueData.orderId ? { ...o, issueReported: true } : o
                    ),
                });
            },

            resolveIssue: (issueId) => {
                set({
                    orderIssues: get().orderIssues.map((i) =>
                        i.id === issueId ? { ...i, status: 'resolved' } : i
                    ),
                });
            },

            // Calorie budget
            setCalorieBudget: (calories) => set({ calorieBudget: calories }),

            // Mood filter
            setMoodFilter: (cuisine) => set({ moodCuisineFilter: cuisine, view: 'home' }),

            // Computed helpers
            cartTotal: () => {
                return get().cart.reduce((sum, item) => {
                    let itemPrice = item.menuItem.price;
                    if (item.selectedOptions && item.menuItem.customizations) {
                        for (const [customId, choiceLabel] of Object.entries(item.selectedOptions)) {
                            const custom = item.menuItem.customizations.find((c) => c.id === customId);
                            const choice = custom?.choices.find((ch) => ch.label === choiceLabel);
                            if (choice) itemPrice += choice.priceModifier;
                        }
                    }
                    return sum + itemPrice * item.quantity;
                }, 0);
            },

            cartItemCount: () => {
                return get().cart.reduce((sum, item) => sum + item.quantity, 0);
            },

            cartCalories: () => {
                return get().cart.reduce((sum, item) => {
                    return sum + (item.menuItem.calories ?? 0) * item.quantity;
                }, 0);
            },
        }),
        {
            name: 'rmh-eats-store',
            partialize: (state) => ({
                cart: state.cart,
                cartRestaurantId: state.cartRestaurantId,
                cartRestaurantName: state.cartRestaurantName,
                addresses: state.addresses,
                paymentMethods: state.paymentMethods,
                orders: state.orders,
                reviews: state.reviews,
                favoriteRestaurantIds: state.favoriteRestaurantIds,
                recentlyViewedIds: state.recentlyViewedIds,
                savedOrders: state.savedOrders,
                loyaltyPoints: state.loyaltyPoints,
                dietFilters: state.dietFilters,
                orderIssues: state.orderIssues,
                calorieBudget: state.calorieBudget,
            }),
        }
    )
);
