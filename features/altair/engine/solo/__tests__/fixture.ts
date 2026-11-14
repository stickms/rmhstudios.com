// Shared fixture: a real SoloRun played the way the browser plays it (live input sampled once per
// step, picks/rerolls/banishes between steps), recorded by its own SoloRecorder.
import {
  SoloRun,
  type SoloResult,
} from '../solo-run';
import type {
  SoloLog,
  SoloLoadout,
} from '../solo-log';
import type {
  TrustedSoloSetup,
  ClaimedSoloResult,
} from '../verify-solo';
import { createInputState } from '../../engine/input';
import { useAltairGameStore } from '../../stores/game-store';

export const SEED = 987654321;
export const LOADOUT: SoloLoadout =
  {
    rerolls: 2,
    banishes: 1,
    revival: 1,
    extraChoice: true,
    catalystAffinity: 1,
    greed: 2,
  };

export interface PlayOptions {
  seed?: number;
  classId?: string;
  doubleTime?: boolean;
  loadout?: SoloLoadout;
  /** Steps to walk before standing still (and dying). */
  walkSteps?: number;
  maxSteps?: number;
  viewport?: {
    w: number;
    h: number;
  };
  /** Called every step after the first `resizeAt`. */
  resizeAt?: number;
}

export interface Recorded {
  log: SoloLog;
  result: SoloResult;
  claim: ClaimedSoloResult;
  trusted: TrustedSoloSetup;
}

/** Play a run: walk with keys and the mobile stick, pick/reroll/banish at level-ups, then idle until dead. */
export function playSoloRun(
  opts: PlayOptions = {},
): Recorded {
  const seed =
    opts.seed ??
    SEED;
  const loadout =
    opts.loadout ??
    LOADOUT;
  const live =
    createInputState();
  const run =
    new SoloRun(
      {
        setup:
          {
            seed,
            classId:
              opts.classId ??
              'knight',
            doubleTime:
              !!opts.doubleTime,
            loadout,
          },
        viewport:
          opts.viewport ?? {
            w: 1280,
            h: 720,
          },
        inputSource:
          () =>
            live,
      },
    );
  const walk =
    opts.walkSteps ??
    2400;
  const max =
    opts.maxSteps ??
    60_000;
  let picks = 0;
  for (
    let i = 0;
    i <
      max &&
    run.ended ===
      null;
    i++
  ) {
    if (
      i <
      walk
    ) {
      const seg =
        Math.floor(
          i /
            50,
        );
      live.keys.clear();
      live.dx = 0;
      live.dy = 0;
      if (
        seg %
          7 ===
        6
      ) {
        // mobile stick, analog
        live.dx =
          Math.cos(
            seg,
          );
        live.dy =
          Math.sin(
            seg,
          );
      } else {
        const dir =
          seg %
          4;
        live.keys.add(
          [
            'w',
            'd',
            's',
            'a',
          ][
            dir
          ],
        );
        if (
          seg %
            3 ===
          0
        )
          live.keys.add(
            [
              'd',
              's',
              'a',
              'w',
            ][
              dir
            ],
          );
      }
    } else {
      live.keys.clear();
      live.dx = 0;
      live.dy = 0;
    }
    if (
      opts.resizeAt !==
        undefined &&
      i ===
        opts.resizeAt
    )
      run.setViewport(
        1600,
        900,
      );
    // A level-up opened the picker on the previous step: choose like a player would.
    while (
      useAltairGameStore.getState()
        .phase ===
      'upgrading'
    ) {
      const s =
        useAltairGameStore.getState();
      if (
        picks %
          5 ===
          1 &&
        s.rerollsRemaining >
          0
      )
        run.reroll();
      else if (
        picks %
          5 ===
          3 &&
        s.banishesRemaining >
          0 &&
        s
          .upgradeChoices
          .length >
          2
      )
        run.banish(
          0,
        );
      run.pick(
        picks %
          s
            .upgradeChoices
            .length,
      );
      picks++;
    }
    run.step();
  }
  // A pick may be pending when the loop ends (quit); leave the picker as is.
  const log =
    run.toLog();
  const result =
    run.result();
  return {
    log,
    result,
    claim:
      {
        victory:
          result.status ===
          'victory',
        kills:
          result.kills,
        level:
          result.level,
        finalCoins:
          result.finalCoins,
      },
    trusted:
      {
        seed,
        classId:
          log.classId,
        doubleTime:
          log.doubleTime,
        loadout,
        wallMs:
          (log.steps /
            60) *
            1000 +
          5000,
      },
  };
}
