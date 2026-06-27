'use client';

/**
 * Settings: audio, gameplay options (show hitbox), and a full control-rebinding
 * panel. Bindings persist to localStorage via the store and are applied live to
 * the shared InputManager.
 */

import { useEffect, useState } from 'react';
import { useDreamRift } from '@/lib/dream-rift/store';
import { BIND_ACTIONS, BIND_LABELS, DEFAULT_BINDINGS, keyLabel, normalizeKey, rebind, type BindAction } from '@/lib/dream-rift/keybinds';
import { useRuntime } from './runtime';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
    const { music, sfx, input } = useRuntime();
    const {
        musicOn, sfxOn, musicVol, sfxVol, showHitbox, bindings,
        setMusicOn, setSfxOn, setMusicVol, setSfxVol, setShowHitbox, setBindings,
    } = useDreamRift();
    const [capturing, setCapturing] = useState<BindAction | null>(null);

    // capture the next keypress when rebinding
    useEffect(() => {
        if (!capturing) return;
        input.captureSuspended = true;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            if (e.key !== 'Escape') {
                setBindings(rebind(bindings, capturing, normalizeKey(e)));
                sfx.play('menuSelect');
            }
            setCapturing(null);
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => {
            window.removeEventListener('keydown', onKey, { capture: true });
            input.captureSuspended = false;
        };
    }, [capturing, bindings, input, sfx, setBindings]);

    return (
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0118] to-[#120a22] p-6">
            <h2 className="mb-5 text-2xl font-black text-white">Settings</h2>

            <div className="mx-auto w-full max-w-md space-y-6">
                {/* Audio */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/60">Audio</h3>
                    <Toggle label="Music" checked={musicOn} onChange={(v) => { setMusicOn(v); if (v) void music.resume(); }} />
                    <input type="range" min={0} max={1} step={0.05} value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} className="mb-3 w-full" />
                    <Toggle label="Sound Effects" checked={sfxOn} onChange={setSfxOn} />
                    <input type="range" min={0} max={1} step={0.05} value={sfxVol} onChange={(e) => setSfxVol(Number(e.target.value))} className="w-full" />
                </section>

                {/* Gameplay */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/60">Gameplay</h3>
                    <Toggle label="Always show hitbox" checked={showHitbox} onChange={setShowHitbox} />
                    <p className="mt-1 text-xs text-white/40">Draws a thin box around your true hitbox at all times (not just while focusing).</p>
                </section>

                {/* Controls */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-white/60">Controls</h3>
                        <button
                            type="button"
                            onClick={() => { setBindings({ ...DEFAULT_BINDINGS }); sfx.play('menuMove'); }}
                            className="text-xs text-white/50 underline hover:text-white/80"
                        >
                            Reset to defaults
                        </button>
                    </div>
                    <div className="space-y-1.5">
                        {BIND_ACTIONS.map((action) => (
                            <div key={action} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1">
                                <span className="text-sm text-white/80">{BIND_LABELS[action]}</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-white/50">
                                        {bindings[action].map(keyLabel).join(' / ') || '—'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setCapturing(action); sfx.play('menuMove'); }}
                                        className="min-w-[88px] rounded-md border px-3 py-1.5 text-xs font-bold transition"
                                        style={{
                                            borderColor: capturing === action ? '#ff5ccd' : 'rgba(255,255,255,0.15)',
                                            background: capturing === action ? 'rgba(255,92,205,0.15)' : 'transparent',
                                            color: capturing === action ? '#ff5ccd' : 'rgba(255,255,255,0.8)',
                                        }}
                                    >
                                        {capturing === action ? 'Press a key…' : 'Rebind'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-white/40">
                        Tip: hold <b>Focus</b> to slow down and reveal your hitbox for precise dodging. On mobile, use the on-screen joystick and buttons.
                    </p>
                </section>
            </div>

            <button type="button" onClick={onBack} className="mx-auto mt-6 w-full max-w-md rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 py-3 font-bold text-white">
                Back
            </button>
        </div>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-white/80">
            {label}
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className="relative h-6 w-11 rounded-full transition"
                style={{ background: checked ? '#a855f7' : 'rgba(255,255,255,0.15)' }}
            >
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: checked ? '22px' : '2px' }} />
            </button>
        </label>
    );
}
