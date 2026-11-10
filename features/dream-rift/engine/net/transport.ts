/**
 * Transport abstraction for the GameSession.
 *
 * Singleplayer uses LocalTransport (the local client is the host and the only
 * player; nothing goes over the wire). Multiplayer uses SocketTransport, which
 * relays realtime messages through the socket server. The session code is
 * identical either way — only authority flags and the send path differ.
 */

import type { RelayMsg } from './events';
import { sendRelay, setRelayHandler } from './connection';

export interface Transport {
    readonly isHost: boolean;
    readonly localSlot: number;
    send(msg: RelayMsg): void;
    start(onMessage: (msg: RelayMsg) => void): void;
    stop(): void;
}

export class LocalTransport implements Transport {
    readonly isHost = true;
    readonly localSlot = 0;
    send(): void {
        /* no peers */
    }
    start(): void {
        /* nothing arrives */
    }
    stop(): void {
        /* noop */
    }
}

export class SocketTransport implements Transport {
    constructor(
        readonly isHost: boolean,
        readonly localSlot: number,
    ) {}

    send(msg: RelayMsg): void {
        sendRelay(msg);
    }
    start(onMessage: (msg: RelayMsg) => void): void {
        setRelayHandler(onMessage);
    }
    stop(): void {
        setRelayHandler(null);
    }
}
