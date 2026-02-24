'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Minus, Plus, Copy, Check } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';

const PERSON_COLORS = [
    'bg-orange-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500',
    'bg-pink-500', 'bg-yellow-500', 'bg-cyan-500', 'bg-red-500',
    'bg-indigo-500', 'bg-teal-500',
];

export default function SplitBillPage() {
    const { orders, splitBillTargetOrderId, setView } = useEatsStore();
    const order = useMemo(
        () => orders.find((o) => o.id === splitBillTargetOrderId),
        [orders, splitBillTargetOrderId]
    );

    const [people, setPeople] = useState(2);
    const [mode, setMode] = useState<'equal' | 'byItem'>('equal');
    const [assignments, setAssignments] = useState<Record<string, number>>({});
    const [copied, setCopied] = useState(false);

    if (!order) {
        return (
            <div className="flex flex-col items-center gap-4 py-24">
                <span className="text-5xl">🧾</span>
                <p className="text-slate-400">Order not found.</p>
                <button onClick={() => setView('history')} className="text-orange-400 hover:text-orange-300 text-sm">
                    Back
                </button>
            </div>
        );
    }

    const perPerson = order.total / people;

    // Per-person totals in by-item mode
    const personTotals = Array.from({ length: people }, (_, i) => {
        const personItems = order.items.filter((_, idx) => (assignments[idx] ?? 0) === i);
        return personItems.reduce((s, item) => s + item.price * item.quantity, 0);
    });

    function assignItem(itemIdx: number, personIdx: number) {
        setAssignments((prev) => ({ ...prev, [itemIdx]: personIdx }));
    }

    async function handleCopy() {
        const lines: string[] = [`Split Bill — ${order!.restaurantName} (Order #${order!.id})`, ''];
        if (mode === 'equal') {
            lines.push(`Equal split between ${people} people:`);
            Array.from({ length: people }, (_, i) => {
                lines.push(`  Person ${i + 1}: $${perPerson.toFixed(2)}`);
            });
        } else {
            order!.items.forEach((item, idx) => {
                const personIdx = assignments[idx] ?? 0;
                lines.push(`  ${item.quantity}× ${item.name} → Person ${personIdx + 1} ($${(item.price * item.quantity).toFixed(2)})`);
            });
            lines.push('');
            lines.push('Totals per person:');
            personTotals.forEach((total, i) => {
                lines.push(`  Person ${i + 1}: $${total.toFixed(2)}`);
            });
        }
        lines.push('');
        lines.push(`Grand Total: $${order!.total.toFixed(2)}`);

        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback — do nothing silently
        }
    }

    return (
        <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => setView('history')}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white">Split the Bill</h2>
                    <p className="text-sm text-slate-400">{order.restaurantName} · ${order.total.toFixed(2)} total</p>
                </div>
            </div>

            {/* People selector */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4 mb-4">
                <p className="text-sm font-medium text-white mb-3">Number of people</p>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setPeople(Math.max(2, people - 1))}
                        className="rounded-xl bg-slate-700 hover:bg-slate-600 p-2 text-white transition-colors"
                    >
                        <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-2xl font-bold text-white w-8 text-center">{people}</span>
                    <button
                        onClick={() => setPeople(Math.min(10, people + 1))}
                        className="rounded-xl bg-slate-700 hover:bg-slate-600 p-2 text-white transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                    <div className="flex gap-1 ml-2">
                        {Array.from({ length: Math.min(people, 6) }, (_, i) => (
                            <div key={i} className={`h-6 w-6 rounded-full ${PERSON_COLORS[i]} flex items-center justify-center text-xs font-bold text-white`}>
                                {i + 1}
                            </div>
                        ))}
                        {people > 6 && (
                            <div className="h-6 w-6 rounded-full bg-slate-600 flex items-center justify-center text-xs text-slate-300">
                                +{people - 6}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-xl bg-slate-800 border border-slate-700 p-1 mb-4">
                {(['equal', 'byItem'] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                            mode === m ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {m === 'equal' ? 'Equal Split' : 'By Item'}
                    </button>
                ))}
            </div>

            {mode === 'equal' ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5 mb-4"
                >
                    <p className="text-sm text-slate-400 mb-4">Total ÷ {people} people</p>
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: people }, (_, i) => (
                            <div key={i} className={`rounded-xl p-4 bg-linear-to-br ${PERSON_COLORS[i]}/20 border border-slate-700`}>
                                <p className="text-xs text-slate-400 mb-1">Person {i + 1}</p>
                                <p className="text-2xl font-bold text-white">${perPerson.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-between text-sm">
                        <span className="text-slate-400">Grand Total</span>
                        <span className="font-semibold text-white">${order.total.toFixed(2)}</span>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3 mb-4"
                >
                    {/* Items */}
                    <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                        <p className="text-sm font-medium text-white mb-3">Assign items to people</p>
                        <div className="space-y-3">
                            {order.items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{item.quantity}× {item.name}</p>
                                        <p className="text-xs text-orange-400">${(item.price * item.quantity).toFixed(2)}</p>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        {Array.from({ length: Math.min(people, 5) }, (_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => assignItem(idx, i)}
                                                className={`h-7 w-7 rounded-full text-xs font-bold text-white transition-all ${PERSON_COLORS[i]} ${
                                                    (assignments[idx] ?? 0) === i
                                                        ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110'
                                                        : 'opacity-50 hover:opacity-80'
                                                }`}
                                            >
                                                {i + 1}
                                            </button>
                                        ))}
                                        {people > 5 && (
                                            <select
                                                value={assignments[idx] ?? 0}
                                                onChange={(e) => assignItem(idx, Number(e.target.value))}
                                                className="rounded-lg bg-slate-700 border-none text-xs text-white px-1 py-1"
                                            >
                                                {Array.from({ length: people }, (_, i) => (
                                                    <option key={i} value={i}>{i + 1}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Per-person totals */}
                    <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                        <p className="text-sm font-medium text-white mb-3">Per-person totals</p>
                        <div className="grid grid-cols-2 gap-2">
                            {personTotals.map((total, i) => (
                                <div key={i} className={`rounded-xl p-3 bg-linear-to-br ${PERSON_COLORS[i]}/15 border border-slate-700`}>
                                    <p className="text-xs text-slate-400">Person {i + 1}</p>
                                    <p className="text-xl font-bold text-white mt-0.5">${total.toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 py-3.5 font-semibold text-white transition-colors"
            >
                {copied ? (
                    <>
                        <Check className="h-4 w-4 text-green-400" />
                        <span className="text-green-400">Copied!</span>
                    </>
                ) : (
                    <>
                        <Copy className="h-4 w-4" />
                        Copy Summary
                    </>
                )}
            </button>
        </div>
    );
}
