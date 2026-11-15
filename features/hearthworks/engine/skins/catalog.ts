/**
 * Skins are different character MODELS, tiered and priced in in-game money by how
 * influential the character is (owner, 2026-11-04) — the G-Man is the most expensive of all.
 * `source` names the Source-engine model in the asset channels (hl2-game/, tf2-game/, csgo-game/); where a
 * channel cannot supply it, the game draws the skin's procedural stand-in (see features/hearthworks/engine/art).
 */

export const SKIN_TIERS =
  [
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary',
  ] as const;
export type SkinTier =
  (typeof SKIN_TIERS)[number];

export const SKIN_IDS =
  [
    'citizen',
    'worker',
    'rebel',
    'barney',
    'metrocop',
    'combine-soldier',
    'combine-elite',
    'scout',
    'soldier',
    'pyro',
    'demoman',
    'heavy',
    'engineer',
    'medic',
    'sniper',
    'spy',
    'breen',
    'gman',
  ] as const;
export type SkinId =
  (typeof SKIN_IDS)[number];

export interface SkinDef {
  name: string;
  tier: SkinTier;
  /** In-game money. 0 only for the starter skin. */
  price: number;
  /** Model path within the Valve-derived asset channels, or null when only a procedural stand-in exists. */
  source:
    | string
    | null;
}

export const DEFAULT_SKIN: SkinId =
  'citizen';

export const SKINS: Record<
  SkinId,
  SkinDef
> =
  {
    citizen:
      {
        name: 'Citizen',
        tier: 'common',
        price: 0,
        source:
          'hl2:models/humans/group01/male_01.mdl',
      },
    worker:
      {
        name: 'Factory worker',
        tier: 'common',
        price: 300,
        source:
          'hl2:models/humans/group03/male_02.mdl',
      },
    rebel:
      {
        name: 'Rebel',
        tier: 'common',
        price: 450,
        source:
          'hl2:models/humans/group03/female_01.mdl',
      },
    barney:
      {
        name: 'Barney',
        tier: 'uncommon',
        price: 1_200,
        source:
          'hl2:models/barney.mdl',
      },
    metrocop:
      {
        name: 'Metrocop',
        tier: 'uncommon',
        price: 1_800,
        source:
          'hl2:models/police.mdl',
      },
    'combine-soldier':
      {
        name: 'Combine soldier',
        tier: 'rare',
        price: 6_000,
        source:
          'hl2:models/combine_soldier.mdl',
      },
    'combine-elite':
      {
        name: 'Combine elite',
        tier: 'rare',
        price: 9_000,
        source:
          'hl2:models/combine_super_soldier.mdl',
      },
    scout:
      {
        name: 'Scout',
        tier: 'epic',
        price: 20_000,
        source:
          'tf2:models/player/scout.mdl',
      },
    soldier:
      {
        name: 'Soldier',
        tier: 'epic',
        price: 20_000,
        source:
          'tf2:models/player/soldier.mdl',
      },
    pyro: {
      name: 'Pyro',
      tier: 'epic',
      price: 22_000,
      source:
        'tf2:models/player/pyro.mdl',
    },
    demoman:
      {
        name: 'Demoman',
        tier: 'epic',
        price: 22_000,
        source:
          'tf2:models/player/demo.mdl',
      },
    heavy:
      {
        name: 'Heavy',
        tier: 'epic',
        price: 24_000,
        source:
          'tf2:models/player/heavy.mdl',
      },
    engineer:
      {
        name: 'Engineer',
        tier: 'epic',
        price: 24_000,
        source:
          'tf2:models/player/engineer.mdl',
      },
    medic:
      {
        name: 'Medic',
        tier: 'epic',
        price: 26_000,
        source:
          'tf2:models/player/medic.mdl',
      },
    sniper:
      {
        name: 'Sniper',
        tier: 'epic',
        price: 26_000,
        source:
          'tf2:models/player/sniper.mdl',
      },
    spy: {
      name: 'Spy',
      tier: 'epic',
      price: 30_000,
      source:
        'tf2:models/player/spy.mdl',
    },
    breen:
      {
        name: 'Dr. Breen',
        tier: 'legendary',
        price: 90_000,
        source:
          'hl2:models/breen.mdl',
      },
    gman: {
      name: 'The G-Man',
      tier: 'legendary',
      price: 250_000,
      source:
        'hl2:models/gman.mdl',
    },
  };

export const isSkinId =
  (
    v: unknown,
  ): v is SkinId =>
    typeof v ===
      'string' &&
    Object.hasOwn(
      SKINS,
      v,
    );

/** Untrusted input (a peer's announcement, a save) → a legal skin id or null. */
export const validateSkinId =
  (
    v: unknown,
  ): SkinId | null =>
    isSkinId(
      v,
    )
      ? v
      : null;

export const canAfford =
  (
    money: number,
    id: SkinId,
  ): boolean =>
    money >=
    SKINS[
      id
    ]
      .price;
