/**
 * Which voices to let go of when a new one starts — pure bookkeeping. The pool never touches
 * audio nodes: it answers with ids, and the sampler (which owns the nodes) releases them.
 *
 * - Past `max`, the oldest voice already in release is stolen first, then the oldest held one.
 *   A stolen voice leaves the pool at once (the sampler fades it quickly), so `size` never
 *   exceeds `max`.
 * - A mono pool (a flute) releases whatever is held on every start: a legato handover.
 */
export interface VoicePool {
  /** Register voice `id` starting at `at`; returns the voices to release now. */
  start(
    id: number,
    at: number,
  ): {
    release: number[];
  };
  /** The voice was let go at `at` (it keeps sounding until `ended`). Idempotent. */
  release(
    id: number,
    at: number,
  ): void;
  /** The voice is silent and gone. */
  ended(
    id: number,
  ): void;
  readonly size: number;
}

interface Entry {
  id: number;
  startedAt: number;
  releasedAt:
    | number
    | null;
}

export function createVoicePool(
  max: number,
  mono: boolean,
): VoicePool {
  const cap =
    Math.max(
      1,
      Math.floor(
        max,
      ),
    );
  const voices =
    new Map<
      number,
      Entry
    >();

  return {
    start(
      id,
      at,
    ) {
      if (
        voices.has(
          id,
        )
      )
        return {
          release:
            [],
        };
      const release: number[] =
        [];
      if (
        mono
      ) {
        for (const v of voices.values()) {
          if (
            v.releasedAt ===
            null
          ) {
            v.releasedAt =
              at;
            release.push(
              v.id,
            );
          }
        }
      }
      while (
        voices.size >=
        cap
      ) {
        let victim: Entry | null =
          null;
        for (const v of voices.values()) {
          const better =
            !victim ||
            (v.releasedAt !==
              null &&
              victim.releasedAt ===
                null) ||
            ((v.releasedAt !==
              null) ===
              (victim.releasedAt !==
                null) &&
              v.startedAt <
                victim.startedAt);
          if (
            better
          )
            victim =
              v;
        }
        if (
          !victim
        )
          break;
        voices.delete(
          victim.id,
        );
        if (
          !release.includes(
            victim.id,
          )
        )
          release.push(
            victim.id,
          );
      }
      voices.set(
        id,
        {
          id,
          startedAt:
            at,
          releasedAt:
            null,
        },
      );
      return {
        release,
      };
    },
    release(
      id,
      at,
    ) {
      const v =
        voices.get(
          id,
        );
      if (
        v &&
        v.releasedAt ===
          null
      )
        v.releasedAt =
          at;
    },
    ended(
      id,
    ) {
      voices.delete(
        id,
      );
    },
    get size() {
      return voices.size;
    },
  };
}
