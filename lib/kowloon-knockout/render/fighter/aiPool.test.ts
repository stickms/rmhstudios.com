import { describe, expect, it } from 'vitest';
import { AI_MODEL_POOL, aiModelForSeat, randomAiModel } from './aiPool';
import { isFighterModelId } from './models';

describe('AI model pool', () => {
    it('names only roster ids', () => {
        for (const id of AI_MODEL_POOL) expect(isFighterModelId(id)).toBe(true);
    });
    it('picks deterministically per seat and within range for any random', () => {
        expect(aiModelForSeat(3)).toBe(aiModelForSeat(3));
        expect(AI_MODEL_POOL).toContain(randomAiModel(() => 0.999999));
        expect(AI_MODEL_POOL).toContain(randomAiModel(() => 0));
    });
});
