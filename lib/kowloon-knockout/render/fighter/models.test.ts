import { describe, expect, it } from 'vitest';
import {
    DEFAULT_FIGHTER_MODEL, FIGHTER_MODELS, availableFighterModels, getFighterModel,
    sanitizeFighterModelId,
} from './models';

describe('fighter model roster', () => {
    it('has unique ids and a bundled default', () => {
        const ids = FIGHTER_MODELS.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(getFighterModel(DEFAULT_FIGHTER_MODEL).game).toBe('ybot');
    });
    it('coerces unknown / forged ids to the default', () => {
        expect(sanitizeFighterModelId('tf2_heavy')).toBe('tf2_heavy');
        for (const bad of ['../../etc', '', null, undefined, 42, {}, 'TF2_HEAVY']) {
            expect(sanitizeFighterModelId(bad)).toBe(DEFAULT_FIGHTER_MODEL);
        }
        expect(getFighterModel('nope').id).toBe(DEFAULT_FIGHTER_MODEL);
    });
    it('offers only the default while availability is unknown', () => {
        expect(availableFighterModels({ tf2: null, mdl: {} }).map((m) => m.id)).toEqual([DEFAULT_FIGHTER_MODEL]);
    });
    it('filters to what R2 has (mdl paths compared lower-case)', () => {
        const got = availableFighterModels({
            tf2: new Set(['class_soldier', '123']),
            mdl: { hl2: new Set(['models/barney.mdl']), csgo: new Set(), portal: null },
        }).map((m) => m.id);
        expect(got).toEqual([DEFAULT_FIGHTER_MODEL, 'tf2_soldier', 'hl2_barney']);
    });
    it('does not offer models the published HL2 data lacks', () => {
        // Regression: hl2_combine / hl2_alyx were guessed paths absent from the bucket and threw at load.
        const ids = FIGHTER_MODELS.map((m) => m.id);
        for (const gone of ['hl2_combine', 'hl2_elite', 'hl2_alyx', 'hl2_eli']) expect(ids).not.toContain(gone);
    });
});
