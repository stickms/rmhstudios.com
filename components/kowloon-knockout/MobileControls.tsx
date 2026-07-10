'use client';

import { useRef, useState, useCallback } from 'react';
import type { LocalInputSource } from '@/lib/kowloon-knockout/game/input';
import type { PunchType } from '@/lib/kowloon-knockout/game/fighters/types';

const JOY_R = 56;

const PUNCHES: { type: PunchType; label: string; color: string }[] = [
    { type: 'jab', label: 'J', color: '#33ccff' },
    { type: 'cross', label: 'K', color: '#33ff99' },
    { type: 'hook', label: 'L', color: '#ffcc00' },
    { type: 'uppercut', label: 'U', color: '#ff6633' },
];

/** Touch-screen controls: a left thumbstick for planar movement and a right
 *  cluster of punch buttons plus a block pad. Writes into the shared input source. */
export default function MobileControls({ input }: { input: LocalInputSource }) {
    const joyBase = useRef<HTMLDivElement>(null);
    const joyId = useRef<number | null>(null);
    const [knob, setKnob] = useState({ x: 0, y: 0 });

    const updateJoy = useCallback((clientX: number, clientY: number) => {
        const el = joyBase.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const mag = Math.hypot(dx, dy);
        if (mag > JOY_R) { dx = (dx / mag) * JOY_R; dy = (dy / mag) * JOY_R; }
        setKnob({ x: dx, y: dy });
        input.setVirtualMove(dx / JOY_R, dy / JOY_R);
    }, [input]);

    const endJoy = useCallback(() => {
        joyId.current = null;
        setKnob({ x: 0, y: 0 });
        input.setVirtualMove(0, 0);
    }, [input]);

    const btn = (extra: React.CSSProperties): React.CSSProperties => ({
        display: 'grid', placeItems: 'center', borderRadius: '50%',
        userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
        fontFamily: '"Press Start 2P", monospace', pointerEvents: 'auto',
        ...extra,
    });

    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', touchAction: 'none' }}>
            {/* Movement thumbstick */}
            <div
                ref={joyBase}
                onPointerDown={(e) => { joyId.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); updateJoy(e.clientX, e.clientY); }}
                onPointerMove={(e) => { if (joyId.current === e.pointerId) updateJoy(e.clientX, e.clientY); }}
                onPointerUp={endJoy}
                onPointerCancel={endJoy}
                style={{
                    position: 'absolute', left: 24, bottom: 24, width: JOY_R * 2, height: JOY_R * 2,
                    borderRadius: '50%', border: '2px solid #33ccff60', background: 'radial-gradient(circle, #33ccff18, #0000)',
                    pointerEvents: 'auto', touchAction: 'none',
                }}
            >
                <div style={{
                    position: 'absolute', left: '50%', top: '50%',
                    transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
                    width: 44, height: 44, borderRadius: '50%',
                    background: '#33ccffaa', boxShadow: '0 0 12px #33ccff',
                }} />
            </div>

            {/* Block pad */}
            <div
                onPointerDown={(e) => { e.preventDefault(); input.setVirtualBlock(true); }}
                onPointerUp={() => input.setVirtualBlock(false)}
                onPointerLeave={() => input.setVirtualBlock(false)}
                onPointerCancel={() => input.setVirtualBlock(false)}
                style={btn({
                    position: 'absolute', right: 168, bottom: 30, width: 58, height: 58,
                    border: '2px solid #cc33ff', background: '#cc33ff22', color: '#cc33ff', fontSize: 9,
                })}
            >
                BLK
            </div>

            {/* Punch buttons in a diamond */}
            {PUNCHES.map((p, i) => {
                const layout = [
                    { right: 84, bottom: 96 }, // jab (top)
                    { right: 24, bottom: 60 }, // cross (right)
                    { right: 144, bottom: 60 }, // hook (left)
                    { right: 84, bottom: 24 }, // uppercut (bottom)
                ][i];
                return (
                    <div
                        key={p.type}
                        onPointerDown={(e) => { e.preventDefault(); input.pressVirtualPunch(p.type); }}
                        style={btn({
                            position: 'absolute', ...layout, width: 56, height: 56,
                            border: `2px solid ${p.color}`, background: `${p.color}22`, color: p.color, fontSize: 14,
                        })}
                    >
                        {p.label}
                    </div>
                );
            })}
        </div>
    );
}
