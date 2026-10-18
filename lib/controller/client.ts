/**
 * Phone-as-controller client (E3). Host = the big screen, pad = the phone.
 * Both talk to the `controller:*` events of the existing socket hub.
 */
import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';

export type PadButton = 'up' | 'down' | 'left' | 'right' | 'a' | 'b';

/** What a game offers the controller: Dream Rift's InputManager already has this shape. */
export interface ControllerSink {
  setStick(mx: number, my: number): void;
  setButton(btn: 'shot' | 'bomb', down: boolean): void;
}

function open(
  name: string,
  onConnect: (socket: Socket) => void,
  bind: (socket: Socket) => void,
): RealtimeClient {
  return createRealtimeClient({
    name,
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession().catch(() => null);
      return { token: current?.data?.session?.token };
    },
    onConnect,
    bind,
  });
}

/** Pairing URL a phone opens (scanned from the QR). */
export const padUrl = (origin: string, code: string) => `${origin}/controller/${code}`;

/**
 * Big-screen side: ask for a code, then feed relayed pad events into `sink`.
 * Several phones merge (a direction or button is held if ANY pad holds it).
 */
export function startControllerHost(
  sink: ControllerSink,
  cb: { onCode: (code: string) => void; onPads: (count: number) => void; onError: () => void },
): () => void {
  const held = new Map<number, Set<PadButton>>();
  const apply = () => {
    const any = (b: PadButton) => [...held.values()].some((s) => s.has(b));
    sink.setStick(
      (any('right') ? 1 : 0) - (any('left') ? 1 : 0),
      (any('down') ? 1 : 0) - (any('up') ? 1 : 0),
    );
    sink.setButton('shot', any('a'));
    sink.setButton('bomb', any('b'));
  };
  const client = open(
    'ControllerHost',
    (socket) => socket.emit('controller:host'),
    (socket) => {
      socket.on('controller:hosted', (d: { code: string }) => cb.onCode(d.code));
      socket.on('controller:connected', (d: { slot: number }) => {
        held.set(d.slot, new Set());
        cb.onPads(held.size);
      });
      socket.on('controller:left', (d: { slot: number }) => {
        held.delete(d.slot);
        cb.onPads(held.size);
        apply();
      });
      socket.on('controller:input', (d: { slot: number; b: PadButton; down: boolean }) => {
        const s = held.get(d.slot) ?? new Set<PadButton>();
        if (d.down) s.add(d.b);
        else s.delete(d.b);
        held.set(d.slot, s);
        apply();
      });
      socket.on('controller:error', cb.onError);
    },
  );
  return () => {
    held.clear();
    apply();
    client.destroy();
  };
}

/** Phone side. */
export function startControllerPad(
  code: string,
  cb: { onJoined: (slot: number) => void; onError: (code: string) => void; onClosed: () => void },
): { press: (b: PadButton, down: boolean) => void; stop: () => void } {
  const client = open(
    'ControllerPad',
    (socket) => socket.emit('controller:join', { code }),
    (socket) => {
      socket.on('controller:joined', (d: { slot: number }) => cb.onJoined(d.slot));
      socket.on('controller:error', (d: { code: string }) => cb.onError(d.code));
      socket.on('controller:closed', cb.onClosed);
    },
  );
  return {
    press: (b, down) => void client.emit('controller:input', { b, down }),
    stop: () => {
      client.emit('controller:leave');
      client.destroy();
    },
  };
}
