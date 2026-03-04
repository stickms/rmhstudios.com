'use client';

import { useEffect, useState } from 'react';
import { useStoryStore } from '@/lib/forest-explorer/store';

export function StoryToast() {
    const toastMessage = useStoryStore(s => s.toastMessage);
    const [visible, setVisible] = useState(false);
    const [displayMsg, setDisplayMsg] = useState<string | null>(null);

    useEffect(() => {
        if (toastMessage) {
            setDisplayMsg(toastMessage);
            // Small delay for mount → animate in
            requestAnimationFrame(() => setVisible(true));
        } else {
            setVisible(false);
            // Keep text visible during fade-out
            const timer = setTimeout(() => setDisplayMsg(null), 500);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);

    if (!displayMsg) return null;

    return (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[70] pointer-events-none">
            <div
                className="px-5 py-2.5 rounded-xl bg-green-900/60 backdrop-blur-sm border border-green-600/30 text-center transition-all duration-500"
                style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(8px)',
                }}
            >
                <p className="text-green-200 text-sm font-medium">{displayMsg}</p>
            </div>
        </div>
    );
}
