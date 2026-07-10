// RMH Farming Simulator — global client store (zustand).

import { create } from 'zustand';
import type {
    ChatMessage,
    ConnectionStatus,
    CropDef,
    FarmState,
    HotbarSelection,
    MembersState,
    PresencePlayer,
    RecentFarm,
    Stats,
    Toast,
    ToolCatalog,
    Welcome,
} from './types';

const RECENT_KEY = 'rfs:recent-farms';

function loadRecents(): RecentFarm[] {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw) as RecentFarm[];
        return Array.isArray(arr) ? arr.slice(0, 20) : [];
    } catch {
        return [];
    }
}
function saveRecents(list: RecentFarm[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20)));
    } catch {
        /* ignore */
    }
}

interface RfsState {
    // identity / catalog
    welcome: Welcome | null;
    crops: CropDef[];
    tools: ToolCatalog | null;
    cropById: Record<string, CropDef>;
    ownFarmCode: string;

    // live farm
    farm: FarmState | null;
    stats: Stats | null;
    members: MembersState | null;
    presence: PresencePlayer[];
    chat: ChatMessage[];

    // ui
    connection: ConnectionStatus;
    screen: 'menu' | 'game';
    selection: HotbarSelection;
    toasts: Toast[];
    recents: RecentFarm[];
    pendingJoinCode: string | null;
    shopOpen: boolean;
    membersOpen: boolean;

    // actions
    setConnection: (c: ConnectionStatus) => void;
    applyWelcome: (w: Welcome) => void;
    applyFarmState: (f: FarmState) => void;
    applyTileDeltas: (deltas: import('./types').TileDelta[]) => void;
    applyStats: (s: Stats) => void;
    applyMembers: (m: MembersState) => void;
    applyPresence: (p: PresencePlayer[]) => void;
    addChat: (m: ChatMessage) => void;
    pushToast: (message: string, kind?: Toast['kind']) => void;
    dismissToast: (id: number) => void;
    setScreen: (s: 'menu' | 'game') => void;
    setSelection: (sel: HotbarSelection) => void;
    setShopOpen: (open: boolean) => void;
    setMembersOpen: (open: boolean) => void;
    rememberFarm: (f: RecentFarm) => void;
    removeRecent: (code: string) => void;
    setPendingJoinCode: (code: string | null) => void;
    reset: () => void;
}

let toastSeq = 1;

export const useRfsStore = create<RfsState>((set, get) => ({
    welcome: null,
    crops: [],
    tools: null,
    cropById: {},
    ownFarmCode: '',

    farm: null,
    stats: null,
    members: null,
    presence: [],
    chat: [],

    connection: 'idle',
    screen: 'menu',
    selection: { kind: 'tool', tool: 'hoe' },
    toasts: [],
    recents: loadRecents(),
    pendingJoinCode: null,
    shopOpen: false,
    membersOpen: false,

    setConnection: (connection) => set({ connection }),

    applyWelcome: (w) =>
        set({
            welcome: w,
            crops: w.crops,
            tools: w.tools,
            cropById: Object.fromEntries(w.crops.map((c) => [c.id, c])),
            ownFarmCode: w.ownFarmCode,
        }),

    applyFarmState: (f) => set({ farm: f }),

    applyTileDeltas: (deltas) =>
        set((state) => {
            if (!state.farm) return {};
            const tiles = state.farm.tiles.slice();
            for (const d of deltas) {
                if (d.i >= 0 && d.i < tiles.length) tiles[d.i] = { t: d.t, c: d.c };
            }
            return { farm: { ...state.farm, tiles } };
        }),

    applyStats: (stats) => set({ stats }),
    applyMembers: (members) => set({ members }),
    applyPresence: (presence) => set({ presence }),

    addChat: (m) => set((s) => ({ chat: [...s.chat.slice(-49), m] })),

    pushToast: (message, kind = 'info') => {
        const id = toastSeq++;
        set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
        if (typeof window !== 'undefined') {
            window.setTimeout(() => get().dismissToast(id), 3500);
        }
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    setScreen: (screen) => set({ screen }),
    setSelection: (selection) => set({ selection }),
    setShopOpen: (shopOpen) => set({ shopOpen }),
    setMembersOpen: (membersOpen) => set({ membersOpen }),

    rememberFarm: (f) =>
        set((s) => {
            const next = [f, ...s.recents.filter((r) => r.code !== f.code)].slice(0, 20);
            saveRecents(next);
            return { recents: next };
        }),
    removeRecent: (code) =>
        set((s) => {
            const next = s.recents.filter((r) => r.code !== code);
            saveRecents(next);
            return { recents: next };
        }),

    setPendingJoinCode: (pendingJoinCode) => set({ pendingJoinCode }),

    reset: () =>
        set({
            farm: null,
            stats: null,
            members: null,
            presence: [],
            chat: [],
            screen: 'menu',
            shopOpen: false,
            membersOpen: false,
        }),
}));
