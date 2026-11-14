/**
 * Optional room passwords for the P2P signalling hubs (Hearthworks today).
 *
 * A password keeps strangers out of a listed room; it is not an account secret, so the rules are modest but
 * strict about what leaves the process:
 *   - the hub stores ONLY a salted scrypt hash, in memory (a `RoomLock`); the plaintext is hashed on arrival and
 *     dropped, is never logged, never put in a payload and never in the room list (that carries `locked: true`);
 *   - a candidate is hashed with the room's salt and compared with `timingSafeEqual`, so the compare time does not
 *     reveal how much of a guess was right (a wrong LENGTH is not special: the hashes are fixed-size);
 *   - guesses are limited per account and room, per socket, and per room overall (`PasswordGuard`, built on the
 *     hubs' shared sliding-window limiter). A right password clears the account's counter; a wrong one does not.
 *
 * Environment: Node (crypto). Server only.
 */

import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  createRateLimiter,
  type RateLimiter,
} from '../../shared/rate-limit';

export interface RoomLock {
  salt: Buffer;
  hash: Buffer;
}

// Cheap enough to run inline on the hub (~3 ms), costly enough that a stolen hash is not a free lookup table.
const SCRYPT =
  {
    N: 4096,
    r: 8,
    p: 1,
  } as const;
const KEY_BYTES = 32;

function derive(
  password: string,
  salt: Buffer,
): Buffer {
  return scryptSync(
    password.normalize(
      'NFKC',
    ),
    salt,
    KEY_BYTES,
    SCRYPT,
  );
}

/** A lock for `password`. Only the salt and the hash are kept. */
export function makeLock(
  password: string,
): RoomLock {
  const salt =
    randomBytes(
      16,
    );
  return {
    salt,
    hash: derive(
      password,
      salt,
    ),
  };
}

/** Constant-time check of a candidate against a lock. */
export function checkLock(
  lock: RoomLock,
  candidate: string,
): boolean {
  return timingSafeEqual(
    derive(
      candidate,
      lock.salt,
    ),
    lock.hash,
  );
}

/** What one attempt at a locked room may do. */
export type GuessVerdict =
  | 'ok'
  | 'wrong'
  | 'rate-limited';

export interface PasswordGuardLimits {
  /** Attempts per account per room in the window (a right password resets this account's count). */
  perAccount: number;
  /** Attempts per socket in the window (a new socket per attempt is bounded by the per-account limit). */
  perSocket: number;
  /** Attempts per room, all accounts, in the window: stops a swarm of throwaway accounts. */
  perRoom: number;
  windowMs: number;
}

export const DEFAULT_GUARD_LIMITS: PasswordGuardLimits =
  {
    perAccount: 5,
    perSocket: 10,
    perRoom: 120,
    windowMs:
      5 *
      60_000,
  };

const EV_ACCOUNT =
  'pw:account';
const EV_SOCKET =
  'pw:socket';
const EV_ROOM =
  'pw:room';

export class PasswordGuard {
  private readonly limiter: RateLimiter;
  constructor(
    private readonly limits: PasswordGuardLimits = DEFAULT_GUARD_LIMITS,
  ) {
    this.limiter =
      createRateLimiter(
        {
          [EV_ACCOUNT]:
            {
              max: limits.perAccount,
              windowMs:
                limits.windowMs,
            },
          [EV_SOCKET]:
            {
              max: limits.perSocket,
              windowMs:
                limits.windowMs,
            },
          [EV_ROOM]:
            {
              max: limits.perRoom,
              windowMs:
                limits.windowMs,
            },
        },
      );
  }

  /**
   * Try `candidate` against `lock`. Every call spends the counters first (so a refused attempt costs the
   * attacker too and never reaches the hash); a right password gives the account its attempts back.
   */
  attempt(
    lock: RoomLock,
    candidate: string,
    who: {
      roomCode: string;
      userId: string;
      socketId: string;
    },
  ): GuessVerdict {
    const accountKey = `${who.roomCode}:${who.userId}`;
    const socketKey =
      who.socketId;
    const roomKey =
      who.roomCode;
    // `check` per key counts the attempt; evaluate all three so none is skipped by short-circuiting.
    const a =
      this.limiter.check(
        accountKey,
        EV_ACCOUNT,
      );
    const s =
      this.limiter.check(
        socketKey,
        EV_SOCKET,
      );
    const r =
      this.limiter.check(
        roomKey,
        EV_ROOM,
      );
    if (
      !a ||
      !s ||
      !r
    )
      return 'rate-limited';
    if (
      !checkLock(
        lock,
        candidate,
      )
    )
      return 'wrong';
    this.limiter.cleanup(
      accountKey,
    );
    return 'ok';
  }

  /** Forget a socket's counters (it disconnected). */
  forgetSocket(
    socketId: string,
  ): void {
    this.limiter.cleanup(
      socketId,
    );
  }

  /** Forget everything about a room (it closed). */
  forgetRoom(
    roomCode: string,
  ): void {
    this.limiter.cleanup(
      roomCode,
    );
  }

  reset(): void {
    this.limiter.reset();
  }
}
