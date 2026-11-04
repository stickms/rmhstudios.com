'use client';

/**
 * Backdrop for the Dream Rift menus.
 *
 * Layered, static markup moved only by CSS `transform`/`opacity` (see menus.css):
 *
 *   sky      violet → magenta gradient (the scheme's bg → bgAlt)
 *   stars    two tiled pixel-star layers drifting at different, very slow speeds
 *   rings    concentric rings of pixel bullets around a spell-card sigil, one
 *            slow turn every few minutes (a fixed SVG rotated by transform)
 *   hills    stair-stepped silhouette along the bottom edge
 *   scan     CRT scanlines at 12% over everything
 *
 * There is no canvas and no per-frame script: the layers are painted once and
 * the compositor does the rest, so a menu left open costs nothing. `className`
 * is forwarded (the dim variant is `drm-backdrop--dim`).
 */

import { useMemo } from 'react';

interface Ring {
    r: number;
    n: number;
    size: number;
    color: string;
    phase: number;
}

// Cyan, pink, gold, lilac, cyan: the bullet-ring palette from the catalog card.
const RINGS: Ring[] = [
    { r: 118, n: 25, size: 8, color: '#2EE6FF', phase: 0 },
    { r: 182, n: 38, size: 8, color: '#FF4FD8', phase: 0.5 },
    { r: 246, n: 52, size: 8, color: '#FFE46B', phase: 0 },
    { r: 310, n: 65, size: 8, color: '#B28CFF', phase: 0.5 },
    { r: 374, n: 78, size: 8, color: '#2EE6FF', phase: 0 },
];

function bulletRing(rings: Ring[]) {
    return rings.flatMap((ring) =>
        Array.from({ length: ring.n }, (_, i) => {
            const a = ((i + ring.phase) / ring.n) * Math.PI * 2;
            // Snap to the 2px grid so every bullet is a crisp pixel square.
            const x = Math.round((400 + Math.cos(a) * ring.r) / 2) * 2;
            const y = Math.round((400 + Math.sin(a) * ring.r) / 2) * 2;
            const h = ring.size / 2;
            return (
                <g key={`${ring.r}-${i}`}>
                    <rect x={x - h} y={y - h} width={ring.size} height={ring.size} fill={ring.color} />
                    <rect x={x - h / 2} y={y - h / 2} width={h} height={h} fill="#FFFFFF" />
                </g>
            );
        }),
    );
}

/** A pentagram-ish spell-card sigil: two nested pentagons and a lit core. */
function Sigil() {
    const pts = (r: number, rot: number) =>
        Array.from({ length: 5 }, (_, i) => {
            const a = rot + (i / 5) * Math.PI * 2;
            return `${Math.round(400 + Math.cos(a) * r)},${Math.round(400 + Math.sin(a) * r)}`;
        }).join(' ');
    return (
        <>
            <circle cx="400" cy="400" r="76" fill="none" stroke="#FF4FD8" strokeWidth="4" strokeDasharray="12 8" />
            <polygon points={pts(62, -Math.PI / 2)} fill="none" stroke="#FFF0FB" strokeWidth="4" strokeLinejoin="miter" />
            <polygon points={pts(34, Math.PI / 2)} fill="none" stroke="#2EE6FF" strokeWidth="4" strokeLinejoin="miter" />
            <rect x="390" y="390" width="20" height="20" fill="#FFF0FB" />
        </>
    );
}

export function MenuBackdrop({ className }: { className?: string }) {
    const outer = useMemo(() => bulletRing(RINGS), []);
    return (
        <div aria-hidden="true" className={`drm-backdrop ${className ?? ''}`}>
            <div className="drm-bd-stars drm-bd-stars--far" />
            <div className="drm-bd-stars drm-bd-stars--near" />
            <div className="drm-bd-bloom" />
            <svg className="drm-bd-ring drm-bd-ring--outer" viewBox="0 0 800 800" shapeRendering="crispEdges">
                {outer}
            </svg>
            <svg className="drm-bd-ring drm-bd-ring--sigil" viewBox="0 0 800 800" shapeRendering="crispEdges">
                <Sigil />
            </svg>
            <div className="drm-bd-hills" />
            <div className="drm-bd-scan" />
        </div>
    );
}
