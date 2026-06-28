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
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0612] to-[#120a20] p-6">
            <h2 className="dr-serif mb-5 text-2xl font-semibold tracking-[0.1em] text-[color:var(--dr-gold)]">Settings</h2>

            <div className="mx-auto w-full max-w-md space-y-6">
                {/* Audio */}
                <section className="dr-frame rounded-sm p-4">
                    <h3 className="dr-serif mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--dr-gold-soft)]">Audio</h3>
                    <Toggle label="Music" checked={musicOn} onChange={(v) => { setMusicOn(v); if (v) void music.resume(); }} />
                    <VolumeSlider value={musicVol} onChange={setMusicVol} disabled={!musicOn} />
                    <div className="h-3" />
                    <Toggle label="Sound Effects" checked={sfxOn} onChange={setSfxOn} />
                    <VolumeSlider value={sfxVol} onChange={(v) => { setSfxVol(v); }} onCommit={() => sfx.play('menuMove')} disabled={!sfxOn} />
                </section>

                {/* Gameplay */}
                <section className="dr-frame rounded-sm p-4">
                    <h3 className="dr-serif mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--dr-gold-soft)]">Gameplay</h3>
                    <Toggle label="Always show hitbox" checked={showHitbox} onChange={setShowHitbox} />
                    <p className="mt-1 text-xs text-[color:var(--dr-cream-faint)]">Draws a thin box around your true hitbox at all times (not just while focusing).</p>
                </section>

                {/* Controls */}
                <section className="dr-frame rounded-sm p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="dr-serif text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--dr-gold-soft)]">Controls</h3>
                        <button
                            type="button"
                            onClick={() => { setBindings({ ...DEFAULT_BINDINGS }); sfx.play('menuMove'); }}
                            className="text-xs text-[color:var(--dr-cream-dim)] underline hover:text-[color:var(--dr-cream)]"
                        >
                            Reset to defaults
                        </button>
                    </div>
                    <div className="space-y-1.5">
                        {BIND_ACTIONS.map((action) => (
                            <div key={action} className="flex items-center justify-between gap-3 rounded-sm px-1 py-1">
                                <span className="text-sm text-[color:var(--dr-cream)]">{BIND_LABELS[action]}</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-[color:var(--dr-cream-dim)]">
                                        {bindings[action].map(keyLabel).join(' / ') || '—'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setCapturing(action); sfx.play('menuMove'); }}
                                        className="min-w-[88px] rounded-sm border px-3 py-1.5 text-xs font-bold transition"
                                        style={{
                                            borderColor: capturing === action ? 'var(--dr-crimson)' : 'rgba(231,205,140,0.2)',
                                            background: capturing === action ? 'rgba(212,64,90,0.15)' : 'transparent',
                                            color: capturing === action ? 'var(--dr-crimson)' : 'var(--dr-cream)',
                                        }}
                                    >
                                        {capturing === action ? 'Press a key…' : 'Rebind'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-[color:var(--dr-cream-faint)]">
                        Tip: hold <b className="text-[color:var(--dr-cream)]">Focus</b> to slow down and reveal your hitbox for precise dodging. On mobile, use the on-screen joystick and buttons.
                    </p>
                </section>
            </div>

            <button type="button" onClick={onBack} className="dr-plaque dr-plaque-primary mx-auto mt-6 w-full max-w-md rounded-sm py-3 text-sm font-semibold">
                Back
            </button>
        </div>
    );
}

/** Fine-grained volume slider (1% steps) with a live percentage readout. */
function VolumeSlider({ value, onChange, onCommit, disabled }: { value: number; onChange: (v: number) => void; onCommit?: () => void; disabled?: boolean }) {
    return (
        <div className={`flex items-center gap-3 ${disabled ? 'opacity-40' : ''}`}>
            <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(Number(e.target.value))}
                onPointerUp={() => onCommit?.()}
                onKeyUp={() => onCommit?.()}
                className="h-2 flex-1 accent-[color:var(--dr-crimson)]"
            />
            <span className="w-10 text-right font-mono text-xs tabular-nums text-[color:var(--dr-cream-dim)]">{Math.round(value * 100)}%</span>
        </div>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-[color:var(--dr-cream)]">
            {label}
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className="relative h-6 w-11 rounded-full transition"
                style={{ background: checked ? 'var(--dr-crimson)' : 'rgba(231,205,140,0.18)' }}
            >
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: checked ? '22px' : '2px' }} />
            </button>
        </label>
    );
}
