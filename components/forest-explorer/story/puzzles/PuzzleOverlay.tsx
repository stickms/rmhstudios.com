'use client';

import { useEffect } from 'react';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { getPuzzleById } from '@/lib/forest-explorer/puzzleDefinitions';
import { PuzzleRegistry } from './PuzzleRegistry';

export function PuzzleOverlay() {
    const activePuzzleId = useStoryStore(s => s.activePuzzleId);
    const showOverlay = useStoryStore(s => s.showPuzzleOverlay);
    const closePuzzle = useStoryStore(s => s.closePuzzle);
    const solvePuzzle = useStoryStore(s => s.solvePuzzle);
    const incrementAttempt = useStoryStore(s => s.incrementAttempt);
    const puzzleStates = useStoryStore(s => s.puzzleStates);
    const discoveredEntries = useStoryStore(s => s.discoveredEntries);
    const toggleJournal = useStoryStore(s => s.toggleJournal);

    // Release pointer lock when overlay opens
    useEffect(() => {
        if (showOverlay) {
            document.exitPointerLock?.();
        }
    }, [showOverlay]);

    // ESC to close
    useEffect(() => {
        if (!showOverlay) return;
        const fn = (e: KeyboardEvent) => {
            if (e.code === 'Escape') {
                e.preventDefault();
                closePuzzle();
            }
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [showOverlay, closePuzzle]);

    if (!showOverlay || !activePuzzleId) return null;

    const puzzle = getPuzzleById(activePuzzleId);
    if (!puzzle) return null;

    const puzzleState = puzzleStates[activePuzzleId];
    const isSolved = puzzleState?.status === 'solved';
    const attempts = puzzleState?.attemptCount ?? 0;
    const hasHint = puzzle.hintEntryIds?.some(id => discoveredEntries.includes(id));

    const PuzzleComponent = PuzzleRegistry[puzzle.type];

    return (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            {/* Content */}
            <div className="relative z-10 w-full max-w-2xl mx-auto px-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white">{puzzle.title}</h2>
                        <p className="text-white/50 text-sm mt-0.5">{puzzle.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isSolved && (
                            <span className="text-white/30 text-xs">
                                Attempts: {attempts}
                            </span>
                        )}
                        <button
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors cursor-pointer"
                            onClick={closePuzzle}
                        >
                            X
                        </button>
                    </div>
                </div>

                {/* Puzzle content */}
                <div className="bg-black/50 border border-white/10 rounded-2xl p-6 min-h-[400px] flex items-center justify-center">
                    {isSolved ? (
                        <div className="text-center space-y-3">
                            <div className="text-4xl">✓</div>
                            <p className="text-green-300 font-medium">Puzzle Solved!</p>
                            <button
                                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white/70 rounded-lg text-sm cursor-pointer"
                                onClick={closePuzzle}
                            >
                                Close
                            </button>
                        </div>
                    ) : PuzzleComponent ? (
                        <PuzzleComponent
                            config={puzzle.config}
                            onSolve={() => solvePuzzle(activePuzzleId)}
                            onAttempt={() => incrementAttempt(activePuzzleId)}
                        />
                    ) : (
                        <p className="text-white/40 text-sm">Puzzle type not implemented yet.</p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center mt-3">
                    {hasHint && (
                        <button
                            className="px-3 py-1.5 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/30 text-amber-200/70 rounded-lg text-xs transition-colors cursor-pointer"
                            onClick={() => {
                                closePuzzle();
                                toggleJournal();
                            }}
                        >
                            View Hint in Journal
                        </button>
                    )}
                    <div className="flex-1" />
                    <span className="text-white/20 text-xs">
                        {puzzle.difficulty} · ~{puzzle.estimatedMinutes} min
                    </span>
                </div>
            </div>
        </div>
    );
}
