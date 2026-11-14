import type { LocalCommand } from '../store';
import {
  TICK_MS,
  stepWorld,
  type Command,
  type RejectReason,
  type World,
  type WorldEvent,
} from '../world';
import { HostSession } from './host';
import {
  MAX_HOST_MESSAGE_BYTES,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  RATE_LIMITED,
  decodeFrame,
  encodeJson,
  hostMessageSchema,
  type HostMessage,
  type Link,
  type TickCommand,
} from './protocol';

interface Pending {
  seq: number;
  cmd: LocalCommand;
  /** When it was (last) sent, for the expiry below. */
  sentAt: number;
}

const clone =
  (
    w: World,
  ): World =>
    structuredClone(
      w,
    );

/** Unacknowledged commands a peer will hold. Past this the host is not answering: refuse new ones instead of piling up. */
export const MAX_PENDING = 256;
/**
 * A command the host neither applied nor refused (it was dropped on the way, or lost across a migration) stops
 * being predicted after this long, so a lost command cannot leave a ghost on the peer's screen for good.
 */
export const PENDING_TTL_MS = 8_000;
/** A peer waiting for a snapshot asks again after this long. */
export const RESYNC_RETRY_MS = 4_000;
/** Refusal events held for the UI (it drains them every frame). */
const MAX_EVENTS = 64;

export interface PeerOptions {
  /** Monotonic ms. Default: `performance.now()`. */
  now?: () => number;
}

/**
 * The other side of a host. It keeps a CONFIRMED replica (advanced only by the host's ordered ticks, so it is
 * always a true past state of the host's world) and a VIEW (the replica plus this peer's not-yet-acknowledged
 * commands replayed on top, so its own actions show instantly — client-side prediction). When the host
 * acknowledges a command the replica catches up and the prediction is dropped; if the host refused it, the host
 * says so (`reject`) and the refusal surfaces as a `rejected` world event the UI toasts like a single-player one.
 * If this peer is the named successor and the host vanishes, `promote()` turns its replica into the new host.
 *
 * Everything the host sends is validated against `hostMessageSchema` first.
 */
export class PeerSession {
  readonly myId: string;
  private link: Link;
  private confirmed: World | null =
    null;
  private _view: World | null =
    null;
  private pending: Pending[] =
    [];
  private nextSeq = 0;
  private acks: Record<
    string,
    number
  > =
    {};
  private awaitingSnapshot = true;
  private lastResyncAt = 0;
  private events: WorldEvent[] =
    [];
  private readonly now: () => number;
  /** Who the host says takes over if it leaves. */
  successor:
    | string
    | null =
    null;
  /** True once the link to the host has closed. */
  hostLost = false;
  /** The host speaks a protocol version this build does not understand (it closed the link). */
  incompatible = false;
  onChange:
    | (() => void)
    | null =
    null;
  readonly stats =
    {
      resyncs: 0,
      protocolErrors: 0,
      rejected: 0,
      rateLimited: 0,
      expired: 0,
      dropped: 0,
    };

  constructor(
    myId: string,
    link: Link,
    opts: PeerOptions = {},
  ) {
    this.myId =
      myId;
    this.link =
      link;
    this.now =
      opts.now ??
      (() =>
        typeof performance !==
        'undefined'
          ? performance.now()
          : Date.now());
    this.lastResyncAt =
      this.now();
    this.attach(
      link,
    );
  }

  private attach(
    link: Link,
  ) {
    this.link =
      link;
    link.onmessage =
      (
        data,
      ) =>
        this.receive(
          data,
        );
    link.onclose =
      () => {
        if (
          this
            .link ===
          link
        )
          this.hostLost = true;
      };
  }

  /** The world to draw: what the host has confirmed, plus this peer's own pending commands. */
  get view(): World | null {
    return this
      ._view;
  }

  get ready(): boolean {
    return (
      this
        .confirmed !==
        null &&
      !this
        .awaitingSnapshot
    );
  }

  get pendingCount(): number {
    return this
      .pending
      .length;
  }

  /** Issue a command: shown immediately here, ordered by the host. False when it was refused locally (too many unanswered). */
  send(
    cmd: LocalCommand,
  ): boolean {
    if (
      cmd.type ===
      'join'
    )
      return false;
    if (
      this
        .pending
        .length >=
      MAX_PENDING
    ) {
      this
        .stats
        .dropped++;
      return false;
    }
    const item: Pending =
      {
        seq: this
          .nextSeq++,
        cmd,
        sentAt:
          this.now(),
      };
    this.pending.push(
      item,
    );
    if (
      this
        .link
        .open
    )
      this.link.send(
        encodeJson(
          {
            t: 'cmd',
            seq: item.seq,
            cmd,
          },
        ),
      );
    this.rebuildView();
    this.onChange?.();
    return true;
  }

  /** `rejected` events the host sent for this peer's commands since the last call (oldest first). */
  drainEvents(): WorldEvent[] {
    if (
      this
        .events
        .length ===
      0
    )
      return this
        .events;
    const out =
      this
        .events;
    this.events =
      [];
    return out;
  }

  /** Housekeeping, a few times a second: expire commands the host never answered, retry a lost resync. */
  update(): void {
    const now =
      this.now();
    const before =
      this
        .pending
        .length;
    if (
      before >
      0
    ) {
      this.pending =
        this.pending.filter(
          (
            p,
          ) =>
            now -
              p.sentAt <
            PENDING_TTL_MS,
        );
      if (
        this
          .pending
          .length !==
        before
      ) {
        this.stats.expired +=
          before -
          this
            .pending
            .length;
        this.rebuildView();
        this.onChange?.();
      }
    }
    if (
      this
        .awaitingSnapshot &&
      this
        .link
        .open &&
      now -
        this
          .lastResyncAt >=
        RESYNC_RETRY_MS
    ) {
      this.lastResyncAt =
        now;
      this
        .stats
        .resyncs++;
      this.link.send(
        encodeJson(
          {
            t: 'resync',
          },
        ),
      );
    }
  }

  private rebuildView() {
    if (
      !this
        .confirmed
    )
      return;
    const v =
      clone(
        this
          .confirmed,
      );
    for (const p of this
      .pending)
      stepWorld(
        v,
        0,
        [
          {
            ...p.cmd,
            playerId:
              this
                .myId,
          } as Command,
        ],
      );
    this._view =
      v;
  }

  private receive(
    data: Uint8Array,
  ) {
    const frame =
      decodeFrame(
        data,
        {
          maxJsonBytes:
            MAX_HOST_MESSAGE_BYTES,
        },
      );
    if (
      frame.kind ===
      'snapshot'
    ) {
      this.confirmed =
        frame.world;
      this.acks =
        frame.acks;
      this.awaitingSnapshot = false;
      this.dropAcked();
      this.rebuildView();
      this.onChange?.();
      return;
    }
    if (
      frame.kind !==
      'json'
    ) {
      this
        .stats
        .protocolErrors++;
      return;
    }
    const parsed =
      hostMessageSchema.safeParse(
        frame.value,
      );
    if (
      !parsed.success
    ) {
      this
        .stats
        .protocolErrors++;
      return;
    }
    const msg: HostMessage =
      parsed.data as HostMessage;
    if (
      msg.t ===
      'welcome'
    ) {
      if (
        msg.v >
          PROTOCOL_VERSION ||
        msg.v <
          MIN_PROTOCOL_VERSION
      ) {
        this.incompatible = true;
        this.link.close();
        return;
      }
      this.successor =
        msg.successor;
    } else if (
      msg.t ===
      'successor'
    ) {
      this.successor =
        msg.id;
    } else if (
      msg.t ===
      'tick'
    ) {
      this.applyTick(
        msg,
      );
    } else if (
      msg.t ===
      'reject'
    ) {
      this.applyRejects(
        msg.items,
      );
    }
  }

  private applyRejects(
    items: [
      number,
      string,
    ][],
  ) {
    let changed = false;
    for (const [
      seq,
      reason,
    ] of items) {
      const at =
        this.pending.findIndex(
          (
            p,
          ) =>
            p.seq ===
            seq,
        );
      if (
        at <
        0
      )
        continue; // already acked or expired: nothing on screen to take back
      const [
        gone,
      ] =
        this.pending.splice(
          at,
          1,
        );
      changed = true;
      if (
        reason ===
        RATE_LIMITED
      ) {
        this
          .stats
          .rateLimited++;
        continue; // the host dropped it for rate: not something to tell the player about
      }
      this
        .stats
        .rejected++;
      if (
        this
          .events
          .length <
        MAX_EVENTS
      ) {
        this.events.push(
          {
            type: 'rejected',
            command:
              gone
                .cmd
                .type,
            playerId:
              this
                .myId,
            reason:
              reason as RejectReason,
          },
        );
      }
    }
    if (
      changed
    ) {
      this.rebuildView();
      this.onChange?.();
    }
  }

  private applyTick(
    msg: Extract<
      HostMessage,
      {
        t: 'tick';
      }
    >,
  ) {
    const w =
      this
        .confirmed;
    if (
      !w ||
      this
        .awaitingSnapshot
    )
      return; // ticks before the snapshot are not for us
    if (
      msg.n <=
      w.tick
    )
      return; // a duplicate
    if (
      msg.n !==
      w.tick +
        1
    ) {
      // We missed one: our replica is no longer a true past state. Ask for a fresh one and wait.
      this.awaitingSnapshot = true;
      this
        .stats
        .resyncs++;
      this.lastResyncAt =
        this.now();
      if (
        this
          .link
          .open
      )
        this.link.send(
          encodeJson(
            {
              t: 'resync',
            },
          ),
        );
      return;
    }
    const cmds =
      msg.cmds.map(
        (
          c: TickCommand,
        ) =>
          ({
            ...c.cmd,
            playerId:
              c.p,
          }) as Command,
      );
    try {
      stepWorld(
        w,
        TICK_MS,
        cmds,
      );
    } catch {
      // A host sent something the sim cannot apply: our replica may be half-stepped. Start over from a snapshot.
      this
        .stats
        .protocolErrors++;
      this.awaitingSnapshot = true;
      this.lastResyncAt =
        this.now();
      if (
        this
          .link
          .open
      )
        this.link.send(
          encodeJson(
            {
              t: 'resync',
            },
          ),
        );
      return;
    }
    this.acks =
      {
        ...this
          .acks,
        ...msg.acks,
      };
    this.dropAcked();
    this.rebuildView();
    this.onChange?.();
  }

  private dropAcked() {
    const acked =
      this
        .acks[
        this
          .myId
      ] ??
      -1;
    this.pending =
      this.pending.filter(
        (
          p,
        ) =>
          p.seq >
          acked,
      );
  }

  /** The host is gone and a new one is reachable: talk to it instead, and replay what it has not seen. */
  rebind(
    link: Link,
  ): void {
    this.hostLost = false;
    this.awaitingSnapshot = true;
    this.lastResyncAt =
      this.now();
    this.attach(
      link,
    );
    const now =
      this.now();
    for (const p of this
      .pending) {
      p.sentAt =
        now;
      if (
        link.open
      )
        link.send(
          encodeJson(
            {
              t: 'cmd',
              seq: p.seq,
              cmd: p.cmd,
            },
          ),
        );
    }
  }

  /**
   * Become the host, from our replica. Everything the old host had confirmed to us survives; the acks we know
   * carry over, so a peer re-sending a command the old host already applied is not applied twice.
   */
  promote(): HostSession {
    if (
      !this
        .confirmed
    )
      throw new Error(
        'no replica to promote',
      );
    this.link.onmessage =
      null;
    this.link.onclose =
      null;
    const host =
      new HostSession(
        clone(
          this
            .confirmed,
        ),
        this
          .myId,
        this
          .acks,
      );
    // Commands this player issued that the old host never confirmed to us are not in the replica: issue them
    // again on the new timeline (the other peers replay theirs to us on rebind).
    for (const p of this
      .pending)
      host.submit(
        p.cmd,
      );
    return host;
  }
}
