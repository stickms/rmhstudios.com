// ───────────────────────────────────────────────────────────────────────────
// House Always Wins — shared types
// ───────────────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Abilities (metroidvania gates) ───────────────────────────────────────────
export type AbilityId = "doubleJump" | "dash" | "wallGrip";

export const ABILITY_LABEL: Record<AbilityId, string> = {
  doubleJump: "Lucky Coin",
  dash: "All-In Dash",
  wallGrip: "Card Grip",
};

// ── Rooms ─────────────────────────────────────────────────────────────────────
export type RoomId =
  | "lobby"
  | "pokerHall"
  | "slotVault"
  | "securityWing"
  | "maintenance"
  | "vault";

// ── Dialogue ──────────────────────────────────────────────────────────────────
export interface DialogueChoice {
  text: string;
  // An action string consumed by the scene. Convention: "verb:arg".
  action: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
}

export interface DialogueData {
  id: string;
  lines: DialogueLine[];
}

// ── Entities placed in rooms ─────────────────────────────────────────────────
export type NpcId = "dealer" | "janitor" | "witch" | "guard" | "house";

export interface DoorSpec {
  id: string;
  // Grid cell of the door (top-left); each door is 1 wide x 2 tall.
  col: number;
  row: number;
  to: RoomId;
  toDoor: string; // id of the destination door to spawn at
  // Optional gating.
  lockedByKey?: number; // requires this many vault keys
  lockedByAbility?: AbilityId;
  costChips?: number; // toll door — pay chips once
  facing?: "left" | "right";
}

export interface NpcSpec {
  id: NpcId;
  col: number;
  row: number;
  facing?: "left" | "right";
}

export type EntityKind =
  | "chip"
  | "key"
  | "ability"
  | "lever"
  | "plate"
  | "mover"
  | "laser"
  | "camera"
  | "save"
  | "sign"
  | "slotReel"
  | "vaultCore"
  | "pokerTable";

export interface EntitySpec {
  kind: EntityKind;
  id: string;
  col: number;
  row: number;
  // Generic params per kind.
  ability?: AbilityId;
  // Moving platform path (relative tiles) + speed.
  dx?: number;
  dy?: number;
  speed?: number;
  // Laser: orientation + blink timing.
  vertical?: boolean;
  length?: number; // tiles
  onTime?: number;
  offTime?: number;
  phase?: number;
  // Lever/plate logic group.
  group?: string;
  // Sign / lore text key.
  text?: string;
  // Slot reel target symbol index.
  target?: number;
}

export interface RoomData {
  id: RoomId;
  name: string;
  music: string;
  grid: string[];
  doors: DoorSpec[];
  npcs: NpcSpec[];
  entities: EntitySpec[];
  // Visual theme key controls backdrop tint / decorations.
  theme: "lobby" | "poker" | "slots" | "security" | "maintenance" | "vault";
}

// ── Scene transition ─────────────────────────────────────────────────────────
export interface SceneTransition {
  to: RoomId;
  toDoor: string;
}

// ── Quest / objective tracking ───────────────────────────────────────────────
export interface QuestState {
  flags: Record<string, boolean>;
  abilities: Record<AbilityId, boolean>;
  keys: number;
  chips: number;
  debt: number;
}

export interface Objective {
  id: string;
  text: string;
  done: (s: QuestState) => boolean;
  hidden?: (s: QuestState) => boolean;
}
