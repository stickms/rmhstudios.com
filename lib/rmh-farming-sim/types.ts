// RMH Farming Simulator — client-side type definitions.

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type ToolId = 'hoe' | 'can' | 'scythe';

export interface CropDef {
    id: string;
    name: string;
    seedPrice: number;
    sellPrice: number;
    growthDays: number;
    seasons: Season[];
    color: string;
    regrowDays?: number;
}

export interface ToolUpgrade {
    level: number;
    cost: number;
    radius: number;
    label: string;
}
export interface ToolDef {
    name: string;
    upgrades: ToolUpgrade[];
}
export type ToolCatalog = Record<ToolId, ToolDef>;

export interface Welcome {
    userId: string;
    name: string;
    crops: CropDef[];
    tools: ToolCatalog;
    ownFarmCode: string;
    seasons: Season[];
    daysPerSeason: number;
    grid: number;
    maxEnergy: number;
    actionRange: number;
}

export interface TileCrop {
    id: string;
    stage: number;
    max: number;
    watered: boolean;
    ready: boolean;
    regrow: number;
}
export interface TileView {
    t: 0 | 1;            // terrain: grass | tilled
    c: TileCrop | null;
}
export interface TileDelta extends TileView {
    i: number;
}

export interface FarmState {
    id: string;
    code: string;
    name: string;
    grid: number;
    tiles: TileView[];
    seeds: Record<string, number>;
    inventory: Record<string, number>;
    tools: Record<ToolId, number>;
}

export interface Stats {
    money: number;
    day: number;
    season: Season;
    dayOfSeason: number;
    daysPerSeason: number;
    weather: 'sunny' | 'rain';
    shippedValue: number;
    energy: number;
}

export interface MemberView {
    userId: string;
    name: string;
    online: boolean;
    isHost: boolean;
}
export interface MembersState {
    ownerUserId: string;
    members: MemberView[];
    joinRequests: { userId: string; name: string }[];
}

export interface PresencePlayer {
    userId: string;
    name: string;
    x: number;
    z: number;
    dir: number;
}

export interface ChatMessage {
    name: string;
    text: string;
    ts: number;
}

export interface Toast {
    id: number;
    message: string;
    kind: 'info' | 'success' | 'error';
}

// A farm the player has previously visited (persisted in localStorage).
export interface RecentFarm {
    code: string;
    name: string;
    host: string;
    lastVisited: number;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

// Active tool / seed selection in the hotbar.
export type HotbarSelection =
    | { kind: 'tool'; tool: ToolId }
    | { kind: 'seed'; cropId: string };
