'use client';

import { useMemo } from 'react';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { puzzleDefinitions } from '@/lib/forest-explorer/puzzleDefinitions';
import { interactables } from '@/lib/forest-explorer/interactables';

/**
 * Resolves a landmark's live state from its associated puzzle:
 * - `isSolved`  — the landmark's puzzle has been solved
 * - `isRevealed` — the puzzle's interactable is currently revealed
 *   (flashlight beam on it, proximity, or always visible)
 *
 * Landmarks and puzzles are linked through PuzzleDefinition.landmarkId,
 * so this works for every landmark without string-matching heuristics.
 */
export function useLandmarkState(landmarkId: string) {
    const { puzzleId, interactableId } = useMemo(() => {
        const puzzle = puzzleDefinitions.find(p => p.landmarkId === landmarkId);
        const inter = puzzle ? interactables.find(i => i.puzzleId === puzzle.id) : undefined;
        return { puzzleId: puzzle?.id, interactableId: inter?.id };
    }, [landmarkId]);

    // Select booleans, never the collections themselves. Selecting
    // `flashlightRevealedIds` used to re-render every landmark ~20x/second,
    // because the reveal loop published a new array identity on every pass —
    // see docs/3d-performance-audit.md §1.5.
    const isRevealed = useStoryStore(
        s => (interactableId ? s.flashlightRevealedIds.has(interactableId) : false),
    );
    const isSolved = useStoryStore(
        s => (puzzleId ? s.puzzleStates[puzzleId]?.status === 'solved' : false),
    );

    return { isSolved, isRevealed, puzzleId };
}
