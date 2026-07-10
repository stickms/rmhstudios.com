// RMH Farming Simulator — Socket.io client wrapper.
// Connects to the unified realtime server (same one used by every other
// multiplayer game here) and binds incoming events to the zustand store.

'use client';

import { io, Socket } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';
import { authClient } from '@/lib/auth-client';
import { useRfsStore } from './store';
import { C2S, S2C } from './events';
import type {
    FarmState,
    MembersState,
    PresencePlayer,
    Stats,
    TileDelta,
    Welcome,
} from './types';

let socket: Socket | null = null;

export async function connect(): Promise<Socket> {
    if (socket?.connected) return socket;
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }

    const store = useRfsStore.getState();
    store.setConnection('connecting');

    const session = await authClient.getSession();
    const token = session?.data?.session?.token;
    if (!token) {
        store.setConnection('error');
        throw new Error('Not authenticated');
    }

    const serverUrl = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL);
    socket = io(serverUrl, {
        path: '/socket/',
        auth: (cb) => {
            authClient
                .getSession()
                .then((s) => cb({ token: s?.data?.session?.token ?? token }))
                .catch(() => cb({ token }));
        },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
    });

    bind(socket);
    return socket;
}

function bind(s: Socket): void {
    const store = () => useRfsStore.getState();

    s.on('connect', () => {
        store().setConnection('connected');
        s.emit(C2S.HELLO);
    });

    s.on('disconnect', (reason) => {
        if (reason === 'io server disconnect' || reason === 'io client disconnect') {
            store().setConnection('disconnected');
        } else {
            store().setConnection('connecting');
        }
    });

    s.on('connect_error', () => {
        store().setConnection('error');
    });

    s.on(S2C.WELCOME, (w: Welcome) => store().applyWelcome(w));

    s.on(S2C.FARM_STATE, (f: FarmState) => {
        const st = store();
        const wasFarmId = st.farm?.id;
        st.applyFarmState(f);
        // landing in someone else's farm: remember it and jump into the game
        if (st.welcome && f.id !== st.welcome.userId) {
            const host = st.members?.members.find((m) => m.isHost)?.name ?? 'Farmer';
            st.rememberFarm({ code: f.code, name: f.name, host, lastVisited: Date.now() });
            if (st.screen === 'menu') st.setScreen('game');
        }
        // if we just got moved to a different farm while already playing, stay in game
        if (st.screen === 'game' && wasFarmId && wasFarmId !== f.id) st.setScreen('game');
    });

    s.on(S2C.TILES, (deltas: TileDelta[]) => store().applyTileDeltas(deltas));
    s.on(S2C.STATS, (stats: Stats) => store().applyStats(stats));
    s.on(S2C.MEMBERS, (m: MembersState) => store().applyMembers(m));
    s.on(S2C.PRESENCE, (p: PresencePlayer[]) => store().applyPresence(p));
    s.on(S2C.CHAT, (m) => store().addChat(m));

    s.on(S2C.TOAST, (t: { message: string; kind?: 'info' | 'success' | 'error' }) => {
        store().pushToast(t.message, t.kind ?? 'info');
    });

    s.on(S2C.JOIN_REQUESTED, (r: { name: string; farmName: string }) => {
        store().pushToast(`${r.name} wants to join ${r.farmName}.`, 'info');
        store().setMembersOpen(true);
    });

    s.on(S2C.KICKED, (info: { reason: string; farmName?: string }) => {
        if (info?.reason === 'kicked') {
            store().pushToast(
                info.farmName ? `You were removed from ${info.farmName}.` : 'You were removed from the farm.',
                'error',
            );
        }
    });

    s.on(S2C.ERROR, (e: { message?: string }) => {
        if (e?.message) store().pushToast(e.message, 'error');
        if (e?.message?.toLowerCase().includes('sign in')) store().setConnection('error');
    });

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && socket && !socket.connected) {
                socket.connect();
            }
        });
    }
}

export function emit(event: string, data?: unknown): void {
    if (socket?.connected) socket.emit(event, data);
}

export function getSocket(): Socket | null {
    return socket;
}

export function disconnect(): void {
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
    useRfsStore.getState().reset();
}

// ── Typed action helpers ───────────────────────────────────────────
export const actions = {
    move: (x: number, z: number, dir: number) => emit(C2S.MOVE, { x, z, dir }),
    till: (x: number, z: number) => emit(C2S.TILL, { x, z }),
    clear: (x: number, z: number) => emit(C2S.CLEAR, { x, z }),
    plant: (x: number, z: number, cropId: string) => emit(C2S.PLANT, { x, z, cropId }),
    water: (x: number, z: number) => emit(C2S.WATER, { x, z }),
    harvest: (x: number, z: number) => emit(C2S.HARVEST, { x, z }),
    buySeed: (itemId: string, qty: number) => emit(C2S.BUY, { kind: 'seed', itemId, qty }),
    sell: (itemId: string, qty?: number) => emit(C2S.SELL, { itemId, qty }),
    upgradeTool: (tool: string) => emit(C2S.UPGRADE_TOOL, { tool }),
    sleep: () => emit(C2S.SLEEP),
    chat: (text: string) => emit(C2S.CHAT, { text }),
    joinFarm: (code: string) => emit(C2S.JOIN_FARM, { code }),
    approveJoin: (userId: string) => emit(C2S.APPROVE_JOIN, { userId }),
    denyJoin: (userId: string) => emit(C2S.DENY_JOIN, { userId }),
    kick: (userId: string) => emit(C2S.KICK, { userId }),
    leaveFarm: () => emit(C2S.LEAVE_FARM),
    renameFarm: (name: string) => emit(C2S.RENAME_FARM, { name }),
};
