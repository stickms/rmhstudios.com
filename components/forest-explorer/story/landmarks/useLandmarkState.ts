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
    const revealedIds = useStoryStore(s => s.flashlightRevealedIds);
    const puzzleStates = useStoryStore(s => s.puzzleStates);

    const { puzzleId, interactableId } = useMemo(() => {
        const puzzle = puzzleDefinitions.find(p => p.landmarkId === landmarkId);
        const inter = puzzle ? interactables.find(i => i.puzzleId === puzzle.id) : undefined;
        return { puzzleId: puzzle?.id, interactableId: inter?.id };
    }, [landmarkId]);

    const isSolved = puzzleId ? puzzleStates[puzzleId]?.status === 'solved' : false;
    const isRevealed = interactableId ? revealedIds.includes(interactableId) : false;

    return { isSolved, isRevealed, puzzleId };
}
