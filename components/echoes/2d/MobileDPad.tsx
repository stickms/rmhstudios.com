'use client';

import { useEffect, useRef, useCallback } from 'react';

interface DPadProps {
    onChange: (dx: number, dy: number) => void;
}

export default function MobileDPad({ onChange }: DPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef<HTMLDivElement>(null);
    const activeTouch = useRef<number | null>(null);
    const centerRef = useRef({ x: 0, y: 0 });

    const handleStart = useCallback((e: TouchEvent) => {
        e.preventDefault();
        if (activeTouch.current !== null) return;
        const touch = e.changedTouches[0];
        activeTouch.current = touch.identifier;
        const rect = padRef.current!.getBoundingClientRect();
        centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, []);

    const handleMove = useCallback((e: TouchEvent) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouch.current);
        if (!touch) return;
        const { x: cx, y: cy } = centerRef.current;
        const dx = touch.clientX - cx;
        const dy = touch.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 40;
        const clampedDist = Math.min(dist, maxDist);
        const nx = dist > 0 ? (dx / dist) * clampedDist : 0;
        const ny = dist > 0 ? (dy / dist) * clampedDist : 0;

        if (stickRef.current) {
            stickRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
        }

        // Normalize to -1..1
        onChange(dx / maxDist, dy / maxDist);
    }, [onChange]);

    const handleEnd = useCallback((e: TouchEvent) => {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouch.current);
        if (!touch) return;
        activeTouch.current = null;
        if (stickRef.current) stickRef.current.style.transform = 'translate(0, 0)';
        onChange(0, 0);
    }, [onChange]);

    useEffect(() => {
        const el = padRef.current;
        if (!el) return;
        el.addEventListener('touchstart', handleStart, { passive: false });
        el.addEventListener('touchmove', handleMove, { passive: false });
        el.addEventListener('touchend', handleEnd, { passive: false });
        return () => {
            el.removeEventListener('touchstart', handleStart);
            el.removeEventListener('touchmove', handleMove);
            el.removeEventListener('touchend', handleEnd);
        };
    }, [handleStart, handleMove, handleEnd]);

    return (
        <div
            ref={padRef}
            className="absolute bottom-24 left-10 w-28 h-28 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center touch-none select-none"
            style={{ backdropFilter: 'blur(4px)' }}
        >
            {/* Crosshair guides */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full h-px bg-white/10" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-full w-px bg-white/10" />
            </div>
            {/* Stick */}
            <div
                ref={stickRef}
                className="w-12 h-12 rounded-full bg-white/30 border-2 border-white/50 transition-none"
                style={{ transition: 'none' }}
            />
        </div>
    );
}
