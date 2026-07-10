'use client';

/**
 * Animated danmaku backdrop for the Dream Rift menus.
 *
 * A cheap canvas that drifts a soft bullet curtain + twinkling starfield behind
 * the menu UI. Frame-time driven so it runs at normal speed on any refresh
 * rate, scales its particle count down on small screens (mobile-friendly), and
 * falls back to a single static frame when the user prefers reduced motion.
 */

import { useEffect, useRef } from 'react';

// Shrine-crimson + brass danmaku, the Touhou menu curtain.
const PALETTE = ['#d4405a', '#e7cd8c', '#f0c668', '#c5364e', '#b8607a'];

interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    color: string;
    spin: number;
}
interface Star {
    x: number;
    y: number;
    r: number;
    tw: number;
    phase: number;
}

export function MenuBackdrop({ className }: { className?: string }) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

        let w = 0;
        let h = 0;
        let dpr = 1;
        let bullets: Bullet[] = [];
        let stars: Star[] = [];

        const seed = () => {
            const small = w < 560;
            const nB = reduced ? 0 : small ? 22 : 40;
            const nS = small ? 50 : 90;
            bullets = Array.from({ length: nB }, () => spawnBullet(w, h));
            stars = Array.from({ length: nS }, () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                r: 0.6 + Math.random() * 1.4,
                tw: 0.4 + Math.random() * 1.2,
                phase: Math.random() * Math.PI * 2,
            }));
        };

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = Math.max(1, rect.width);
            h = Math.max(1, rect.height);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            seed();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        let raf = 0;
        let last = performance.now();
        let time = 0;

        const frame = (now: number) => {
            raf = requestAnimationFrame(frame);
            let dt = now - last;
            last = now;
            if (dt > 80) dt = 80; // clamp after tab stalls
            const fs = dt / (1000 / 60);
            time += dt;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            // twinkling stars
            ctx.save();
            for (const s of stars) {
                const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 0.001 * s.tw + s.phase));
                ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // soft drifting bullets (additive glow)
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (const b of bullets) {
                b.x += b.vx * fs;
                b.y += b.vy * fs;
                b.spin += 0.02 * fs;
                // wrap around edges with margin
                const m = 30;
                if (b.x < -m) b.x = w + m;
                else if (b.x > w + m) b.x = -m;
                if (b.y < -m) b.y = h + m;
                else if (b.y > h + m) b.y = -m;

                const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3.2);
                g.addColorStop(0, b.color);
                g.addColorStop(0.4, hexA(b.color, 0.5));
                g.addColorStop(1, hexA(b.color, 0));
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r * 3.2, 0, Math.PI * 2);
                ctx.fill();
                // bright core
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            if (reduced) cancelAnimationFrame(raf); // draw one static frame only
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, []);

    return <canvas ref={ref} aria-hidden className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

function spawnBullet(w: number, h: number): Bullet {
    const ang = Math.random() * Math.PI * 2;
    const sp = 0.15 + Math.random() * 0.5;
    return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp + 0.18, // gentle downward bias
        r: 2 + Math.random() * 3.5,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        spin: Math.random() * Math.PI,
    };
}

function hexA(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
}
