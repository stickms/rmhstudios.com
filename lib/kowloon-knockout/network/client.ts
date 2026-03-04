// ============================================================
// Network Client — Socket.io wrapper for Kowloon Knockout
// ============================================================

import { io, Socket } from 'socket.io-client';
import type { FighterClass, GameState } from '@/lib/kowloon-knockout/game/fighters/types';
import type { RemoteInputState, ServerMessage } from './types';

const DEFAULT_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:7001/';
const SOCKET_PATH = '/socket/';

type MessageHandler = (msg: ServerMessage) => void;

class NetworkClient {
    private socket: Socket | null = null;
    private handlers = new Map<string, MessageHandler[]>();

    connect(url: string = DEFAULT_URL): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket?.connected) {
                resolve();
                return;
            }

            this.socket = io(url, {
                path: SOCKET_PATH,
                reconnection: false,
                timeout: 10000,
            });

            this.socket.on('connect', () => resolve());
            this.socket.on('connect_error', () => reject(new Error('Socket.io connection failed')));

            // Wire Socket.io events to internal handler system
            this.socket.on('kk:room_created', (data) => {
                this.dispatch({ type: 'room_created', code: data.code });
            });

            this.socket.on('kk:room_joined', (data) => {
                this.dispatch({
                    type: 'room_joined',
                    hostClass: data.hostClass,
                    guestClass: data.guestClass,
                    isHost: data.isHost,
                });
            });

            this.socket.on('kk:input', (data) => {
                this.dispatch({ type: 'input', data });
            });

            this.socket.on('kk:game_state', (data) => {
                this.dispatch({ type: 'game_state', data });
            });

            this.socket.on('kk:opponent_ready', () => {
                this.dispatch({ type: 'opponent_ready' });
            });

            this.socket.on('kk:opponent_disconnected', () => {
                this.dispatch({ type: 'opponent_disconnected' });
            });

            this.socket.on('kk:error', (data) => {
                this.dispatch({ type: 'error', message: data.message });
            });

            this.socket.on('disconnect', () => {
                this.dispatch({ type: 'opponent_disconnected' });
            });
        });
    }

    private dispatch(msg: ServerMessage): void {
        const typeHandlers = this.handlers.get(msg.type);
        if (typeHandlers) {
            for (const handler of typeHandlers) {
                handler(msg);
            }
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.emit('kk:leave');
            this.socket.disconnect();
            this.socket = null;
        }
    }

    on(type: string, handler: MessageHandler): void {
        const existing = this.handlers.get(type) || [];
        existing.push(handler);
        this.handlers.set(type, existing);
    }

    off(type: string, handler: MessageHandler): void {
        const existing = this.handlers.get(type);
        if (existing) {
            this.handlers.set(type, existing.filter(h => h !== handler));
        }
    }

    clearHandlers(): void {
        this.handlers.clear();
    }

    get connected(): boolean {
        return this.socket !== null && this.socket.connected;
    }

    createRoom(fighterClass: FighterClass): void {
        this.socket?.emit('kk:create_room', { fighterClass });
    }

    joinRoom(code: string, fighterClass: FighterClass): void {
        this.socket?.emit('kk:join_room', { code, fighterClass });
    }

    fighterReady(fighterClass: FighterClass): void {
        this.socket?.emit('kk:fighter_ready', { fighterClass });
    }

    sendInput(input: RemoteInputState): void {
        this.socket?.emit('kk:input', input);
    }

    sendGameState(state: GameState): void {
        this.socket?.emit('kk:game_state', state);
    }
}

export const networkClient = new NetworkClient();
