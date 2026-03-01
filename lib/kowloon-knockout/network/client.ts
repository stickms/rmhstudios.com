// ============================================================
// Network Client — Browser WebSocket wrapper
// ============================================================

import type { FighterClass, GameState } from '@/lib/kowloon-knockout/game/fighters/types';
import type { RemoteInputState, ServerMessage } from './types';

type MessageHandler = (msg: ServerMessage) => void;

const DEFAULT_URL = process.env.NEXT_PUBLIC_KOWLOON_WS_URL || 'ws://localhost:8080';

class NetworkClient {
    private ws: WebSocket | null = null;
    private handlers = new Map<string, MessageHandler[]>();

    connect(url: string = DEFAULT_URL): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

            this.ws.onmessage = (event) => {
                let msg: ServerMessage;
                try {
                    msg = JSON.parse(event.data as string);
                } catch {
                    return;
                }
                const typeHandlers = this.handlers.get(msg.type);
                if (typeHandlers) {
                    for (const handler of typeHandlers) {
                        handler(msg);
                    }
                }
            };

            this.ws.onclose = () => {
                const handlers = this.handlers.get('opponent_disconnected');
                if (handlers) {
                    for (const handler of handlers) {
                        handler({ type: 'opponent_disconnected' });
                    }
                }
            };
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.send({ type: 'leave' });
            this.ws.close();
            this.ws = null;
        }
    }

    private send(msg: object): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
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
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    createRoom(fighterClass: FighterClass): void {
        this.send({ type: 'create_room', fighterClass });
    }

    joinRoom(code: string, fighterClass: FighterClass): void {
        this.send({ type: 'join_room', code, fighterClass });
    }

    sendInput(input: RemoteInputState): void {
        this.send({ type: 'input', data: input });
    }

    sendGameState(state: GameState): void {
        this.send({ type: 'game_state', data: state });
    }
}

export const networkClient = new NetworkClient();
