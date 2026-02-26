'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    MapPin,
    CreditCard,
    Plus,
    Check,
    ChevronRight,
    Bike,
    Clock,
    Tag,
    Trophy,
    DoorOpen,
    FileText,
    Gift,
    Calendar,
    Heart,
    X,
} from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { mockRestaurants } from '@/lib/rmh-eats/mockData';
import { toast } from 'sonner';

const SERVICE_FEE_RATE = 0.08;
const TIP_OPTIONS = [0, 10, 15, 20, 25];

const PROMO_CODES: Record<string, { type: 'percent' | 'delivery'; value: number; label: string }> = {
    SAVE10: { type: 'percent', value: 0.10, label: '10% off subtotal' },
    WELCOME20: { type: 'percent', value: 0.20, label: '20% off subtotal' },
    FREEDELIVERY: { type: 'delivery', value: 0, label: 'Free delivery' },
};

function getTimeSlots(): string[] {
    const slots: string[] = [];
    const now = new Date();
    const start = new Date(now);
    start.setHours(now.getHours() + 1, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 30, 0, 0);
    while (start <= end) {
        slots.push(start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        start.setMinutes(start.getMinutes() + 30);
    }
    return slots;
}

export default function Checkout() {
    const { cart, cartRestaurantId, addresses, paymentMethods, loyaltyPoints, cartTotal, placeOrder, clearCart, setView } =
        useEatsStore();

    const restaurant = useMemo(
        () => mockRestaurants.find((r) => r.id === cartRestaurantId),
        [cartRestaurantId]
    );

    const [selectedAddressId, setSelectedAddressId] = useState<string>(
        addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? ''
    );
    const [selectedPaymentId, setSelectedPaymentId] = useState<string>(
        paymentMethods.find((m) => m.isDefault)?.id ?? paymentMethods[0]?.id ?? ''
    );
    const [tipPercent, setTipPercent] = useState(15);
    const [customTip, setCustomTip] = useState('');
    const [isPlacing, setIsPlacing] = useState(false);

    // Address form
    const [showNewAddress, setShowNewAddress] = useState(false);
    const [newAddr, setNewAddr] = useState({ label: '', street: '', city: '', state: '', zip: '' });

    // Payment form
    const [showNewPayment, setShowNewPayment] = useState(false);
    const [newCard, setNewCard] = useState({ number: '', expiry: '', cvc: '', name: '' });

    // Promo code
    const [promoInput, setPromoInput] = useState('');
    const [appliedPromo, setAppliedPromo] = useState<{ code: string; type: 'percent' | 'delivery'; value: number; label: string } | null>(null);

    // Loyalty points
    const [redeemPoints, setRedeemPoints] = useState(false);

    // Delivery options
    const [leaveAtDoor, setLeaveAtDoor] = useState(false);
    const [deliveryInstructions, setDeliveryInstructions] = useState('');

    // Gift
    const [isGift, setIsGift] = useState(false);
    const [giftRecipient, setGiftRecipient] = useState('');
    const [giftMessage, setGiftMessage] = useState('');

    // Scheduled
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledDate, setScheduledDate] = useState<'today' | 'tomorrow'>('today');
    const [scheduledTime, setScheduledTime] = useState('');

    // Donation
    const [isDonating, setIsDonating] = useState(false);

    const addAddress = useEatsStore((s) => s.addAddress);
    const addPaymentMethod = useEatsStore((s) => s.addPaymentMethod);

    const subtotal = cartTotal();
    const deliveryFee = appliedPromo?.type === 'delivery' ? 0 : (restaurant?.deliveryFee ?? 0);
    const promoDiscount = appliedPromo?.type === 'percent' ? subtotal * appliedPromo.value : 0;
    const discountedSubtotal = subtotal - promoDiscount;
    const serviceFee = discountedSubtotal * SERVICE_FEE_RATE;
    const tipAmount = customTip
        ? parseFloat(customTip) || 0
        : (discountedSubtotal * tipPercent) / 100;

    // Loyalty redemption
    const maxPointsRedeemable = Math.min(loyaltyPoints, Math.floor(discountedSubtotal * 0.5 * 100)); // max 50% of discounted subtotal in cents
    const loyaltyDiscount = redeemPoints && maxPointsRedeemable > 0 ? maxPointsRedeemable / 100 : 0;

    const baseTotal = discountedSubtotal + deliveryFee + serviceFee + tipAmount - loyaltyDiscount;

    // Donation rounding
    const roundUpAmount = baseTotal % 1 === 0 ? 1.00 : parseFloat((1 - (baseTotal % 1)).toFixed(2));
    const donationAmount = isDonating ? roundUpAmount : 0;

    const grandTotal = baseTotal + donationAmount;

    const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
    const selectedPayment = paymentMethods.find((m) => m.id === selectedPaymentId);

    const timeSlots = useMemo(() => getTimeSlots(), []);

    function handleApplyPromo() {
        const code = promoInput.trim().toUpperCase();
        const promo = PROMO_CODES[code];
        if (!promo) {
            toast.error('Invalid promo code');
            return;
        }
        setAppliedPromo({ code, ...promo });
        setPromoInput('');
        toast.success(`${code} applied — ${promo.label}!`, { icon: '🎉' });
    }

    function handleRemovePromo() {
        setAppliedPromo(null);
        toast.success('Promo code removed');
    }

    const handleSaveAddress = () => {
        if (!newAddr.street || !newAddr.city || !newAddr.state || !newAddr.zip) {
            toast.error('Please fill in all address fields');
            return;
        }
        addAddress({ ...newAddr, isDefault: false });
        toast.success('Address saved!');
        setShowNewAddress(false);
        setNewAddr({ label: '', street: '', city: '', state: '', zip: '' });
    };

    const handleSavePayment = () => {
        if (!newCard.number || !newCard.expiry || !newCard.cvc || !newCard.name) {
            toast.error('Please fill in all card fields');
            return;
        }
        const last4 = newCard.number.replace(/\s/g, '').slice(-4);
        addPaymentMethod({
            type: 'card',
            label: `Card ending in ${last4}`,
            last4,
            brand: 'Visa',
            isDefault: false,
        });
        toast.success('Card saved!');
        setShowNewPayment(false);
        setNewCard({ number: '', expiry: '', cvc: '', name: '' });
    };

    const handlePlaceOrder = async () => {
        if (!selectedAddress || !selectedPayment || !restaurant) {
            toast.error('Please select an address and payment method');
            return;
        }
        if (isScheduled && !scheduledTime) {
            toast.error('Please select a delivery time');
            return;
        }
        setIsPlacing(true);

        await new Promise((res) => setTimeout(res, 1200));

        let scheduledFor: string | undefined;
        if (isScheduled && scheduledTime) {
            const date = new Date();
            if (scheduledDate === 'tomorrow') date.setDate(date.getDate() + 1);
            const [h, m] = scheduledTime.split(':');
            date.setHours(parseInt(h), parseInt(m), 0, 0);
            scheduledFor = date.toISOString();
        }

        const orderId = placeOrder({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            items: cart.map((c) => ({
                menuItemId: c.menuItem.id,
                name: c.menuItem.name,
                price: c.menuItem.price,
                quantity: c.quantity,
                calories: c.menuItem.calories,
                selectedOptions: c.selectedOptions,
                specialInstructions: c.specialInstructions,
            })),
            subtotal,
            deliveryFee,
            serviceFee,
            tip: tipAmount,
            total: grandTotal,
            address: selectedAddress,
            paymentMethod: selectedPayment,
            promoCode: appliedPromo?.code,
            promoDiscount: promoDiscount > 0 ? promoDiscount : undefined,
            donationAmount: donationAmount > 0 ? donationAmount : undefined,
            leaveAtDoor: leaveAtDoor || undefined,
            deliveryInstructions: deliveryInstructions.trim() || undefined,
            scheduledFor,
            giftRecipientName: isGift && giftRecipient ? giftRecipient : undefined,
            giftMessage: isGift && giftMessage ? giftMessage : undefined,
        });

        clearCart();
        useEatsStore.setState({ selectedOrderId: orderId });
        setView('confirmation');
    };

    if (!restaurant || cart.length === 0) {
        return (
            <div className="flex flex-col items-center gap-4 py-24">
                <span className="text-5xl">🛒</span>
                <p className="text-slate-400">Nothing to check out.</p>
                <button onClick={() => setView('home')} className="text-orange-400 hover:text-orange-300 text-sm">
                    Browse restaurants
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => setView('home')}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white">Checkout</h2>
                    <p className="text-sm text-slate-400">{restaurant.name}</p>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {/* Order Summary */}
                <Section title="Order Summary">
                    <div className="space-y-2">
                        {cart.map((item) => (
                            <div
                                key={`${item.menuItem.id}-${JSON.stringify(item.selectedOptions)}`}
                                className="flex justify-between items-start gap-3 text-sm"
                            >
                                <div className="flex gap-2 flex-1 min-w-0">
                                    <span className="text-lg shrink-0">{item.menuItem.image}</span>
                                    <div className="min-w-0">
                                        <p className="text-white truncate">
                                            {item.quantity}× {item.menuItem.name}
                                        </p>
                                        {item.selectedOptions &&
                                            Object.entries(item.selectedOptions).map(([, v]) => (
                                                <p key={v} className="text-xs text-slate-400">{v}</p>
                                            ))}
                                    </div>
                                </div>
                                <span className="text-slate-300 shrink-0">
                                    ${(item.menuItem.price * item.quantity).toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-700 space-y-1.5">
                        <FeeRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
                        {promoDiscount > 0 && (
                            <FeeRow label={`Promo (${appliedPromo!.code})`} value={`−$${promoDiscount.toFixed(2)}`} green />
                        )}
                        <FeeRow
                            label="Delivery fee"
                            value={deliveryFee === 0 ? 'Free' : `$${deliveryFee.toFixed(2)}`}
                            green={deliveryFee === 0}
                        />
                        <FeeRow label="Service fee (8%)" value={`$${serviceFee.toFixed(2)}`} dim />
                        <FeeRow label={`Tip (${tipPercent}%)`} value={`$${tipAmount.toFixed(2)}`} dim />
                        {loyaltyDiscount > 0 && (
                            <FeeRow label="Loyalty points" value={`−$${loyaltyDiscount.toFixed(2)}`} green />
                        )}
                        {donationAmount > 0 && (
                            <FeeRow label="Donation 💚" value={`$${donationAmount.toFixed(2)}`} dim />
                        )}
                        <div className="flex justify-between font-bold text-white text-base pt-2 border-t border-slate-700/50">
                            <span>Total</span>
                            <span className="text-orange-400">${grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                        <Clock className="h-4 w-4 text-orange-400" />
                        <span>Est. delivery: {isScheduled && scheduledTime ? scheduledTime : restaurant.deliveryTime}</span>
                        <Bike className="h-4 w-4 text-orange-400 ml-2" />
                        <span>To your address</span>
                    </div>
                </Section>

                {/* Promo Code */}
                <Section title="Promo Code" icon={<Tag className="h-4 w-4 text-orange-400" />}>
                    {appliedPromo ? (
                        <div className="flex items-center justify-between rounded-xl bg-green-500/10 border border-green-500/30 px-3 py-2.5">
                            <div>
                                <p className="text-sm font-semibold text-green-400">{appliedPromo.code}</p>
                                <p className="text-xs text-slate-400">{appliedPromo.label}</p>
                            </div>
                            <button onClick={handleRemovePromo} className="text-slate-500 hover:text-red-400 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <input
                                value={promoInput}
                                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                                placeholder="Enter code (try SAVE10)"
                                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                            />
                            <button
                                onClick={handleApplyPromo}
                                disabled={!promoInput.trim()}
                                className="rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </Section>

                {/* Loyalty Points */}
                {loyaltyPoints > 0 && (
                    <Section title="Loyalty Points" icon={<Trophy className="h-4 w-4 text-orange-400" />}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-white">
                                    Balance: <span className="font-semibold text-orange-400">{loyaltyPoints} pts</span>
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Redeem {maxPointsRedeemable} pts = ${loyaltyDiscount > 0 ? loyaltyDiscount.toFixed(2) : (maxPointsRedeemable / 100).toFixed(2)} off
                                    {maxPointsRedeemable < loyaltyPoints && ' (max 50% of order)'}
                                </p>
                            </div>
                            <button
                                onClick={() => setRedeemPoints(!redeemPoints)}
                                className={`relative h-6 w-11 rounded-full transition-colors ${redeemPoints ? 'bg-orange-500' : 'bg-slate-600'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${redeemPoints ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </Section>
                )}

                {/* Tip */}
                <Section title="Add a Tip">
                    <div className="flex gap-2 flex-wrap">
                        {TIP_OPTIONS.map((pct) => (
                            <button
                                key={pct}
                                onClick={() => {
                                    setTipPercent(pct);
                                    setCustomTip('');
                                }}
                                className={`rounded-xl px-4 py-2 text-sm font-medium border transition-all ${
                                    tipPercent === pct && !customTip
                                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                                }`}
                            >
                                {pct === 0 ? 'No tip' : `${pct}%`}
                            </button>
                        ))}
                        <input
                            type="number"
                            placeholder="Custom $"
                            value={customTip}
                            onChange={(e) => {
                                setCustomTip(e.target.value);
                                setTipPercent(-1);
                            }}
                            className="w-24 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                        />
                    </div>
                </Section>

                {/* Scheduled Delivery */}
                <Section title="Delivery Time" icon={<Calendar className="h-4 w-4 text-orange-400" />}>
                    <div className="flex gap-3 mb-3">
                        <button
                            onClick={() => setIsScheduled(false)}
                            className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-all ${
                                !isScheduled ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-slate-700 bg-slate-800 text-slate-400'
                            }`}
                        >
                            ASAP
                        </button>
                        <button
                            onClick={() => setIsScheduled(true)}
                            className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-all ${
                                isScheduled ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-slate-700 bg-slate-800 text-slate-400'
                            }`}
                        >
                            Schedule for later
                        </button>
                    </div>
                    <AnimatePresence>
                        {isScheduled && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden space-y-2"
                            >
                                <div className="flex gap-2">
                                    {(['today', 'tomorrow'] as const).map((d) => (
                                        <button
                                            key={d}
                                            onClick={() => setScheduledDate(d)}
                                            className={`flex-1 rounded-xl border py-2 text-sm transition-all capitalize ${
                                                scheduledDate === d ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-slate-700 bg-slate-800 text-slate-400'
                                            }`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                                <select
                                    value={scheduledTime}
                                    onChange={(e) => setScheduledTime(e.target.value)}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500"
                                >
                                    <option value="">Select time...</option>
                                    {timeSlots.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Section>

                {/* Delivery Address */}
                <Section
                    title="Delivery Address"
                    action={
                        <button
                            onClick={() => setView('addresses')}
                            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-0.5"
                        >
                            Manage <ChevronRight className="h-3 w-3" />
                        </button>
                    }
                >
                    {addresses.length === 0 ? (
                        <button
                            onClick={() => setShowNewAddress(true)}
                            className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300"
                        >
                            <Plus className="h-4 w-4" />
                            Add an address
                        </button>
                    ) : (
                        <div className="space-y-2">
                            {addresses.map((addr) => (
                                <button
                                    key={addr.id}
                                    onClick={() => setSelectedAddressId(addr.id)}
                                    className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                                        selectedAddressId === addr.id
                                            ? 'border-orange-500 bg-orange-500/10'
                                            : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                                    }`}
                                >
                                    <MapPin className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white">{addr.label || addr.street}</p>
                                        <p className="text-xs text-slate-400">
                                            {addr.street}, {addr.city}, {addr.state} {addr.zip}
                                        </p>
                                    </div>
                                    {selectedAddressId === addr.id && (
                                        <Check className="h-4 w-4 text-orange-400 shrink-0" />
                                    )}
                                </button>
                            ))}
                            <button
                                onClick={() => setShowNewAddress(!showNewAddress)}
                                className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 mt-1"
                            >
                                <Plus className="h-4 w-4" />
                                Add new address
                            </button>
                        </div>
                    )}

                    {showNewAddress && (
                        <div className="mt-3 p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                            <InputField placeholder="Label (e.g. Home, Work)" value={newAddr.label} onChange={(v) => setNewAddr((p) => ({ ...p, label: v }))} />
                            <InputField placeholder="Street address" value={newAddr.street} onChange={(v) => setNewAddr((p) => ({ ...p, street: v }))} />
                            <div className="grid grid-cols-3 gap-2">
                                <InputField placeholder="City" value={newAddr.city} onChange={(v) => setNewAddr((p) => ({ ...p, city: v }))} />
                                <InputField placeholder="State" value={newAddr.state} onChange={(v) => setNewAddr((p) => ({ ...p, state: v }))} />
                                <InputField placeholder="ZIP" value={newAddr.zip} onChange={(v) => setNewAddr((p) => ({ ...p, zip: v }))} />
                            </div>
                            <button onClick={handleSaveAddress} className="w-full rounded-xl bg-orange-500 hover:bg-orange-400 px-4 py-2 text-sm font-medium text-white transition-colors">
                                Save Address
                            </button>
                        </div>
                    )}

                    {/* Delivery options (only when address is selected) */}
                    {selectedAddressId && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-3">
                            {/* Leave at door */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DoorOpen className="h-4 w-4 text-slate-400" />
                                    <span className="text-sm text-slate-300">Leave at door</span>
                                </div>
                                <button
                                    onClick={() => setLeaveAtDoor(!leaveAtDoor)}
                                    className={`relative h-5 w-9 rounded-full transition-colors ${leaveAtDoor ? 'bg-orange-500' : 'bg-slate-600'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${leaveAtDoor ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {/* Delivery instructions */}
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <FileText className="h-4 w-4 text-slate-400" />
                                    <span className="text-sm text-slate-300">Delivery instructions</span>
                                </div>
                                <textarea
                                    value={deliveryInstructions}
                                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                                    placeholder="e.g. Ring the doorbell, leave by the mat..."
                                    rows={2}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500 resize-none"
                                />
                            </div>

                            {/* Gift delivery */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Gift className="h-4 w-4 text-slate-400" />
                                        <span className="text-sm text-slate-300">This is a gift</span>
                                    </div>
                                    <button
                                        onClick={() => setIsGift(!isGift)}
                                        className={`relative h-5 w-9 rounded-full transition-colors ${isGift ? 'bg-orange-500' : 'bg-slate-600'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isGift ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                <AnimatePresence>
                                    {isGift && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden space-y-2"
                                        >
                                            <InputField
                                                placeholder="Recipient's name"
                                                value={giftRecipient}
                                                onChange={setGiftRecipient}
                                            />
                                            <textarea
                                                value={giftMessage}
                                                onChange={(e) => setGiftMessage(e.target.value)}
                                                placeholder="Gift message (optional)"
                                                rows={2}
                                                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500 resize-none"
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
                </Section>

                {/* Payment Method */}
                <Section
                    title="Payment Method"
                    action={
                        <button
                            onClick={() => setView('payments')}
                            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-0.5"
                        >
                            Manage <ChevronRight className="h-3 w-3" />
                        </button>
                    }
                >
                    {paymentMethods.length === 0 ? (
                        <button
                            onClick={() => setShowNewPayment(true)}
                            className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300"
                        >
                            <Plus className="h-4 w-4" />
                            Add a payment method
                        </button>
                    ) : (
                        <div className="space-y-2">
                            {paymentMethods.map((pm) => (
                                <button
                                    key={pm.id}
                                    onClick={() => setSelectedPaymentId(pm.id)}
                                    className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                                        selectedPaymentId === pm.id
                                            ? 'border-orange-500 bg-orange-500/10'
                                            : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                                    }`}
                                >
                                    <CreditCard className="h-4 w-4 text-orange-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm text-white">{pm.label}</p>
                                        {pm.type === 'card' && pm.expiryMonth && (
                                            <p className="text-xs text-slate-400">
                                                Expires {pm.expiryMonth}/{pm.expiryYear}
                                            </p>
                                        )}
                                    </div>
                                    {selectedPaymentId === pm.id && (
                                        <Check className="h-4 w-4 text-orange-400 shrink-0" />
                                    )}
                                </button>
                            ))}
                            <button
                                onClick={() => setShowNewPayment(!showNewPayment)}
                                className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 mt-1"
                            >
                                <Plus className="h-4 w-4" />
                                Add new card
                            </button>
                        </div>
                    )}

                    {showNewPayment && (
                        <div className="mt-3 p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
                            <InputField placeholder="Cardholder name" value={newCard.name} onChange={(v) => setNewCard((p) => ({ ...p, name: v }))} />
                            <InputField placeholder="Card number" value={newCard.number} onChange={(v) => setNewCard((p) => ({ ...p, number: v }))} />
                            <div className="grid grid-cols-2 gap-2">
                                <InputField placeholder="MM/YY" value={newCard.expiry} onChange={(v) => setNewCard((p) => ({ ...p, expiry: v }))} />
                                <InputField placeholder="CVC" value={newCard.cvc} onChange={(v) => setNewCard((p) => ({ ...p, cvc: v }))} />
                            </div>
                            <p className="text-xs text-slate-500">🔒 This is a mock app — no real payment info is stored.</p>
                            <button onClick={handleSavePayment} className="w-full rounded-xl bg-orange-500 hover:bg-orange-400 px-4 py-2 text-sm font-medium text-white transition-colors">
                                Save Card
                            </button>
                        </div>
                    )}
                </Section>

                {/* Donation Rounding */}
                <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                            <Heart className="h-4 w-4 text-red-400 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm text-white font-medium">Round up & donate</p>
                                <p className="text-xs text-slate-400 truncate">
                                    Add ${roundUpAmount.toFixed(2)} to support local food banks
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsDonating(!isDonating)}
                            className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ml-3 ${isDonating ? 'bg-red-500' : 'bg-slate-600'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isDonating ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>

                {/* Place Order */}
                <motion.button
                    onClick={handlePlaceOrder}
                    disabled={isPlacing || !selectedAddress || !selectedPayment}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed py-4 text-lg font-bold text-white transition-colors shadow-xl shadow-orange-500/20"
                >
                    {isPlacing ? (
                        <>
                            <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            Placing your order...
                        </>
                    ) : (
                        <>Place Order · ${grandTotal.toFixed(2)}</>
                    )}
                </motion.button>

                <p className="text-center text-xs text-slate-500 pb-4">
                    🎭 This is a mock app — no real charges will be made.
                </p>
            </div>
        </div>
    );
}

function Section({
    title,
    children,
    action,
    icon,
}: {
    title: string;
    children: React.ReactNode;
    action?: React.ReactNode;
    icon?: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="font-semibold text-white">{title}</h3>
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}

function FeeRow({ label, value, green, dim }: { label: string; value: string; green?: boolean; dim?: boolean }) {
    return (
        <div className="flex justify-between text-sm">
            <span className={dim ? 'text-slate-500' : 'text-slate-400'}>{label}</span>
            <span className={green ? 'text-green-400' : dim ? 'text-slate-500' : 'text-slate-300'}>{value}</span>
        </div>
    );
}

function InputField({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
    return (
        <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
        />
    );
}
