/**
 * TEST SUPPORT ONLY — an end-to-end Hearthworks multiplayer rig: the REAL hub handler
 * (features/hearthworks/server/p2p.ts) on the fake socket.io world, the REAL browser-side connector
 * (features/hearthworks/engine/net/connector.ts) per player, and in-memory DataChannels on a fake clock where WebRTC would
 * be. Nothing here is a model of the hub or the connector — only of the network between them:
 *
 *   - `HubAdapter` implements the connector's `HubLike` over a fake socket: `emit` calls the hub's handler,
 *     and what the hub sent back is parsed with the shared S2C schemas and delivered (so a contract mismatch
 *     between the two sides fails here).
 *   - `FakePeers` is the `PeerConnector`: a host attempt "offers", the member's attempt "answers" through the
 *     hub's signalling, then both get a negotiated `fakeConnection` (two channels with latency). `blockDirect`
 *     makes every attempt time out like a symmetric NAT does, which sends both sides to the hub relay.
 *   - `await Rig.advance(ms)` moves time forward in 10 ms steps: hub timers (vitest fake timers), the fake
 *     network and clock, each player's frame loop (`store.advance`), microtasks and the hub-to-client delivery.
 *
 * Real WebRTC (ICE, STUN/TURN, SCTP) is NOT exercised: that needs two real browsers.
 */

import { vi } from 'vitest';
import {
  createHearthworksStore,
  type HearthworksStore,
} from '@features/hearthworks/engine/store';
import { createWorld } from '@features/hearthworks/engine/world';
import { bindConnectorToStore } from '@features/hearthworks/engine/net/driver';
import {
  HearthworksConnector,
  type HubLike,
  type HubStatus,
} from '@features/hearthworks/engine/net/connector';
import {
  HW_S2C_EVENTS,
  parseS2C,
  type HwS2CEvent,
  type HwS2CPayload,
} from '@features/hearthworks/engine/net/events';
import type {
  PeerAttempt,
  PeerConnectOptions,
  PeerConnector,
  PeerSignalIn,
  Scheduler,
} from '@/lib/shared/p2p/connector';
import {
  FakeNet,
  fakeConnection,
  type PathConfig,
} from '@/lib/shared/p2p/fake-channel.test-support';
import type { ChannelPair } from '@/lib/shared/p2p/channel';
import {
  handleHearthworksP2pDisconnect,
  registerHearthworksP2pHandlers,
} from '../p2p';
import {
  makeWorld,
  type FakeSocket,
} from '../../../../server/socket-server/test-support/fake-world';

/* ─── Clock ──────────────────────────────────────────────────────────────── */

export function fakeScheduler(
  net: FakeNet,
): Scheduler {
  return {
    now: () =>
      net.now,
    mono: () =>
      net.now,
    after(
      ms,
      fn,
    ) {
      let live = true;
      net.at(
        net.now +
          ms,
        () =>
          live &&
          fn(),
      );
      return () => {
        live = false;
      };
    },
    every(
      ms,
      fn,
    ) {
      let live = true;
      const arm =
        () =>
          net.at(
            net.now +
              ms,
            () => {
              if (
                !live
              )
                return;
              fn();
              arm();
            },
          );
      arm();
      return () => {
        live = false;
      };
    },
  };
}

/* ─── The peer network ───────────────────────────────────────────────────── */

interface Conn {
  hostLabel: string;
  memberLabel: string;
  host: ChannelPair;
  member: ChannelPair;
}

/** The `PeerConnector` for every player in a rig: attempts rendezvous through the SDP they exchange via the hub. */
export class FakePeers {
  /** Every attempt fails like a symmetric NAT (after the direct timeout) while this is true. */
  blockDirect = false;
  readonly connections: Conn[] =
    [];
  private nextId = 1;
  private readonly offers =
    new Map<
      string,
      {
        opts: PeerConnectOptions;
        label: string;
        closed: boolean;
      }
    >();
  private readonly answers =
    new Map<
      string,
      {
        opts: PeerConnectOptions;
        label: string;
        closed: boolean;
      }
    >();

  constructor(
    private readonly net: FakeNet,
    private readonly path: PathConfig = {
      latencyMs: 10,
    },
  ) {}

  connectorFor(
    label: string,
  ): PeerConnector {
    return {
      connect:
        (
          opts,
        ) =>
          this.connect(
            label,
            opts,
          ),
    };
  }

  /** The network under `label` goes away (a closed tab): every channel it has drops at once. */
  kill(
    label: string,
  ): void {
    for (const c of this
      .connections) {
      if (
        c.hostLabel !==
          label &&
        c.memberLabel !==
          label
      )
        continue;
      for (const ch of [
        c
          .host
          .unreliable,
        c
          .host
          .reliable,
        c
          .member
          .unreliable,
        c
          .member
          .reliable,
      ])
        (
          ch as unknown as {
            kill(): void;
          }
        ).kill();
    }
  }

  private connect(
    label: string,
    opts: PeerConnectOptions,
  ): PeerAttempt {
    const mine =
      {
        opts,
        label,
        closed: false,
      };
    if (
      opts.role ===
      'host'
    ) {
      const id = `a${this.nextId++}`;
      this.offers.set(
        id,
        mine,
      );
      this.net.at(
        this
          .net
          .now +
          5,
        () => {
          if (
            !mine.closed
          )
            opts.signal(
              {
                description:
                  {
                    type: 'offer',
                    sdp: `v=0 id=${id}`,
                  },
              },
            );
        },
      );
      if (
        this
          .blockDirect
      )
        this.net.at(
          this
            .net
            .now +
            8_000,
          () =>
            !mine.closed &&
            opts.onFailed(
              'timeout',
            ),
        );
      return {
        handle:
          (
            s: PeerSignalIn,
          ) => {
            if (
              mine.closed ||
              s
                .description
                ?.type !==
                'answer'
            )
              return;
            const answer =
              this.answers.get(
                /id=(\w+)/.exec(
                  s
                    .description
                    .sdp,
                )?.[1] ??
                  '',
              );
            if (
              !answer ||
              answer.closed ||
              this
                .blockDirect
            )
              return;
            const conn =
              fakeConnection(
                this
                  .net,
                this
                  .path,
                40,
              );
            this.connections.push(
              {
                hostLabel:
                  label,
                memberLabel:
                  answer.label,
                host: conn.host,
                member:
                  conn.member,
              },
            );
            // Both ends hear of the channels once they are open (DirectConnection does the same).
            this.net.at(
              this
                .net
                .now +
                45,
              () => {
                if (
                  !mine.closed
                )
                  opts.onChannels(
                    conn.host,
                    'direct',
                  );
                if (
                  !answer.closed
                )
                  answer.opts.onChannels(
                    conn.member,
                    'direct',
                  );
              },
            );
          },
        close:
          () => {
            mine.closed = true;
          },
      };
    }
    if (
      this
        .blockDirect
    )
      this.net.at(
        this
          .net
          .now +
          8_000,
        () =>
          !mine.closed &&
          opts.onFailed(
            'timeout',
          ),
      );
    return {
      handle:
        (
          s: PeerSignalIn,
        ) => {
          if (
            mine.closed ||
            s
              .description
              ?.type !==
              'offer'
          )
            return;
          const id =
            /id=(\w+)/.exec(
              s
                .description
                .sdp,
            )?.[1] ??
            '';
          this.answers.set(
            id,
            mine,
          );
          this.net.at(
            this
              .net
              .now +
              5,
            () =>
              !mine.closed &&
              opts.signal(
                {
                  description:
                    {
                      type: 'answer',
                      sdp: s
                        .description!
                        .sdp,
                    },
                },
              ),
          );
        },
      close:
        () => {
          mine.closed = true;
        },
    };
  }
}

/* ─── The hub, from a browser's side ─────────────────────────────────────── */

export class HubAdapter implements HubLike {
  status: HubStatus =
    'connected';
  private readonly listeners =
    new Map<
      string,
      Set<
        (
          d: unknown,
        ) => void
      >
    >();
  private readonly statusListeners =
    new Set<
      (
        s: HubStatus,
        info: {
          reconnect: boolean;
        },
      ) => void
    >();
  cursor = 0;
  /** Every event this client sent, for assertions on what crosses the hub. */
  readonly sent: {
    event: string;
    data: unknown;
  }[] =
    [];
  dropped = 0;

  constructor(
    private readonly rig: Rig,
    public socket: FakeSocket,
  ) {}

  emit(
    event: string,
    data: unknown,
  ): void {
    this.sent.push(
      {
        event,
        data,
      },
    );
    if (
      this
        .status !==
      'connected'
    )
      return;
    this.rig.world.send(
      this
        .socket,
      event,
      data,
    );
    this.rig.flush();
  }

  on<
    K extends
      HwS2CEvent,
  >(
    event: K,
    fn: (
      d: HwS2CPayload<K>,
    ) => void,
  ): () => void {
    let set =
      this.listeners.get(
        event,
      );
    if (
      !set
    )
      this.listeners.set(
        event,
        (set =
          new Set()),
      );
    set.add(
      fn as (
        d: unknown,
      ) => void,
    );
    return () =>
      void set.delete(
        fn as (
          d: unknown,
        ) => void,
      );
  }

  onStatus(
    fn: (
      s: HubStatus,
      info: {
        reconnect: boolean;
      },
    ) => void,
  ): () => void {
    this.statusListeners.add(
      fn,
    );
    return () =>
      void this.statusListeners.delete(
        fn,
      );
  }

  async account() {
    const d =
      this
        .socket
        .data as {
        userId?: string;
        userName?: string;
      };
    return d.userId
      ? {
          id: d.userId,
          name:
            d.userName ??
            'Player',
        }
      : null;
  }

  destroy(): void {}

  /** Deliver what the hub sent since last time; true when something arrived. */
  deliver(): boolean {
    let any = false;
    while (
      this
        .cursor <
      this
        .socket
        .received
        .length
    ) {
      const r =
        this
          .socket
          .received[
          this
            .cursor++
        ];
      if (
        !(
          Object.values(
            HW_S2C_EVENTS,
          ) as string[]
        ).includes(
          r.event,
        )
      )
        continue;
      any = true;
      const parsed =
        parseS2C(
          r.event as HwS2CEvent,
          r.payload,
        );
      if (
        parsed ===
        null
      ) {
        this
          .dropped++;
        continue;
      }
      for (const fn of [
        ...(this.listeners.get(
          r.event,
        ) ??
          []),
      ])
        fn(
          parsed,
        );
    }
    return any;
  }

  setStatus(
    s: HubStatus,
    reconnect = false,
  ): void {
    this.status =
      s;
    for (const fn of [
      ...this
        .statusListeners,
    ])
      fn(
        s,
        {
          reconnect,
        },
      );
  }
}

/* ─── A player ───────────────────────────────────────────────────────────── */

export interface Player {
  label: string;
  socket: FakeSocket;
  hub: HubAdapter;
  connector: HearthworksConnector;
  store: HearthworksStore;
  /** Close the tab: the hub socket and every channel go at once, with no goodbye (use connector.leave() for one). */
  close(): void;
  closed: boolean;
}

let socketCounter = 0;

export class Rig {
  readonly net =
    new FakeNet();
  readonly world =
    makeWorld(
      registerHearthworksP2pHandlers,
    );
  readonly peers: FakePeers;
  readonly sched: Scheduler;
  readonly players: Player[] =
    [];
  private flushing = false;

  constructor(
    path?: PathConfig,
  ) {
    this.peers =
      new FakePeers(
        this
          .net,
        path,
      );
    this.sched =
      fakeScheduler(
        this
          .net,
      );
  }

  /** A signed-in player (or an anonymous one with `userId: null`). */
  addPlayer(
    label: string,
    userId:
      | string
      | null = label,
    userName = label,
  ): Player {
    const socket =
      this.world.connect(
        `sock-${++socketCounter}-${label}`,
        userId
          ? {
              userId,
              userName,
            }
          : {},
      );
    const hub =
      new HubAdapter(
        this,
        socket,
      );
    const connector =
      new HearthworksConnector(
        {
          hub,
          peers:
            this.peers.connectorFor(
              label,
            ),
          sched:
            this
              .sched,
        },
      );
    const store =
      createHearthworksStore(
        {
          seed: 7,
          size: 24,
          playerId:
            'local',
        },
      );
    bindConnectorToStore(
      connector,
      store,
    );
    const player: Player =
      {
        label,
        socket,
        hub,
        connector,
        store,
        closed: false,
        close:
          () => {
            if (
              player.closed
            )
              return;
            player.closed = true;
            this.peers.kill(
              label,
            );
            player.hub.status =
              'offline';
            handleHearthworksP2pDisconnect(
              this
                .world
                .io,
              socket as never,
            );
            this.world.disconnect(
              socket,
            );
          },
      };
    this.players.push(
      player,
    );
    return player;
  }

  /**
   * The player's hub connection drops and comes back `downMs` later on a NEW socket (as socket.io does): the hub
   * sees the old socket disconnect, the client sees `connected` with `reconnect`.
   */
  async reconnectHub(
    p: Player,
    downMs: number,
  ): Promise<void> {
    const data =
      {
        ...p
          .socket
          .data,
      };
    handleHearthworksP2pDisconnect(
      this
        .world
        .io,
      p.socket as never,
    );
    this.world.disconnect(
      p.socket,
    );
    p.hub.setStatus(
      'offline',
    );
    await this.advance(
      downMs,
    );
    p.hub.socket =
      this.world.connect(
        `sock-${++socketCounter}-${p.label}`,
        data,
      );
    p.socket =
      p.hub.socket;
    p.hub.cursor = 0;
    p.hub.setStatus(
      'connected',
      true,
    );
    this.flush();
  }

  /** Deliver hub → client events until nothing is left (a handler may emit more). */
  flush(): void {
    if (
      this
        .flushing
    )
      return;
    this.flushing = true;
    try {
      for (
        let guard = 0;
        guard <
        10_000;
        guard++
      ) {
        let any = false;
        for (const p of this
          .players)
          if (
            !p.closed &&
            p.hub.deliver()
          )
            any = true;
        if (
          !any
        )
          return;
      }
      throw new Error(
        'hub delivery never settled',
      );
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Run `ms` of time: hub timers, network, frames and delivery, in 10 ms steps. Async because the links
   * under test (ReliableLink, the channel adapter) open and flush on microtasks, as they do in a browser.
   */
  async advance(
    ms: number,
  ): Promise<void> {
    for (
      let t = 0;
      t <
      ms;
      t += 10
    ) {
      vi.advanceTimersByTime(
        10,
      );
      this.net.advance(
        this
          .net
          .now +
          10,
      );
      for (const p of this
        .players)
        if (
          !p.closed
        )
          p.store
            .getState()
            .advance(
              10,
            );
      this.flush();
      for (
        let i = 0;
        i <
        4;
        i++
      )
        await Promise.resolve();
      this.flush();
    }
  }

  /** Advance until `check` holds (or fail loudly). */
  async until(
    check: () => boolean,
    what: string,
    maxMs = 60_000,
  ): Promise<void> {
    for (
      let t = 0;
      t <
      maxMs;
      t += 10
    ) {
      if (
        check()
      )
        return;
      await this.advance(
        10,
      );
    }
    throw new Error(
      `timed out waiting for ${what}`,
    );
  }
}

export function newWorld(
  seed = 7,
  size = 24,
) {
  return createWorld(
    seed,
    size,
  );
}
