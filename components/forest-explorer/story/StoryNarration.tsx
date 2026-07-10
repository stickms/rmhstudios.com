'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoryStore } from '@/lib/forest-explorer/store';

/**
 * Letterboxed story narration. Shows one line at a time from the store's
 * narrationLines queue; click / E / Enter advances, last line dismisses.
 * Pointer lock stays active — the prompt reads while walking.
 */
export function StoryNarration() {
    const { t } = useTranslation("c-forest-explorer");
    const lines = useStoryStore(s => s.narrationLines);
    const dismissNarration = useStoryStore(s => s.dismissNarration);
    const showPuzzleOverlay = useStoryStore(s => s.showPuzzleOverlay);
    const journalOpen = useStoryStore(s => s.journalOpen);

    const [lineIdx, setLineIdx] = useState(0);
    const [visible, setVisible] = useState(false);

    // Reset when a new narration arrives
    useEffect(() => {
        if (lines && lines.length > 0) {
            setLineIdx(0);
            const raf = requestAnimationFrame(() => setVisible(true));
            return () => cancelAnimationFrame(raf);
        }
        setVisible(false);
    }, [lines]);

    // Advance on E / Enter (space is jump, click is pointer-lock)
    useEffect(() => {
        if (!lines || showPuzzleOverlay || journalOpen) return;
        const fn = (e: KeyboardEvent) => {
            if (e.code !== 'KeyE' && e.code !== 'Enter') return;
            e.stopPropagation();
            setLineIdx(prev => {
                if (prev + 1 >= lines.length) {
                    dismissNarration();
                    return prev;
                }
                return prev + 1;
            });
        };
        // Capture phase so the interact handler doesn't also fire
        window.addEventListener('keydown', fn, true);
        return () => window.removeEventListener('keydown', fn, true);
    }, [lines, showPuzzleOverlay, journalOpen, dismissNarration]);

    // Auto-dismiss safety: each line lingers at most 9 seconds
    useEffect(() => {
        if (!lines) return;
        const timer = setTimeout(() => {
            setLineIdx(prev => {
                if (prev + 1 >= lines.length) {
                    dismissNarration();
                    return prev;
                }
                return prev + 1;
            });
        }, 9000);
        return () => clearTimeout(timer);
    }, [lines, lineIdx, dismissNarration]);

    if (!lines || lines.length === 0 || showPuzzleOverlay || journalOpen) return null;

    return (
        <div className="absolute inset-x-0 bottom-0 z-[60] pointer-events-none">
            {/* Letterbox gradient */}
            <div className="bg-gradient-to-t from-black/85 via-black/50 to-transparent pt-16 pb-8 px-6">
                <div
                    className="max-w-xl mx-auto text-center transition-opacity duration-700"
                    style={{ opacity: visible ? 1 : 0 }}
                >
                    <p key={lineIdx} className="text-green-100/90 text-base italic leading-relaxed animate-in fade-in duration-700">
                        {lines[lineIdx]}
                    </p>
                    <p className="text-white/25 text-[10px] mt-3 tracking-widest uppercase">
                        {lineIdx + 1 < lines.length
                            ? t("narration-continue", { defaultValue: "E — continue" })
                            : t("narration-dismiss", { defaultValue: "E — close" })}
                    </p>
                </div>
            </div>
        </div>
    );
}
