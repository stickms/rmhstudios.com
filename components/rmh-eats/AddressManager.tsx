'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Plus, Trash2, Star } from 'lucide-react';
import { useEatsStore } from '@/lib/store/useEatsStore';
import { toast } from 'sonner';

export default function AddressManager() {
    const { addresses, addAddress, deleteAddress, setDefaultAddress, setView } = useEatsStore();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ label: '', street: '', city: '', state: '', zip: '' });

    const handleSave = () => {
        if (!form.street || !form.city || !form.state || !form.zip) {
            toast.error('Please fill in all required fields');
            return;
        }
        addAddress({ ...form, isDefault: addresses.length === 0 });
        toast.success('Address saved!');
        setShowForm(false);
        setForm({ label: '', street: '', city: '', state: '', zip: '' });
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
                <h2 className="text-xl font-bold text-white">Saved Addresses</h2>
            </div>

            <div className="space-y-3 mb-4">
                {addresses.length === 0 && !showForm && (
                    <div className="rounded-2xl border border-dashed border-slate-700 p-8 flex flex-col items-center gap-3 text-slate-500">
                        <MapPin className="h-8 w-8 opacity-30" />
                        <p>No saved addresses yet.</p>
                    </div>
                )}

                {addresses.map((addr, i) => (
                    <motion.div
                        key={addr.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-2xl border p-4 flex items-start gap-3 ${
                            addr.isDefault
                                ? 'border-orange-500/40 bg-orange-500/5'
                                : 'border-slate-700/50 bg-slate-800/50'
                        }`}
                    >
                        <MapPin className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-white">{addr.label || 'Address'}</p>
                                {addr.isDefault && (
                                    <span className="text-xs rounded-full bg-orange-500/20 border border-orange-500/30 px-2 py-0.5 text-orange-400">
                                        Default
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-400 mt-0.5">
                                {addr.street}, {addr.city}, {addr.state} {addr.zip}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {!addr.isDefault && (
                                <button
                                    onClick={() => {
                                        setDefaultAddress(addr.id);
                                        toast.success('Default address updated');
                                    }}
                                    title="Set as default"
                                    className="rounded-lg p-2 text-slate-500 hover:text-yellow-400 hover:bg-slate-700 transition-colors"
                                >
                                    <Star className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    deleteAddress(addr.id);
                                    toast.success('Address removed');
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
                    <h3 className="font-semibold text-white">New Address</h3>
                    <input
                        placeholder="Label (e.g. Home, Work, Mom's)"
                        value={form.label}
                        onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                        className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                    />
                    <input
                        placeholder="Street address *"
                        value={form.street}
                        onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))}
                        className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                    />
                    <div className="grid grid-cols-3 gap-2">
                        <input
                            placeholder="City *"
                            value={form.city}
                            onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                        />
                        <input
                            placeholder="State *"
                            value={form.state}
                            onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                        />
                        <input
                            placeholder="ZIP *"
                            value={form.zip}
                            onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))}
                            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-400 py-2.5 text-sm font-semibold text-white transition-colors"
                        >
                            Save Address
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            className="rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2.5 text-sm text-slate-300 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowForm(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-600 py-3.5 text-sm text-slate-400 hover:text-orange-400 hover:border-orange-500/50 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Add New Address
                </button>
            )}
        </div>
    );
}
