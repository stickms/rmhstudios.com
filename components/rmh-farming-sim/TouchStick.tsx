// RMH Farming Simulator — on-screen walk stick for phones and tablets.
'use client';

import { useEffect, useRef, useState } from 'react';
import { farmTouch, farmUsesTouch, resetFarmTouch } from '@/lib/rmh-farming-sim/touch';

const RADIUS = 44;

export default function TouchStick() {
    const [show, setShow] = useState(false);
    const thumbRef = useRef<HTMLDivElement>(null);
    const activeId = useRef<number | null>(null);
    const origin = useRef({ x: 0, y: 0 });

    useEffect(() => {
        setShow(farmUsesTouch());
        return resetFarmTouch;
    }, []);

    if (!show) return null;

    const update = (e: React.PointerEvent<HTMLDivElement>) => {
        let dx = e.clientX - origin.current.x;
        let dy = e.clientY - origin.current.y;
        const len = Math.hypot(dx, dy);
        if (len > RADIUS) {
            dx = (dx / len) * RADIUS;
            dy = (dy / len) * RADIUS;
        }
        farmTouch.dx = dx / RADIUS;
        farmTouch.dz = dy / RADIUS;
        if (thumbRef.current) thumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const end = (e: React.PointerEvent<HTMLDivElement>) => {
        if (activeId.current !== e.pointerId) return;
        activeId.current = null;
        resetFarmTouch();
        if (thumbRef.current) thumbRef.current.style.transform = 'translate(0px, 0px)';
    };

    return (
        <div
            className="rfs-stick"
            role="group"
            aria-label="Walk stick"
            onPointerDown={(e) => {
                if (activeId.current !== null) return;
                activeId.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                update(e);
            }}
            onPointerMove={(e) => {
                if (activeId.current === e.pointerId) update(e);
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
        >
            <div ref={thumbRef} className="rfs-stick-thumb" />
        </div>
    );
}
