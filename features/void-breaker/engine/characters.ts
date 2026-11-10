// ── Void Breaker — playable characters (Voidrunners) ─────────────────────────
// Each character is a distinct starting playstyle: a set of modifiers applied
// to the player at run start (stacking on top of meta-progression). Pure data
// + helpers so it's fully unit-testable; the chosen id is persisted by the UI.

export type CharacterId = 'striker' | 'juggernaut' | 'phantom' | 'gunner';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;       // atmospheric subtitle
  description: string;
  icon: string;
  color: string;
  /** Change to base max HP (base is 3). */
  maxHpDelta: number;
  /** Flat starting bullet-damage bonus. */
  damageBonus: number;
  /** Move-speed multiplier. */
  moveSpeedMult: number;
  /** Fire-interval multiplier (<1 = faster). */
  fireRateMult: number;
  /** Dash-cooldown multiplier (<1 = faster). */
  dashCooldownMult: number;
  /** Shards orbiting at run start. */
  startShards: number;
  /** Void Cores to unlock (0 = unlocked from the start). */
  unlockCost: number;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'striker', name: 'Striker', title: '均衡', icon: '✦', color: '#00f5ff',
    description: 'The all-rounder. No weaknesses, no crutches.',
    maxHpDelta: 0, damageBonus: 0, moveSpeedMult: 1, fireRateMult: 1, dashCooldownMult: 1, startShards: 0, unlockCost: 0,
  },
  {
    id: 'juggernaut', name: 'Juggernaut', title: '铁壁', icon: '⛨', color: '#ff6644',
    description: 'Tanky bruiser: +2 HP and harder hits, but slow and heavy.',
    maxHpDelta: 2, damageBonus: 1, moveSpeedMult: 0.85, fireRateMult: 1.1, dashCooldownMult: 1.25, startShards: 0, unlockCost: 60,
  },
  {
    id: 'phantom', name: 'Phantom', title: '幽影', icon: '➶', color: '#cc66ff',
    description: 'Glass dodger: fast and a lightning dash, but fragile (-1 HP).',
    maxHpDelta: -1, damageBonus: 0, moveSpeedMult: 1.2, fireRateMult: 1, dashCooldownMult: 0.55, startShards: 0, unlockCost: 80,
  },
  {
    id: 'gunner', name: 'Gunner', title: '连射', icon: '⟫', color: '#ffd24a',
    description: 'Bullet hose: very high fire rate, but lighter shots and footwork.',
    maxHpDelta: 0, damageBonus: 0, moveSpeedMult: 0.95, fireRateMult: 0.68, dashCooldownMult: 1, startShards: 3, unlockCost: 100,
  },
];

const BY_ID = new Map(CHARACTERS.map(c => [c.id, c]));

export function getCharacter(id: CharacterId): CharacterDef {
  return BY_ID.get(id) ?? CHARACTERS[0];
}

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && BY_ID.has(v as CharacterId);
}
