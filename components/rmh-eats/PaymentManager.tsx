'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard, Plus, Trash2, Star } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { toast } from 'sonner';

export default function PaymentManager() {
    const { t } = useTranslation("c-rmh-eats");
    const { paymentMethods, addPaymentMethod, deletePaymentMethod, setDefaultPaymentMethod, setView } =
        useEatsStore();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ number: '', expiry: '', cvc: '', name: '' });

    const handleSave = () => {
        if (!form.number || !form.expiry || !form.cvc || !form.name) {
            toast.error(t("fill-all-card-fields", { defaultValue: "Please fill in all card fields" }));
            return;
        }
        const last4 = form.number.replace(/\s/g, '').slice(-4);
        const [month, year] = form.expiry.split('/');
        addPaymentMethod({
            type: 'card',
            label: `Card ending in ${last4}`,
            last4,
            brand: 'Visa',
            expiryMonth: parseInt(month) || undefined,
            expiryYear: year ? parseInt(`20${year}`) : undefined,
            isDefault: paymentMethods.length === 0,
        });
        toast.success(t("payment-method-saved", { defaultValue: "Payment method saved!" }));
        setShowForm(false);
        setForm({ number: '', expiry: '', cvc: '', name: '' });
    };

    return (
        <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => setView('home')}
                    className="rounded-xl bg-slate-800 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <h2 className="text-xl font-bold text-white">{t("payment-methods", { defaultValue: "Payment Methods" })}</h2>
            </div>

            <div className="space-y-3 mb-4">
                {paymentMethods.length === 0 && !showForm && (
                    <div className="rounded-2xl border border-dashed border-slate-700 p-8 flex flex-col items-center gap-3 text-slate-500">
                        <CreditCard className="h-8 w-8 opacity-30" />
                        <p>{t("no-saved-payment-methods", { defaultValue: "No saved payment methods." })}</p>
                    </div>
                )}

                {paymentMethods.map((pm, i) => (
                    <motion.div
                        key={pm.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-2xl border p-4 flex items-center gap-3 ${
                            pm.isDefault
                                ? 'border-orange-500/40 bg-orange-500/5'
                                : 'border-slate-700/50 bg-slate-800/50'
                        }`}
                    >
                        {/* Card art */}
                        <div className="h-10 w-16 rounded-lg bg-linear-to-br from-slate-600 to-slate-700 flex items-center justify-center shrink-0">
                            <CreditCard className="h-5 w-5 text-slate-300" />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-white text-sm">{pm.label}</p>
                                {pm.isDefault && (
                                    <span className="text-xs rounded-full bg-orange-500/20 border border-orange-500/30 px-2 py-0.5 text-orange-400">
                                        {t("default", { defaultValue: "Default" })}
                                    </span>
                                )}
                            </div>
                            {pm.type === 'card' && pm.expiryMonth && pm.expiryYear && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {t("expires", { defaultValue: "Expires" })} {pm.expiryMonth}/{pm.expiryYear}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            {!pm.isDefault && (
                                <button
                                    onClick={() => {
                                        setDefaultPaymentMethod(pm.id);
                                        toast.success(t("default-payment-updated", { defaultValue: "Default payment method updated" }));
                                    }}
                                    title={t("set-as-default", { defaultValue: "Set as default" })}
                                    className="rounded-lg p-2 text-slate-500 hover:text-yellow-400 hover:bg-slate-700 transition-colors"
                                >
                                    <Star className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    deletePaymentMethod(pm.id);
                                    toast.success(t("payment-method-removed", { defaultValue: "Payment method removed" }));
                                }}
                                className="rounded-lg p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>

            {showForm ? (
                <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4 space-y-3">
                    <h3 className="font-semibold text-white">{t("add-new-card", { defaultValue: "Add New Card" })}</h3>
                    <input
                        placeholder={t("cardholder-name", { defaultValue: "Cardholder name *" })}
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                    />
                    <input
                        placeholder={t("card-number", { defaultValue: "Card number *" })}
                        value={form.number}
                        onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))}
                        maxLength={19}
                        className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            placeholder={t("expiry-placeholder", { defaultValue: "MM/YY *" })}
                            value={form.expiry}
                            onChange={(e) => setForm((p) => ({ ...p, expiry: e.target.value }))}
                            maxLength={5}
                            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                        />
                        <input
                            placeholder={t("cvc-placeholder", { defaultValue: "CVC *" })}
                            value={form.cvc}
                            onChange={(e) => setForm((p) => ({ ...p, cvc: e.target.value }))}
                            maxLength={4}
                            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                        />
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                        🔒 {t("mock-app-disclaimer", { defaultValue: "This is a mock app — no real payment data is processed or stored securely." })}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-400 py-2.5 text-sm font-semibold text-white transition-colors"
                        >
                            {t("save-card", { defaultValue: "Save Card" })}
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            className="rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2.5 text-sm text-slate-300 transition-colors"
                        >
                            {t("cancel", { defaultValue: "Cancel" })}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowForm(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-600 py-3.5 text-sm text-slate-400 hover:text-orange-400 hover:border-orange-500/50 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    {t("add-new-card", { defaultValue: "Add New Card" })}
                </button>
            )}
        </div>
    );
}
