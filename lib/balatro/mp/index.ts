/**
 * Balatro multiplayer — the session runtime's lazy entry (WS5).
 *
 * WS3's pack loader (pack-loader.ts) imports this module through
 * `import.meta.glob('./index.ts')` once the MP pack is mounted and calls
 * `startMultiplayer({ bridge, session, intent, invite })`. Everything here is
 * the browser wiring of the runtime in lobby/runtime.ts: the games-hub client,
 * WebRTC, IndexedDB and localStorage, the engine's filesystem and the
 * platform CSPRNG. The runtime itself is browser-free and tested in Node.
 *
 * Version gating (D-36): the content hash is the core and MP pack digests
 * plus the protocol version; the hub refuses a mismatched join and the host
 * refuses a mismatched `hello`.
 *
 * Test builds (`VITE_BALATRO_MP_TEST=1` only — production drops both): the
 * autopilot surface (test-hooks.ts, WS14), and P2P/hash
 * overrides read from `window.__rmhBalatroTest` (`p2p` hooks: blockCandidates
 * forces the relay; `contentHash` fakes a mismatching build, E2E-21).
 */

import pack from '../game-pack.json';
import { MP_PROTOCOL_VERSION, BALATRO_LIMITS } from '../net/limits';
import type { P2pTestHooks } from '../../shared/p2p';
import type { MpSession, StartMultiplayerOptions } from './pack-loader';
import { createHubClient } from './hub-client';
import { webrtcConnector } from './transport/connector';
import { realScheduler, type FsLike } from './transport/types';
import { localKv } from './history';
import { idbSnapshotStore } from './rejoin/rejoin-store';
import { cryptoSeed, cryptoSeedString } from './rng';
import { MpRuntime } from './lobby/runtime';

export type { MpSession, StartMultiplayerOptions } from './pack-loader';

interface MpTestOverrides {
  p2p?: P2pTestHooks;
  contentHash?: string;
}

const TEST_BUILD = import.meta.env.VITE_BALATRO_MP_TEST === '1';

/** D-36: `<core sha12><mp sha12>-v<protocol>`. */
export function contentHash(): string {
  const p = pack as { core: { sha256: string }; mp?: { sha256: string } };
  const core = p.core.sha256.slice(0, 12);
  const mp = (p.mp?.sha256 ?? '0'.repeat(12)).slice(0, 12);
  return `${core}${mp}-v${MP_PROTOCOL_VERSION}`;
}

function testOverrides(): MpTestOverrides {
  if (!TEST_BUILD) return {};
  return ((globalThis as { __rmhBalatroTest?: MpTestOverrides }).__rmhBalatroTest ?? {}) as MpTestOverrides;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (const b of bytes) s += abc[b % abc.length];
  return s;
}

export function startMultiplayer(opts: StartMultiplayerOptions): MpSession {
  const { bridge, session, intent, invite } = opts;
  const overrides = testOverrides();
  const log = (msg: string, isError = false) => {
    // Routine lines stay quiet; test builds log them as warnings so Playwright's console capture keeps them.
    if (isError || TEST_BUILD) console.warn(msg);
  };
  const hash =
    overrides.contentHash && BALATRO_LIMITS.CONTENT_HASH_RE.test(overrides.contentHash) ? overrides.contentHash : contentHash();
  const hub = createHubClient((m) => log(m, true));
  const runtime = new MpRuntime(
    {
      bridge,
      hub,
      connector: webrtcConnector(overrides.p2p),
      sched: realScheduler(),
      fs: session.fs as unknown as FsLike,
      kv: localKv(),
      snapshots: idbSnapshotStore(),
      contentHash: hash,
      testBuild: TEST_BUILD,
      randomId,
      randomSeed: cryptoSeedString,
      randomInt: cryptoSeed,
      log,
    },
    { intent, invite },
  );

  let uninstall: (() => void) | null = null;
  let stopped = false;
  if (import.meta.env.VITE_BALATRO_MP_TEST === '1') {
    void import('./test-hooks').then((m) => {
      if (stopped) return;
      const api = m.installTestHooks({ bridge, fs: session.fs, state: () => runtime.snapshot() });
      uninstall = api ? () => api.uninstall() : null;
    });
  }

  return {
    stop() {
      stopped = true;
      runtime.stop();
      hub.destroy();
      uninstall?.();
    },
    join: (code) => runtime.join(code),
    setHidden: (hidden) => runtime.setHidden(hidden),
  };
}
