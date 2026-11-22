/**
 * Freeplay dealing that follows the learner's memory — pure, seeded.
 *
 * `dealRun` is `makeRun` with a bias: of the 20 prompts, up to `BIAS_SHARE` of them are the items
 * (`reviews.ts` `itemIdOf`) the scheduler says are due — most overdue first — and then items the
 * learner has never been asked; the rest are today's random prompts. It takes `rand` and the stored
 * rows and nothing else (the clock is `now`), so the same seed and the same cards deal the same run,
 * and with no stored Sprint item it returns exactly what `makeRun` returns.
 *
 * How: `makeRun(count + extra)` deals the candidates, and its first `count` are exactly
 * `makeRun(count)` (the generator is sequential), so the plain run is the base and the extra prompts
 * are a pool of the same level to choose from. A reviewed item that is not yet due is never chosen
 * for the bias (it is remembered), though the base may still hold it. Everything chosen comes from
 * the level's own generator, so a level's clefs, accidentals and chord shapes stay as they are; a
 * final seeded shuffle spreads the picked prompts through the run and no prompt follows itself.
 * A level with no items (the bar) is never biased.
 */
import type {
  Instrument,
  VoiceRange,
} from '../schemas';
import { shuffle } from '../content/decks';
import {
  stateFromRow,
  type CardRow,
} from '../content/practice';
import { itemFamily } from '../srs/items';
import {
  dueCards,
  type CardState,
} from '../srs/schedule';
import type { SprintLevelId } from './levels';
import {
  makeRun,
  type SprintPrompt,
} from './generate';
import { itemIdOf } from './reviews';

/** At most this share of a run is chosen for the learner's memory; the rest is today's dealing. */
export const BIAS_SHARE = 0.6;
/** How many more prompts than the run needs are dealt to choose from, per prompt in the run. */
const POOL_FACTOR = 4;

const key =
  (
    p: SprintPrompt,
  ): string =>
    `${p.clef}|${p.notes.map((n) => `${n.written}${n.accidental}`).join(',')}`;

export function dealRun(
  levelId: SprintLevelId,
  count: number,
  rand: () => number,
  instrument: Instrument,
  range:
    | VoiceRange
    | undefined,
  rows: readonly CardRow[],
  now: number,
): SprintPrompt[] {
  const sprintRows =
    rows.filter(
      (
        r,
      ) =>
        itemFamily(
          r.cardId,
        ) ===
        'sprint',
    );
  if (
    sprintRows.length ===
      0 ||
    count <=
      0
  )
    return makeRun(
      levelId,
      count,
      rand,
      instrument,
      range,
    );

  const pool =
    makeRun(
      levelId,
      count +
        count *
          POOL_FACTOR,
      rand,
      instrument,
      range,
    );
  const base =
    pool.slice(
      0,
      count,
    );

  const state =
    new Map<
      string,
      CardState
    >(
      sprintRows
        .filter(
          (
            r,
          ) =>
            r.reps >
            0,
        )
        .map(
          (
            r,
          ) => [
            r.cardId,
            stateFromRow(
              r,
            ),
          ],
        ),
    );
  const seen: {
    prompt: SprintPrompt;
    state: CardState;
  }[] =
    [];
  const fresh: SprintPrompt[] =
    [];
  const taken =
    new Set<string>();
  for (const p of pool) {
    const id =
      itemIdOf(
        p,
      );
    if (
      !id ||
      taken.has(
        id,
      )
    )
      continue;
    taken.add(
      id,
    );
    const st =
      state.get(
        id,
      );
    if (
      st
    )
      seen.push(
        {
          prompt:
            p,
          state:
            st,
        },
      );
    else
      fresh.push(
        p,
      );
  }
  if (
    seen.length ===
      0 &&
    fresh.length ===
      0
  )
    return base;

  const room =
    Math.min(
      count,
      Math.floor(
        count *
          BIAS_SHARE,
      ),
    );
  const chosen: SprintPrompt[] =
    [
      ...dueCards(
        seen,
        now,
        room,
      ).map(
        (
          e,
        ) =>
          e.prompt,
      ),
    ];
  for (const p of fresh) {
    if (
      chosen.length >=
      room
    )
      break;
    chosen.push(
      p,
    );
  }
  if (
    chosen.length ===
    0
  )
    return base;

  // The rest is today's run, in its own order, skipping what was already picked; if that leaves the
  // run short (the base repeated the picks), the pool tops it up.
  const picked =
    new Set(
      chosen.map(
        key,
      ),
    );
  for (const p of [
    ...base,
    ...pool,
  ]) {
    if (
      chosen.length >=
      count
    )
      break;
    if (
      picked.has(
        key(
          p,
        ),
      )
    )
      continue;
    chosen.push(
      p,
    );
    picked.add(
      key(
        p,
      ),
    );
  }
  for (const p of pool) {
    if (
      chosen.length >=
      count
    )
      break;
    chosen.push(
      p,
    );
  }

  const out =
    shuffle(
      chosen.slice(
        0,
        count,
      ),
      rand,
    );
  return spreadRepeats(
    out,
  );
}

/** True when the prompt at `i` differs from both its neighbours. */
function apart(
  a: readonly SprintPrompt[],
  i: number,
): boolean {
  const p =
    a[
      i
    ];
  if (
    !p
  )
    return true;
  const before =
    a[
      i -
        1
    ];
  const after =
    a[
      i +
        1
    ];
  return (
    (!before ||
      key(
        before,
      ) !==
        key(
          p,
        )) &&
    (!after ||
      key(
        after,
      ) !==
        key(
          p,
        ))
  );
}

/** Swap each prompt that follows itself with one elsewhere that fits, so none repeats in a row. */
function spreadRepeats(
  out: SprintPrompt[],
): SprintPrompt[] {
  for (
    let i = 1;
    i <
    out.length;
    i++
  ) {
    if (
      apart(
        out,
        i,
      )
    )
      continue;
    for (
      let j = 0;
      j <
      out.length;
      j++
    ) {
      if (
        j ===
        i
      )
        continue;
      [
        out[
          i
        ],
        out[
          j
        ],
      ] =
        [
          out[
            j
          ]!,
          out[
            i
          ]!,
        ];
      if (
        apart(
          out,
          i,
        ) &&
        apart(
          out,
          j,
        )
      )
        break;
      [
        out[
          i
        ],
        out[
          j
        ],
      ] =
        [
          out[
            j
          ]!,
          out[
            i
          ]!,
        ];
    }
  }
  return out;
}
