/**
 * The hub for the real-browser Hearthworks e2e: a small Node socket.io server running the REAL
 * `registerHearthworksP2pHandlers` (server/socket-server/handlers/hearthworks-p2p.ts) on the real generic
 * `SignalHub` — the code that runs in production. The only injected piece is authentication: production reads
 * a Better Auth session out of Postgres (server/socket-server/index.ts, soft auth), here a token table maps a
 * token to an account, and the same `socket.data.userId/userName` fields are set from it.
 *
 * No DB, no TanStack Start server. Mounted at `/socket/` like the production hub.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import {
  handleHearthworksP2pDisconnect,
  registerHearthworksP2pHandlers,
  resetHearthworksP2pForTests,
} from '../../server/socket-server/handlers/hearthworks-p2p';

export interface HubAccount {
  id: string;
  name: string;
}

export interface TestHub {
  url: string;
  port: number;
  /** Accounts the session lookup knows: token → account. */
  accounts: Map<string, HubAccount>;
  addAccount(token: string, account: HubAccount): void;
  io: Server;
  close(): Promise<void>;
}

export interface HubOptions {
  port?: number;
  /** socket.io heartbeat. Production is 25 s / 20 s (server/socket-server/config.ts); the default here is fast. */
  pingIntervalMs?: number;
  pingTimeoutMs?: number;
}

export async function startHub(accounts: Record<string, HubAccount> = {}, opts: HubOptions = {}): Promise<TestHub> {
  const port = opts.port ?? 0;
  process.env.LOG_LEVEL ??= 'silent';
  const table = new Map<string, HubAccount>(Object.entries(accounts));
  const http: HttpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"status":"ok"}');
      return;
    }
    res.writeHead(404).end();
  });
  const io = new Server(http, {
    path: '/socket/',
    cors: { origin: true, credentials: true },
    // Fast liveness: a killed browser's socket is noticed within a couple of seconds in a test.
    pingInterval: opts.pingIntervalMs ?? 2_000,
    pingTimeout: opts.pingTimeoutMs ?? 3_000,
  });

  // The injected session lookup (soft auth, like production: an unknown token is simply anonymous).
  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    const account = typeof token === 'string' ? table.get(token) : undefined;
    if (account) {
      socket.data.userId = account.id;
      socket.data.userName = account.name;
    }
    next();
  });

  const trace = !!process.env.HW_E2E_TRACE;
  const t0 = Date.now();
  io.on('connection', (socket) => {
    if (trace) {
      const who = () => String(socket.data.userId ?? 'anon');
      socket.onAny((ev) => ev !== 'hearthworks:p2p:relay' && ev !== 'hearthworks:p2p:signal' && console.log(`[hub +${Date.now() - t0}] <- ${who()} ${ev}`));
      socket.onAnyOutgoing((ev) => ev !== 'hearthworks:p2p:relay' && ev !== 'hearthworks:p2p:signal' && console.log(`[hub +${Date.now() - t0}] -> ${who()} ${ev}`));
      socket.on('disconnect', (why) => console.log(`[hub +${Date.now() - t0}] x  ${who()} disconnect ${why}`));
    }
    registerHearthworksP2pHandlers(io, socket);
    socket.on('disconnect', () => handleHearthworksP2pDisconnect(io, socket));
  });

  await new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve));
  const actual = (http.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    accounts: table,
    addAccount: (token, account) => void table.set(token, account),
    io,
    async close() {
      resetHearthworksP2pForTests();
      await io.close();
      http.closeAllConnections?.();
    },
  };
}
