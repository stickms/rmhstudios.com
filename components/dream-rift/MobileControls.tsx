'use client';

/**
 * On-screen touch controls for Dream Rift (mobile / tablet).
 *
 * A left analog thumb-stick drives movement, right-side buttons fire / bomb /
 * focus. Focus is also implied while the stick is held lightly — but the
 * explicit focus button lets players pixel-dodge. Pointer events feed the
 * shared InputManager directly so the simulation needs no special-casing.
 */

import { useEffect, useRef, useState } from 'react';
import type { InputManager } from '@/lib/dream-rift/input';

export function MobileControls({ input }: { input: InputManager }) {
    const stickRef = useRef<HTMLDivElement>(null);
    const [knob, setKnob] = useState({ x: 0, y: 0 });
    const activeId = useRef<number | null>(null);
    const origin = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const el = stickRef.current;
        if (!el) return;
        const radius = 56;

        const onDown = (e: PointerEvent) => {
            if (activeId.current !== null) return;
            activeId.current = e.pointerId;
            const rect = el.getBoundingClientRect();
            origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            el.setPointerCapture(e.pointerId);
            move(e);
        };
        const move = (e: PointerEvent) => {
            if (activeId.current !== e.pointerId) return;
            let dx = e.clientX - origin.current.x;
            let dy = e.clientY - origin.current.y;
            const dist = Math.hypot(dx, dy);
            if (dist > radius) {
                dx = (dx / dist) * radius;
                dy = (dy / dist) * radius;
            }
            setKnob({ x: dx, y: dy });
            input.setStick(dx / radius, dy / radius);
        };
        const up = (e: PointerEvent) => {
            if (activeId.current !== e.pointerId) return;
            activeId.current = null;
            setKnob({ x: 0, y: 0 });
            input.setStick(0, 0);
        };
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        return () => {
            el.removeEventListener('pointerdown', onDown);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
        };
    }, [input]);

    const btn = (label: string, key: 'shot' | 'bomb' | 'focus', cls: string) => (
        <button
            type="button"
            className={`select-none touch-none rounded-full font-bold text-white/90 backdrop-blur active:scale-95 transition-transform ${cls}`}
            onPointerDown={(e) => {
                e.preventDefault();
                input.setButton(key, true);
            }}
            onPointerUp={() => input.setButton(key, false)}
            onPointerLeave={() => input.setButton(key, false)}
            onPointerCancel={() => input.setButton(key, false)}
        >
            {label}
        </button>
    );

    return (
        <div className="pointer-events-none absolute inset-0 z-20 select-none md:hidden">
            {/* stick */}
            <div
                ref={stickRef}
                className="pointer-events-auto absolute left-6 h-32 w-32 touch-none rounded-full border border-white/20 bg-white/5"
                style={{ touchAction: 'none', bottom: 86 }}
            >
                <div
                    className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/25 shadow-lg"
                    style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
                />
            </div>
            {/* buttons */}
            <div className="pointer-events-auto absolute right-5 flex flex-col items-end gap-3" style={{ bottom: 86 }}>
                <div className="flex items-end gap-3">
                    {btn('FOCUS', 'focus', 'h-14 w-14 text-[10px] bg-fuchsia-500/30 border border-fuchsia-300/40')}
                    {btn('BOMB', 'bomb', 'h-16 w-16 text-xs bg-sky-500/30 border border-sky-300/40')}
                </div>
                {btn('SHOT', 'shot', 'h-20 w-20 text-sm bg-rose-500/40 border border-rose-300/50')}
            </div>
        </div>
    );
}
