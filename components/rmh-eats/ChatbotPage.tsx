'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Bot } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { faqDatabase } from '@/lib/rmh-eats/mockData';
import type { ChatMessage } from '@/lib/rmh-eats/types';

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function getBotResponse(input: string): string {
    const lower = input.toLowerCase();
    for (const faq of faqDatabase) {
        if (faq.keywords.some((kw) => lower.includes(kw))) {
            return faq.answer;
        }
    }
    return "I'm not sure about that — please contact our support team at support@rmheats.demo and we'll get back to you within 24 hours.";
}

const GREETING: ChatMessage = {
    id: 'greeting',
    role: 'bot',
    text: "Hi! I'm the RMH Eats support bot 🍔. I can help with orders, refunds, promo codes, loyalty points, and more. What do you need?",
    timestamp: new Date().toISOString(),
};

export default function ChatbotPage() {
    const { previousView, setView } = useEatsStore();
    const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    function handleBack() {
        setView(previousView ?? 'home');
    }

    function sendMessage() {
        if (!input.trim()) return;
        const userMsg: ChatMessage = {
            id: uid(),
            role: 'user',
            text: input.trim(),
            timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);
        const query = input.trim();
        setInput('');
        setIsTyping(true);

        setTimeout(() => {
            const botMsg: ChatMessage = {
                id: uid(),
                role: 'bot',
                text: getBotResponse(query),
                timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, botMsg]);
            setIsTyping(false);
        }, 800 + Math.random() * 400);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    const QUICK_QUESTIONS = [
        'How do I get a refund?',
        'Any promo codes?',
        'How do loyalty points work?',
    ];

    return (
        <div className="max-w-lg mx-auto flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <button
                    onClick={handleBack}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-orange-400" />
                    </div>
                    <div>
                        <h2 className="font-bold text-white text-sm">RMH Eats Support</h2>
                        <p className="text-xs text-green-400">Online · Instant replies</p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3">
                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        {msg.role === 'bot' && (
                            <div className="h-7 w-7 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center mr-2 mt-1 shrink-0">
                                <Bot className="h-4 w-4 text-orange-400" />
                            </div>
                        )}
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-orange-500 text-white rounded-br-sm'
                                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
                            }`}
                        >
                            {msg.text}
                        </div>
                    </motion.div>
                ))}

                {/* Typing indicator */}
                <AnimatePresence>
                    {isTyping && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex justify-start"
                        >
                            <div className="h-7 w-7 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center mr-2 mt-1">
                                <Bot className="h-4 w-4 text-orange-400" />
                            </div>
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                                {[0, 1, 2].map((i) => (
                                    <motion.div
                                        key={i}
                                        className="h-1.5 w-1.5 rounded-full bg-slate-400"
                                        animate={{ y: [0, -4, 0] }}
                                        transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div ref={bottomRef} />
            </div>

            {/* Quick questions (shown only at start) */}
            {messages.length <= 1 && (
                <div className="flex gap-2 flex-wrap mb-3 shrink-0">
                    {QUICK_QUESTIONS.map((q) => (
                        <button
                            key={q}
                            onClick={() => { setInput(q); setTimeout(() => sendMessage(), 0); }}
                            className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-orange-500 hover:text-orange-400 transition-colors"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="flex gap-2 shrink-0">
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 rounded-2xl bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500 transition-colors"
                />
                <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isTyping}
                    className="rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-white transition-colors"
                >
                    <Send className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
