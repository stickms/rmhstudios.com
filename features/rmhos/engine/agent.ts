/**
 * Host side of the guest agent's line protocol (agent-protocol.ts): one command at a time over
 * serial1, each answered by one guest line or an error. Client only; the VM is injected.
 */
import {
  encodeCommand,
  GuestLineParser,
  type GuestEvent,
} from './agent-protocol';
import type { VmHandle } from './vm-types';

/** `code` is the guest's `ERR <code>`, or `timeout`, `protocol` or `busy` (raised here). */
export class AgentError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(
      message ??
        `rmhOS agent: ${code}`,
    );
    this.name =
      'AgentError';
  }
}

export const AGENT_TIMEOUTS =
  {
    session: 30_000,
    // Measured in Node: a 96 MiB home restores in 7.9 s and saves in 37.9 s; a browser tab is slower.
    restore: 240_000,
    save: 240_000,
  } as const;

export interface AgentOptions {
  /** Milliseconds since the epoch. */
  now?: () => number;
  randomBytes?: (
    n: number,
  ) => Uint8Array;
  /** A fresh nonce per SAVE, matching /^[a-z0-9_-]{1,31}$/i. */
  nonce?: () => string;
}

interface Pending {
  /** true: this event settles the command. false: not ours, keep waiting. */
  accepts(
    e: GuestEvent,
  ): boolean;
  resolve(
    e: GuestEvent,
  ): void;
  reject(
    err: AgentError,
  ): void;
  timer: ReturnType<
    typeof setTimeout
  >;
}

const hex =
  (
    b: Uint8Array,
  ) =>
    Array.from(
      b,
      (
        x,
      ) =>
        x
          .toString(
            16,
          )
          .padStart(
            2,
            '0',
          ),
    ).join(
      '',
    );

export class AgentClient {
  private readonly parser =
    new GuestLineParser();
  private readonly off: () => void;
  private readonly poweroff =
    new Set<
      () => void
    >();
  private readonly savedOnPoweroff =
    new Set<
      (
        bytes: number,
      ) => void
    >();
  private pending: Pending | null =
    null;
  private readonly now: () => number;
  private readonly randomBytes: (
    n: number,
  ) => Uint8Array;
  private readonly nonce: () => string;

  constructor(
    private readonly vm: Pick<
      VmHandle,
      | 'onSerial1'
      | 'sendSerial1'
    >,
    opts: AgentOptions = {},
  ) {
    this.now =
      opts.now ??
      Date.now;
    this.randomBytes =
      opts.randomBytes ??
      ((
        n,
      ) =>
        crypto.getRandomValues(
          new Uint8Array(
            n,
          ),
        ));
    this.nonce =
      opts.nonce ??
      (() =>
        `s${hex(this.randomBytes(8))}`);
    this.off =
      vm.onSerial1(
        (
          chunk,
        ) => {
          for (const e of this.parser.push(
            chunk,
          ))
            this.dispatch(
              e,
            );
        },
      );
  }

  dispose(): void {
    this.off();
    if (
      this
        .pending
    )
      this.settle().reject(
        new AgentError(
          'closed',
        ),
      );
    this.poweroff.clear();
    this.savedOnPoweroff.clear();
  }

  private dispatch(
    e: GuestEvent,
  ): void {
    // READY is the VM wrapper's cue (it turns a cold boot into `running`); nothing here waits on it.
    if (
      e.type ===
      'ready'
    )
      return;
    // The guest has written its home to the share on its own, as it powers off.
    if (
      e.type ===
      'saved-on-poweroff'
    ) {
      for (const cb of [
        ...this
          .savedOnPoweroff,
      ])
        cb(
          e.bytes,
        );
      return;
    }
    if (
      e.type ===
      'poweroff'
    ) {
      for (const cb of [
        ...this
          .poweroff,
      ])
        cb();
      return;
    }
    const p =
      this
        .pending;
    if (
      !p
    )
      return;
    if (
      e.type ===
      'error'
    )
      this.settle().reject(
        new AgentError(
          e.code,
        ),
      );
    else if (
      p.accepts(
        e,
      )
    )
      this.settle().resolve(
        e,
      );
  }

  private settle(): Pending {
    const p =
      this
        .pending!;
    clearTimeout(
      p.timer,
    );
    this.pending =
      null;
    return p;
  }

  private command(
    text: string,
    accepts: Pending['accepts'],
    timeoutMs: number,
  ): Promise<GuestEvent> {
    if (
      this
        .pending
    )
      return Promise.reject(
        new AgentError(
          'busy',
        ),
      );
    return new Promise(
      (
        resolve,
        reject,
      ) => {
        const timer =
          setTimeout(
            () => {
              if (
                this
                  .pending
                  ?.timer ===
                timer
              )
                this.settle().reject(
                  new AgentError(
                    'timeout',
                  ),
                );
            },
            timeoutMs,
          );
        this.pending =
          {
            accepts,
            resolve,
            reject,
            timer,
          };
        this.vm.sendSerial1(
          text,
        );
      },
    );
  }

  /**
   * Tells the guest who is signing in. The clock and entropy are generated here, never logged.
   * Resolves to the Linux user the guest says it created, when it says one (`SESSION_OK <user>`;
   * the guest maps the site's name to a valid, unreserved one, `<user>_rmh` on a collision).
   */
  async startSession(
    user: string,
    timeoutMs: number = AGENT_TIMEOUTS.session,
  ): Promise<{
    user?: string;
  }> {
    const text =
      encodeCommand(
        {
          type: 'session',
          user,
          epoch:
            Math.floor(
              this.now() /
                1000,
            ),
          entropy:
            hex(
              this.randomBytes(
                64,
              ),
            ),
        },
      );
    const e =
      await this.command(
        text,
        (
          ev,
        ) =>
          ev.type ===
          'session-ok',
        timeoutMs,
      );
    return e.type ===
      'session-ok' &&
      e.user
      ? {
          user: e.user,
        }
      : {};
  }

  /** Extracts the home archive from the share (if any) and starts the desktop. */
  async restore(
    timeoutMs: number = AGENT_TIMEOUTS.restore,
  ): Promise<void> {
    await this.command(
      encodeCommand(
        {
          type: 'restore',
        },
      ),
      (
        e,
      ) =>
        e.type ===
        'restored',
      timeoutMs,
    );
  }

  async save(
    timeoutMs: number = AGENT_TIMEOUTS.save,
  ): Promise<{
    bytes: number;
  }> {
    const nonce =
      this.nonce();
    const e =
      await this.command(
        encodeCommand(
          {
            type: 'save',
            nonce,
          },
        ),
        (
          ev,
        ) =>
          ev.type ===
            'saved' &&
          ev.nonce ===
            nonce,
        timeoutMs,
      );
    return {
      bytes:
        e.type ===
        'saved'
          ? e.bytes
          : 0,
    };
  }

  onPoweroff(
    cb: () => void,
  ): () => void {
    this.poweroff.add(
      cb,
    );
    return () =>
      this.poweroff.delete(
        cb,
      );
  }

  /**
   * The guest saved its home on its way down (`saved-on-poweroff`, with the tar's byte count): the
   * tar is already in the share, so the host reads it without a SAVE round trip.
   */
  onSavedOnPoweroff(
    cb: (
      bytes: number,
    ) => void,
  ): () => void {
    this.savedOnPoweroff.add(
      cb,
    );
    return () =>
      this.savedOnPoweroff.delete(
        cb,
      );
  }
}
