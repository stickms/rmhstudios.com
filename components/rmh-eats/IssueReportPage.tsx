'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Search } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { toast } from 'sonner';
import type { IssueType } from '@/lib/rmh-eats/types';

const ISSUE_OPTIONS: { type: IssueType; label: string; emoji: string; desc: string }[] = [
    { type: 'missing_item', label: 'Missing Item', emoji: '📦', desc: 'One or more items were not included' },
    { type: 'wrong_item', label: 'Wrong Item', emoji: '🔄', desc: 'I received a different item than ordered' },
    { type: 'quality', label: 'Quality Issue', emoji: '😔', desc: 'Food quality was not acceptable' },
    { type: 'late_delivery', label: 'Late Delivery', emoji: '⏰', desc: 'Delivery took much longer than estimated' },
    { type: 'other', label: 'Other Issue', emoji: '❓', desc: 'Something else went wrong' },
];

export default function IssueReportPage() {
    const { orders, issueTargetOrderId, reportIssue, resolveIssue, orderIssues, setView } = useEatsStore();

    const order = useMemo(
        () => orders.find((o) => o.id === issueTargetOrderId),
        [orders, issueTargetOrderId]
    );

    const [selectedType, setSelectedType] = useState<IssueType | null>(null);
    const [description, setDescription] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [issueId, setIssueId] = useState<string | null>(null);
    const [refundStep, setRefundStep] = useState<'pending' | 'reviewing' | 'resolved'>('pending');

    const currentIssue = orderIssues.find((i) => i.id === issueId);

    useEffect(() => {
        if (!issueId) return;
        const t1 = setTimeout(() => setRefundStep('reviewing'), 3000);
        const t2 = setTimeout(() => {
            setRefundStep('resolved');
            resolveIssue(issueId);
            const refundAmt = order ? (order.subtotal * (0.2 + Math.random() * 0.3)).toFixed(2) : '5.00';
            toast.success(`Refund of $${refundAmt} approved!`, { duration: 6000, icon: '💰' });
        }, 8000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [issueId]);

    if (!order) {
        return (
            <div className="flex flex-col items-center gap-4 py-24">
                <span className="text-5xl">❓</span>
                <p className="text-slate-400">Order not found.</p>
                <button onClick={() => setView('history')} className="text-orange-400 hover:text-orange-300 text-sm">
                    Back to history
                </button>
            </div>
        );
    }

    function handleSubmit() {
        if (!selectedType) {
            toast.error('Please select an issue type');
            return;
        }
        const refundAmount = order!.subtotal * (0.2 + Math.random() * 0.3);
        const newIssueId = Math.random().toString(36).slice(2, 10);
        reportIssue({
            orderId: order!.id,
            issueType: selectedType,
            description,
            refundAmount,
        });
        setIssueId(newIssueId);
        setSubmitted(true);
        toast.success('Issue reported! We\'re looking into it.', { icon: '📋' });
    }

    const steps = [
        { key: 'pending', label: 'Report Received', icon: <CheckCircle2 className="h-4 w-4" /> },
        { key: 'reviewing', label: 'Under Review', icon: <Search className="h-4 w-4" /> },
        { key: 'resolved', label: 'Resolved', icon: <CheckCircle2 className="h-4 w-4" /> },
    ];
    const stepOrder = ['pending', 'reviewing', 'resolved'];
    const currentStepIdx = stepOrder.indexOf(refundStep);

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
                    <h2 className="text-xl font-bold text-white">Report an Issue</h2>
                    <p className="text-sm text-slate-400">{order.restaurantName} · #{order.id}</p>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {!submitted ? (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        {/* Order summary */}
                        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Order Summary</h3>
                            <div className="space-y-1">
                                {order.items.map((item, i) => (
                                    <p key={i} className="text-sm text-slate-300">
                                        {item.quantity}× {item.name}
                                    </p>
                                ))}
                            </div>
                            <p className="text-sm font-semibold text-orange-400 mt-2">
                                Total: ${order.total.toFixed(2)}
                            </p>
                        </div>

                        {/* Issue type */}
                        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                            <h3 className="text-sm font-semibold text-white mb-3">What went wrong?</h3>
                            <div className="space-y-2">
                                {ISSUE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.type}
                                        onClick={() => setSelectedType(opt.type)}
                                        className={`w-full flex items-center gap-3 rounded-xl p-3 border text-left transition-all ${
                                            selectedType === opt.type
                                                ? 'border-orange-500 bg-orange-500/10'
                                                : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                                        }`}
                                    >
                                        <span className="text-xl">{opt.emoji}</span>
                                        <div>
                                            <p className="text-sm font-medium text-white">{opt.label}</p>
                                            <p className="text-xs text-slate-400">{opt.desc}</p>
                                        </div>
                                        {selectedType === opt.type && (
                                            <CheckCircle2 className="h-4 w-4 text-orange-400 ml-auto flex-shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
                            <h3 className="text-sm font-semibold text-white mb-2">Tell us more (optional)</h3>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe what happened..."
                                rows={3}
                                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-500 resize-none"
                            />
                        </div>

                        <button
                            onClick={handleSubmit}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 hover:bg-orange-400 py-3.5 font-semibold text-white transition-colors shadow-lg shadow-orange-500/20"
                        >
                            <AlertTriangle className="h-4 w-4" />
                            Submit Report
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="tracker"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
                        <div className="rounded-2xl bg-green-500/10 border border-green-500/30 p-4 flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-green-400">Report Submitted</p>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    We're reviewing your issue and will process your refund shortly.
                                </p>
                            </div>
                        </div>

                        {/* Refund status tracker */}
                        <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-5">
                            <h3 className="font-semibold text-white mb-4">Refund Status</h3>
                            <div className="space-y-4">
                                {steps.map((step, i) => {
                                    const isPast = i < currentStepIdx;
                                    const isCurrent = i === currentStepIdx;
                                    return (
                                        <div key={step.key} className="flex items-center gap-3">
                                            <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${
                                                isPast || isCurrent
                                                    ? 'border-orange-500 bg-orange-500 text-white'
                                                    : 'border-slate-600 bg-slate-800 text-slate-600'
                                            }`}>
                                                {isCurrent && refundStep !== 'resolved' ? (
                                                    <motion.div
                                                        animate={{ rotate: 360 }}
                                                        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                                                    >
                                                        <Clock className="h-4 w-4" />
                                                    </motion.div>
                                                ) : (
                                                    step.icon
                                                )}
                                            </div>
                                            <p className={`text-sm font-medium ${isCurrent ? 'text-orange-400' : isPast ? 'text-white' : 'text-slate-600'}`}>
                                                {step.label}
                                            </p>
                                            {isCurrent && refundStep !== 'resolved' && (
                                                <span className="text-xs text-slate-500 ml-auto">Processing...</span>
                                            )}
                                            {refundStep === 'resolved' && step.key === 'resolved' && (
                                                <span className="text-xs text-green-400 ml-auto font-medium">Approved!</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <button
                            onClick={() => setView('history')}
                            className="w-full rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 py-3.5 font-semibold text-white transition-colors"
                        >
                            Back to Order History
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
