'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keybinds, DEFAULT_KEYBINDS, loadKeybinds, saveKeybinds, keyLabel } from '@/lib/echoes/game2d/KeybindStore';

const BIND_LABELS: { key: keyof Keybinds; label: string }[] = [
    { key: 'up', label: 'Move Up' },
    { key: 'down', label: 'Move Down' },
    { key: 'left', label: 'Move Left' },
    { key: 'right', label: 'Move Right' },
    { key: 'ability0', label: 'Ability 1 (Q)' },
    { key: 'ability1', label: 'Ability 2 (E)' },
    { key: 'ability2', label: 'Ability 3 (R)' },
];

interface KeybindSettingsProps {
    open: boolean;
    onClose: () => void;
}

export default function KeybindSettings({ open, onClose }: KeybindSettingsProps) {
    const [binds, setBinds] = useState<Keybinds>(loadKeybinds);
    const [listening, setListening] = useState<keyof Keybinds | null>(null);

    useEffect(() => { 
        if (open) {
            setBinds(loadKeybinds()); 
        }
    }, [open]);

    useEffect(() => {
        if (!listening) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            const newBinds = { ...binds, [listening]: e.code };
            setBinds(newBinds);
            saveKeybinds(newBinds);
            // Notify other tabs/components
            window.dispatchEvent(new StorageEvent('storage', { key: 'echoes_keybinds' }));
            setListening(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [listening, binds]);

    const reset = () => {
        setBinds({ ...DEFAULT_KEYBINDS });
        saveKeybinds({ ...DEFAULT_KEYBINDS });
        window.dispatchEvent(new StorageEvent('storage', { key: 'echoes_keybinds' }));
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={e => { if (e.target === e.currentTarget) { setListening(null); onClose(); } }}>
                    <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                        className="bg-[#0d0d1a] border border-white/10 rounded-2xl p-6 w-80">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-white font-black text-lg">Keybinds</h3>
                            <button onClick={onClose} className="text-white/40 hover:text-white text-xl transition-colors">✕</button>
                        </div>
                        <div className="space-y-2">
                            {BIND_LABELS.map(({ key, label }) => (
                                <div key={key} className="flex items-center justify-between">
                                    <span className="text-white/60 text-sm">{label}</span>
                                    <button
                                        onClick={() => setListening(listening === key ? null : key)}
                                        className={`w-20 py-1.5 rounded-lg text-sm font-mono font-bold transition-all border ${
                                            listening === key
                                                ? 'border-purple-500 bg-purple-500/20 text-purple-300 animate-pulse'
                                                : 'border-white/20 bg-white/5 text-white hover:border-white/40'
                                        }`}>
                                        {listening === key ? '...' : keyLabel(binds[key])}
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button onClick={reset} className="w-full mt-5 py-2 text-white/40 hover:text-white/70 text-xs font-mono transition-colors border border-white/10 rounded-lg hover:border-white/20">
                            Reset to Defaults
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
