// ============================================================
// Fighter model roster — which character a seat is drawn with.
//
// `ybot` is the Mixamo skeletal fighter that ships in /public. Every other
// entry is a Source-engine character already converted to GLB in R2 (the TF2
// loadout's `class_<name>` bodies and the hl2/portal/csgo model channels, see
// docs/tf2-game.md "Models"). The roster is a static candidate list; what the
// picker actually offers is filtered by what R2 has (`availableFighterModels`).
// Pure and dependency-free: shared by the renderer, the store, the net layer
// and the socket hub's validation.
// ============================================================

export type SourceGame = 'tf2' | 'hl2' | 'portal' | 'csgo';

/** Skeleton naming scheme, see boneMaps.ts. */
export type BoneFamily = 'bip' | 'valvebiped' | 'csgo';

export interface FighterModelDef {
    id: string;
    label: string;
    /** Group heading in the picker. */
    group: 'Kowloon' | 'Team Fortress 2' | 'Counter-Strike' | 'Half-Life 2' | 'Portal';
    /** `ybot` is bundled; the rest come from R2. */
    game: 'ybot' | SourceGame;
    family: BoneFamily | null;
    /** TF2: the class body (`class_<cls>`); others: the MDL path in `mdl/index.json`. */
    tf2Class?: string;
    mdl?: string;
}

export const DEFAULT_FIGHTER_MODEL = 'ybot';

const tf2 = (cls: string, label: string): FighterModelDef => ({
    id: `tf2_${cls}`, label, group: 'Team Fortress 2', game: 'tf2', family: 'bip', tf2Class: cls,
});
const csgo = (name: string, label: string): FighterModelDef => ({
    id: `csgo_${name}`, label, group: 'Counter-Strike', game: 'csgo', family: 'csgo',
    mdl: `models/player/custom_player/legacy/${name}.mdl`,
});
const hl2 = (id: string, label: string, mdl: string): FighterModelDef => ({
    id: `hl2_${id}`, label, group: 'Half-Life 2', game: 'hl2', family: 'valvebiped', mdl,
});
const portal = (id: string, label: string, mdl: string): FighterModelDef => ({
    id: `portal_${id}`, label, group: 'Portal', game: 'portal', family: 'valvebiped', mdl,
});

export const FIGHTER_MODELS: readonly FighterModelDef[] = [
    { id: DEFAULT_FIGHTER_MODEL, label: 'Y-Bot', group: 'Kowloon', game: 'ybot', family: null },
    tf2('scout', 'Scout'), tf2('soldier', 'Soldier'), tf2('pyro', 'Pyro'),
    tf2('demoman', 'Demoman'), tf2('heavy', 'Heavy'), tf2('engineer', 'Engineer'),
    tf2('medic', 'Medic'), tf2('sniper', 'Sniper'), tf2('spy', 'Spy'),
    csgo('tm_phoenix', 'Phoenix'), csgo('tm_leet', 'Elite Crew'), csgo('tm_balkan_varianta', 'Balkan'),
    csgo('tm_professional', 'Professional'), csgo('tm_separatist', 'Separatist'), csgo('tm_anarchist', 'Anarchist'),
    csgo('ctm_sas', 'SAS'), csgo('ctm_swat', 'SWAT'), csgo('ctm_fbi', 'FBI'),
    csgo('ctm_gign', 'GIGN'), csgo('ctm_st6', 'Seal Team 6'), csgo('ctm_idf', 'IDF'),
    hl2('combine', 'Combine Soldier', 'models/combine_soldier.mdl'),
    hl2('elite', 'Combine Elite', 'models/combine_super_soldier.mdl'),
    hl2('police', 'Metrocop', 'models/police.mdl'),
    hl2('alyx', 'Alyx', 'models/alyx.mdl'),
    hl2('barney', 'Barney', 'models/barney.mdl'),
    hl2('eli', 'Eli', 'models/eli.mdl'),
    hl2('kleiner', 'Kleiner', 'models/kleiner.mdl'),
    hl2('citizen_m1', 'Citizen (M)', 'models/humans/group01/male_01.mdl'),
    hl2('citizen_m2', 'Citizen (M2)', 'models/humans/group01/male_07.mdl'),
    hl2('citizen_f1', 'Citizen (F)', 'models/humans/group01/female_01.mdl'),
    portal('chell', 'Chell', 'models/player/chell/player.mdl'),
    portal('chell_legacy', 'Chell (classic)', 'models/player/chell.mdl'),
];

const BY_ID = new Map(FIGHTER_MODELS.map((m) => [m.id, m]));

export function getFighterModel(id: string): FighterModelDef {
    return BY_ID.get(id) ?? BY_ID.get(DEFAULT_FIGHTER_MODEL)!;
}

export function isFighterModelId(id: unknown): id is string {
    return typeof id === 'string' && BY_ID.has(id);
}

/** Untrusted id (storage, peer, socket payload) → a roster id, else the default. */
export function sanitizeFighterModelId(raw: unknown): string {
    return isFighterModelId(raw) ? raw : DEFAULT_FIGHTER_MODEL;
}

/** What R2 holds. `null` = not known (yet): that source contributes nothing. */
export interface ModelAvailability {
    /** Names from `/api/tf2-loadout/models` (`class_soldier`, …). */
    tf2: ReadonlySet<string> | null;
    /** Lower-case MDL paths per game, from each channel's `mdl/index.json`. */
    mdl: Partial<Record<'hl2' | 'portal' | 'csgo', ReadonlySet<string> | null>>;
}

export function isModelAvailable(def: FighterModelDef, avail: ModelAvailability): boolean {
    if (def.game === 'ybot') return true;
    if (def.game === 'tf2') return !!avail.tf2?.has(`class_${def.tf2Class}`);
    return !!avail.mdl[def.game]?.has(def.mdl!.toLowerCase());
}

export function availableFighterModels(avail: ModelAvailability): FighterModelDef[] {
    return FIGHTER_MODELS.filter((m) => isModelAvailable(m, avail));
}
