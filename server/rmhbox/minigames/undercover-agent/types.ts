// ─── Phase Enum ──────────────────────────────────────────────────

export enum UndercoverAgentPhase {
  TEAM_SETUP = 'TEAM_SETUP',
  SETUP = 'SETUP',
  CLUE = 'CLUE',
  GUESS = 'GUESS',
  TURN_TRANSITION = 'TURN_TRANSITION',
  BOARD_REVEAL = 'BOARD_REVEAL',
  GAME_OVER = 'GAME_OVER',
}

// ─── Tile Enums ──────────────────────────────────────────────────

export enum TileType {
  RED_AGENT = 'RED_AGENT',
  BLUE_AGENT = 'BLUE_AGENT',
  BYSTANDER = 'BYSTANDER',
  ASSASSIN = 'ASSASSIN',
}

export enum TileState {
  HIDDEN = 'HIDDEN',
  REVEALED = 'REVEALED',
}

// ─── Type Definitions ────────────────────────────────────────────

export interface GridTile {
  position: number;
  word: string;
  type: TileType;
  state: TileState;
  revealedBy?: string;
}

export interface TeamState {
  teamId: 'red' | 'blue';
  spymasterId: string;
  operativeIds: string[];
  agentsTotal: number;
  agentsRevealed: number;
  color: string;
}

export interface CurrentClue {
  word: string;
  number: number | 'unlimited';
  teamId: 'red' | 'blue';
  guessesUsed: number;
}

export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface UndercoverAgentState {
  grid: GridTile[];
  keyCard: TileType[];
  teams: Record<'red' | 'blue', TeamState>;
  currentTeam: 'red' | 'blue';
  phase: UndercoverAgentPhase;
  currentClue: CurrentClue | null;
  guessesRemaining: number;
  turnNumber: number;
  consecutivePasses: number;
  winner: 'red' | 'blue' | 'draw' | null;
  winReason: string | null;
  actionLog: ActionLogEntry[];
}
