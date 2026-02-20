import { Modifiers } from '../store/useGameStore';

export function calculateScoreMultiplier(modifiers: Partial<Modifiers>): number {
    let mult = 1.0;

    // Difficulty base multiplier
    const difficultyLevel = modifiers.difficulty || 'normal';
    if (difficultyLevel === 'easy') mult *= 0.7;
    else if (difficultyLevel === 'normal') mult *= 1.0;
    else if (difficultyLevel === 'hard') mult *= 1.3;
    else if (difficultyLevel === 'expert') mult *= 1.5;

    // Modifier addends
    if (modifiers.invisible) mult += 0.2;
    if (modifiers.speed && modifiers.speed > 1.0) mult += (modifiers.speed - 1.0) * 0.5;
    if (modifiers.bombs) mult += 0.15;
    if (modifiers.switching) mult += 0.15;
    if (modifiers.spin) mult += 0.15;
    if (modifiers.strictTiming) mult += 0.25;
    if (modifiers.oneTrack) mult += 0.15;

    return mult;
}
