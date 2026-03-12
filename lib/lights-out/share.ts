import { getShapeLabel, type GridShape } from './shapes';

export type PerformanceRating = {
    label: string;
    emoji: string;
    tier: number; // 0 = best, higher = worse
};

/**
 * Get a vague performance description based on how close
 * the player's moves are to the optimal solution.
 */
export function getPerformanceRating(
    playerMoves: number,
    optimalMoves: number,
    dnf: boolean
): PerformanceRating {
    if (dnf) return { label: 'Did Not Finish', emoji: '🏳️', tier: 5 };

    const diff = playerMoves - optimalMoves;
    const ratio = optimalMoves > 0 ? playerMoves / optimalMoves : Infinity;

    if (diff === 0) return { label: 'Perfect!', emoji: '🌟', tier: 0 };
    if (diff <= 1) return { label: 'Excellent!', emoji: '✨', tier: 1 };
    if (diff <= 3 || ratio <= 1.5) return { label: 'Great!', emoji: '🔥', tier: 2 };
    if (diff <= 6 || ratio <= 2.0) return { label: 'Good!', emoji: '👍', tier: 3 };
    return { label: 'Solved!', emoji: '💡', tier: 4 };
}

/**
 * Generate a Wordle-style share text for clipboard.
 * Does NOT reveal move count — only shows the vague rating.
 */
export function generateShareText(
    dateKey: string,
    shape: GridShape,
    playerMoves: number,
    optimalMoves: number,
    dnf: boolean,
    hintUsed: boolean
): string {
    const rating = getPerformanceRating(playerMoves, optimalMoves, dnf);
    const shapeLabel = getShapeLabel(shape);
    const hintStr = hintUsed ? ' 💡' : '';

    const lines = [
        `🔦 Lights Out · ${dateKey}`,
        `${shapeLabel} · ${rating.emoji} ${rating.label}${hintStr}`,
        '',
        'https://rmhstudios.com/lights-out',
    ];

    return lines.join('\n');
}
