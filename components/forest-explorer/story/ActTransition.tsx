'use client';

import { useState, useEffect } from 'react';

interface ActTransitionProps {
    active: boolean;
    actName: string;
    onComplete: () => void;
}

export function ActTransition({ active, actName, onComplete }: ActTransitionProps) {
    const [phase, setPhase] = useState<'idle' | 'fadeIn' | 'hold' | 'fadeOut'>('idle');

    useEffect(() => {
        if (!active) { setPhase('idle'); return; }

        setPhase('fadeIn');
        const t1 = setTimeout(() => setPhase('hold'), 1500);
        const t2 = setTimeout(() => setPhase('fadeOut'), 3500);
        const t3 = setTimeout(() => {
            setPhase('idle');
            onComplete();
        }, 5000);

        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [active, onComplete]);

    if (phase === 'idle') return null;

    const opacity = phase === 'fadeIn' ? 1 : phase === 'hold' ? 1 : 0;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
            style={{
                backgroundColor: `rgba(0, 0, 0, ${opacity})`,
                transition: 'background-color 1.5s ease-in-out',
            }}
        >
            {(phase === 'hold' || phase === 'fadeOut') && (
                <div
                    className="text-center"
                    style={{
                        opacity: phase === 'hold' ? 1 : 0,
                        transition: 'opacity 1.5s ease-in-out',
                    }}
                >
                    <h2 className="text-3xl font-bold text-white/90 tracking-wider mb-2">
                        {actName}
                    </h2>
                    <div className="w-24 h-px mx-auto bg-white/30" />
                </div>
            )}
        </div>
    );
}
