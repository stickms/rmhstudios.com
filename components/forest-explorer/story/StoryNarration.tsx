'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it — `motion` bundles its own full feature
// implementation, which lands in the SHARED ENTRY CHUNK when the module is
// reachable from a route's top level.
import { m as motion } from 'framer-motion';
import { fade } from '@/lib/motion';
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
    /** Mirrors lineIdx so `advance` can decide without a state updater. */
    const idxRef = useRef(0);

    // Reset when a new narration arrives
    useEffect(() => {
        if (lines && lines.length > 0) {
            idxRef.current = 0;
            setLineIdx(0);
            const raf = requestAnimationFrame(() => setVisible(true));
            return () => cancelAnimationFrame(raf);
        }
        setVisible(false);
    }, [lines]);

    /**
     * Step to the next line, or dismiss on the last one.
     *
     * The dismissal deliberately happens OUTSIDE a setState updater. It used to
     * live inside `setLineIdx(prev => { ... dismissNarration() ... })`, and React
     * runs updater functions during the render phase — so writing to the Zustand
     * store from in there triggered "Cannot update a component (StoryNarration)
     * while rendering a different component". Reading the current index from a
     * ref keeps the decision in the event handler where it belongs.
     */
    const advance = useCallback(() => {
        if (!lines) return;
        const next = idxRef.current + 1;
        if (next >= lines.length) {
            dismissNarration();
            return;
        }
        idxRef.current = next;
        setLineIdx(next);
    }, [lines, dismissNarration]);

    // Advance on E / Enter (space is jump, click is pointer-lock)
    useEffect(() => {
        if (!lines || showPuzzleOverlay || journalOpen) return;
        const fn = (e: KeyboardEvent) => {
            if (e.code !== 'KeyE' && e.code !== 'Enter') return;
            e.stopPropagation();
            advance();
        };
        // Capture phase so the interact handler doesn't also fire
        window.addEventListener('keydown', fn, true);
        return () => window.removeEventListener('keydown', fn, true);
    }, [lines, showPuzzleOverlay, journalOpen, advance]);

    // Auto-dismiss safety: each line lingers at most 9 seconds
    useEffect(() => {
        if (!lines) return;
        const timer = setTimeout(advance, 9000);
        return () => clearTimeout(timer);
    }, [lines, lineIdx, advance]);

    if (!lines || lines.length === 0 || showPuzzleOverlay || journalOpen) return null;

    return (
        <div className="absolute inset-x-0 bottom-0 z-[60] pointer-events-none">
            {/* Letterbox gradient. The wash itself runs to the physical edge —
                that is the point of a letterbox — while its padding carries the
                insets so the narration text clears the home indicator. */}
            <div className="bg-gradient-to-t from-black/85 via-black/50 to-transparent pt-16 pb-[calc(2rem+var(--safe-bottom))] pl-[calc(1.5rem+var(--safe-left))] pr-[calc(1.5rem+var(--safe-right))]">
                <div
                    className="max-w-xl mx-auto text-center transition-opacity duration-700"
                    style={{ opacity: visible ? 1 : 0 }}
                >
                    <motion.p
                      key={lineIdx}
                      variants={fade}
                      initial="initial"
                      animate="animate"
                      className="text-green-100/90 text-base italic leading-relaxed"
                    >
                        {lines[lineIdx]}
                    </motion.p>
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
