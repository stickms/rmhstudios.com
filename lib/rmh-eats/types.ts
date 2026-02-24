export interface Allergen {
    name: string;
    icon: string;
}

export interface CustomizationOption {
    id: string;
    name: string;
    choices: { label: string; priceModifier: number }[];
    required: boolean;
}

export interface MenuItem {
    id: string;
    name: string;
    description: string;
    price: number;
    calories: number;
    category: string;
    image: string;
    allergens: string[];
    customizations?: CustomizationOption[];
    popular?: boolean;
    vegetarian?: boolean;
    vegan?: boolean;
    spicy?: boolean;
}

export interface Restaurant {
    id: string;
    name: string;
    cuisine: string;
    rating: number;
    reviewCount: number;
    deliveryTime: string;
    deliveryFee: number;
    minimumOrder: number;
    image: string;
    coverImage: string;
    description: string;
    address: string;
    phone: string;
    hours: string;
    categories: string[];
    menu: MenuItem[];
    tags: string[];
    carbonScore: number;        // 1–10 (1=greenest, 10=highest footprint)
    deliveryTimeMinutes: number; // numeric midpoint for sorting
}

export interface CartItem {
    menuItem: MenuItem;
    quantity: number;
    restaurantId: string;
    restaurantName: string;
    selectedOptions?: Record<string, string>;
    specialInstructions?: string;
}

export interface Address {
    id: string;
    label: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    isDefault: boolean;
}

export interface PaymentMethod {
    id: string;
    type: 'card' | 'paypal';
    label: string;
    last4?: string;
    brand?: string;
    expiryMonth?: number;
    expiryYear?: number;
    email?: string;
    isDefault: boolean;
}

export type OrderStatus =
    | 'received'
    | 'preparing'
    | 'out_for_delivery'
    | 'delivered';

export interface OrderItem {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    calories?: number;
    selectedOptions?: Record<string, string>;
    specialInstructions?: string;
}

export interface DriverInfo {
    name: string;
    emoji: string;
    phone: string;
    rating: number;
}

export interface Order {
    id: string;
    restaurantId: string;
    restaurantName: string;
    items: OrderItem[];
    subtotal: number;
    deliveryFee: number;
    serviceFee: number;
    tip: number;
    total: number;
    address: Address;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
    placedAt: string;
    estimatedDelivery: string;
    statusHistory: { status: OrderStatus; timestamp: string }[];
    reviewed?: boolean;
    // New fields
    promoCode?: string;
    promoDiscount?: number;
    donationAmount?: number;
    leaveAtDoor?: boolean;
    deliveryInstructions?: string;
    scheduledFor?: string;
    giftRecipientName?: string;
    giftMessage?: string;
    driver?: DriverInfo;
    issueReported?: boolean;
    loyaltyPointsEarned?: number;
}

export interface Review {
    restaurantId: string;
    orderId: string;
    rating: number;
    comment: string;
    createdAt: string;
    itemRatings?: Record<string, number>;
}

export type IssueType = 'missing_item' | 'wrong_item' | 'quality' | 'late_delivery' | 'other';

export interface OrderIssue {
    id: string;
    orderId: string;
    issueType: IssueType;
    description: string;
    reportedAt: string;
    status: 'pending' | 'reviewing' | 'resolved';
    refundAmount?: number;
}

export interface SavedOrder {
    id: string;
    label: string;
    restaurantId: string;
    restaurantName: string;
    restaurantImage: string;
    items: { menuItemId: string; name: string; quantity: number; selectedOptions?: Record<string, string> }[];
    savedAt: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'bot';
    text: string;
    timestamp: string;
}

export type EatsView =
    | 'home'
    | 'restaurant'
    | 'checkout'
    | 'confirmation'
    | 'history'
    | 'tracker'
    | 'addresses'
    | 'payments'
    | 'reviews'
    | 'favorites'
    | 'profile'
    | 'issue-report'
    | 'split-bill'
    | 'price-compare'
    | 'mood'
    | 'chatbot'
    | 'calorie-planner';
