import { describe, expect, it } from 'vitest';
import {
    DEFAULT_FIGHTER_MODEL, FIGHTER_MODELS, availableFighterModels, getFighterModel, modelSources,
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
    it('offers Alyx, the Combine soldier and Chell only once a published index lists them', () => {
        const none = availableFighterModels({ tf2: new Set(), mdl: { hl2: new Set(['models/barney.mdl']), portal: new Set(), csgo: new Set() } }).map((m) => m.id);
        for (const id of ['hl2_alyx', 'hl2_combine', 'portal_chell']) expect(none).not.toContain(id);
        // From the HL2 channel...
        const hl2 = availableFighterModels({ tf2: null, mdl: { hl2: new Set(['models/alyx.mdl', 'models/combine_soldier.mdl']) } }).map((m) => m.id);
        expect(hl2).toEqual(expect.arrayContaining(['hl2_alyx', 'hl2_combine']));
        // ...or, if the demo depot lacks them, from Portal's (which carries HL2's shared content).
        const viaPortal = availableFighterModels({ tf2: null, mdl: { hl2: new Set(), portal: new Set(['models/alyx.mdl']) } }).map((m) => m.id);
        expect(viaPortal).toContain('hl2_alyx');
        // Chell by whichever path the build uses.
        for (const path of ['models/player/chell/player.mdl', 'models/player/chell.mdl', 'models/player.mdl']) {
            expect(availableFighterModels({ tf2: null, mdl: { portal: new Set([path]) } }).map((m) => m.id)).toContain('portal_chell');
        }
    });
    it('resolves a model to its sources in priority order, lower-cased', () => {
        expect(modelSources(getFighterModel('hl2_alyx'))).toEqual([
            { game: 'hl2', mdl: 'models/alyx.mdl' },
            { game: 'portal', mdl: 'models/alyx.mdl' },
        ]);
        expect(modelSources(getFighterModel('portal_chell')).map((s) => s.mdl)).toEqual([
            'models/player/chell/player.mdl', 'models/player/chell.mdl', 'models/player.mdl',
        ]);
        expect(modelSources(getFighterModel('ybot'))).toEqual([]);
        expect(modelSources(getFighterModel('tf2_heavy'))).toEqual([]);
    });
});
