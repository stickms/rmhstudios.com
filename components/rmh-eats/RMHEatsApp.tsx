'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShoppingCart,
    History,
    Home,
    Utensils,
    Heart,
    User,
    Sparkles,
    MessageCircle,
    DollarSign,
    Smile,
    Flame,
    BarChart2,
} from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import RestaurantsList from './RestaurantsList';
import RestaurantDetail from './RestaurantDetail';
import Cart from './Cart';
import Checkout from './Checkout';
import OrderConfirmation from './OrderConfirmation';
import OrderHistory from './OrderHistory';
import OrderTracker from './OrderTracker';
import AddressManager from './AddressManager';
import PaymentManager from './PaymentManager';
import ReviewModal from './ReviewModal';
import FavoritesPage from './FavoritesPage';
import ProfilePage from './ProfilePage';
import IssueReportPage from './IssueReportPage';
import MoodOrderPage from './MoodOrderPage';
import PriceComparePage from './PriceComparePage';
import SplitBillPage from './SplitBillPage';
import ChatbotPage from './ChatbotPage';
import CaloriePlannerPage from './CaloriePlannerPage';
import { Toaster } from 'sonner';

export default function RMHEatsApp() {
    const view = useEatsStore((s) => s.view);
    const selectedRestaurantId = useEatsStore((s) => s.selectedRestaurantId);
    const cartItemCount = useEatsStore((s) => s.cartItemCount);
    const setView = useEatsStore((s) => s.setView);
    const goHome = useEatsStore((s) => s.goHome);
    const orders = useEatsStore((s) => s.orders);
    const openChatbot = useEatsStore((s) => s.openChatbot);
    const loyaltyPoints = useEatsStore((s) => s.loyaltyPoints);

    const [cartOpen, setCartOpen] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const toolsRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

    const itemCount = mounted ? cartItemCount() : 0;
    const activeOrders = mounted ? orders.filter((o) => o.status !== 'delivered').length : 0;
    const displayLoyalty = mounted ? loyaltyPoints : 0;

    // Close tools popover on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
                setToolsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const showNav = !['checkout', 'confirmation'].includes(view);

    const TOOLS = [
        { label: 'Price Compare', icon: <BarChart2 className="h-4 w-4" />, view: 'price-compare' as const },
        { label: 'Order by Mood', icon: <Smile className="h-4 w-4" />, view: 'mood' as const },
        { label: 'Calorie Planner', icon: <Flame className="h-4 w-4" />, view: 'calorie-planner' as const },
        { label: 'Chatbot Support', icon: <MessageCircle className="h-4 w-4" />, view: 'chatbot' as const },
    ];

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <Toaster
                position="top-center"
                theme="dark"
                toastOptions={{
                    style: {
                        background: '#1e293b',
                        border: '1px solid #334155',
                        color: '#f1f5f9',
                    },
                }}
            />

            {/* Top Nav */}
            {showNav && (
                <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
                    <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-2">
                        {/* Logo */}
                        <button onClick={goHome} className="flex items-center gap-2 group shrink-0">
                            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0 shadow-md shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-shadow">
                                <Utensils className="h-4 w-4 text-white" />
                            </div>
                            <span className="font-bold text-white hidden sm:block">
                                RMH<span className="text-orange-400">Eats</span>
                            </span>
                        </button>

                        {/* Nav actions */}
                        <div className="flex items-center gap-1">
                            {/* Home */}
                            <NavButton onClick={goHome} active={view === 'home'} label="Home">
                                <Home className="h-4 w-4" />
                            </NavButton>

                            {/* Orders */}
                            <NavButton
                                onClick={() => setView('history')}
                                active={['history', 'tracker', 'reviews', 'issue-report', 'split-bill'].includes(view)}
                                label="Orders"
                                badge={activeOrders > 0 ? activeOrders : undefined}
                            >
                                <History className="h-4 w-4" />
                            </NavButton>

                            {/* Favorites */}
                            <NavButton
                                onClick={() => setView('favorites')}
                                active={view === 'favorites'}
                                label="Favorites"
                            >
                                <Heart className="h-4 w-4" />
                            </NavButton>

                            {/* Profile */}
                            <NavButton
                                onClick={() => setView('profile')}
                                active={view === 'profile'}
                                label="Profile"
                                badge={displayLoyalty > 0 ? displayLoyalty : undefined}
                                badgeColor="bg-purple-500"
                            >
                                <User className="h-4 w-4" />
                            </NavButton>

                            {/* Tools popover */}
                            <div className="relative" ref={toolsRef}>
                                <NavButton
                                    onClick={() => setToolsOpen((o) => !o)}
                                    active={toolsOpen || ['price-compare', 'mood', 'calorie-planner', 'chatbot'].includes(view)}
                                    label="Tools"
                                >
                                    <Sparkles className="h-4 w-4" />
                                </NavButton>

                                <AnimatePresence>
                                    {toolsOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                            transition={{ duration: 0.12 }}
                                            className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-slate-800 border border-slate-700 shadow-xl shadow-black/40 overflow-hidden z-50"
                                        >
                                            {TOOLS.map((tool) => (
                                                <button
                                                    key={tool.view}
                                                    onClick={() => { setView(tool.view); setToolsOpen(false); }}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors hover:bg-slate-700 ${
                                                        view === tool.view ? 'text-orange-400 bg-slate-700/50' : 'text-slate-200'
                                                    }`}
                                                >
                                                    <span className="text-slate-400">{tool.icon}</span>
                                                    {tool.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Cart */}
                            <button
                                onClick={() => setCartOpen(true)}
                                className="relative flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 px-3 py-2 text-sm font-medium text-white transition-colors shadow-md shadow-orange-500/20 ml-1 shrink-0"
                            >
                                <ShoppingCart className="h-4 w-4" />
                                <span className="hidden sm:block">Cart</span>
                                {itemCount > 0 && (
                                    <motion.span
                                        key={itemCount}
                                        initial={{ scale: 1.4 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-xs font-bold text-white flex items-center justify-center shadow"
                                    >
                                        {itemCount > 9 ? '9+' : itemCount}
                                    </motion.span>
                                )}
                            </button>
                        </div>
                    </div>
                </header>
            )}

            {/* Main content */}
            <main className="mx-auto max-w-5xl px-4 py-6">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                    >
                        {view === 'home' && <RestaurantsList />}
                        {view === 'restaurant' && selectedRestaurantId && (
                            <RestaurantDetail restaurantId={selectedRestaurantId} />
                        )}
                        {view === 'checkout' && <Checkout />}
                        {view === 'confirmation' && <OrderConfirmation />}
                        {view === 'history' && <OrderHistory />}
                        {view === 'tracker' && <OrderTracker />}
                        {view === 'addresses' && <AddressManager />}
                        {view === 'payments' && <PaymentManager />}
                        {view === 'reviews' && <ReviewModal />}
                        {view === 'favorites' && <FavoritesPage />}
                        {view === 'profile' && <ProfilePage />}
                        {view === 'issue-report' && <IssueReportPage />}
                        {view === 'split-bill' && <SplitBillPage />}
                        {view === 'price-compare' && <PriceComparePage />}
                        {view === 'mood' && <MoodOrderPage />}
                        {view === 'chatbot' && <ChatbotPage />}
                        {view === 'calorie-planner' && <CaloriePlannerPage />}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Cart drawer */}
            <Cart isOpen={cartOpen} onClose={() => setCartOpen(false)} />

            {/* Floating chatbot button */}
            {view !== 'chatbot' && showNav && (
                <button
                    onClick={openChatbot}
                    className="fixed bottom-14 right-4 z-20 flex items-center justify-center h-12 w-12 rounded-full bg-linear-to-br from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 shadow-lg shadow-purple-500/30 transition-all hover:scale-110"
                    aria-label="Open chatbot support"
                >
                    <MessageCircle className="h-5 w-5 text-white" />
                </button>
            )}

            {/* Demo disclaimer */}
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                <div className="rounded-full bg-slate-900/90 border border-slate-700 backdrop-blur-sm px-4 py-1.5 text-xs text-slate-400 whitespace-nowrap shadow-lg">
                    🎭 Demo app — All restaurants, orders, and payments are simulated
                </div>
            </div>
        </div>
    );
}

function NavButton({
    children,
    onClick,
    active,
    label,
    badge,
    badgeColor = 'bg-orange-500',
}: {
    children: React.ReactNode;
    onClick: () => void;
    active: boolean;
    label: string;
    badge?: number;
    badgeColor?: string;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`relative flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                active
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
        >
            {children}
            <span className="hidden md:block text-xs">{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full ${badgeColor} text-xs font-bold text-white flex items-center justify-center px-0.5`}>
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </button>
    );
}
