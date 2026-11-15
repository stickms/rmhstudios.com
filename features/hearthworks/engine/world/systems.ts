/** What the world does by itself each tick: customers walk in and out, machines gather, farmhands work. */

import { CROPS } from '../content';
import { FLAG_POWERED } from './city-cells';
import {
  WAGE,
  WAGE_INTERVAL_TICKS,
} from './actions';
import { newBudget } from './agents';
import { tickCity } from './city';
import { tickCustomers } from './customers';
import { tickFarmhand } from './farmhands';
import {
  cropRipe,
  tileDistance,
} from './helpers';
import type {
  World,
  WorldEvent,
} from './types';

const MACHINE_EVERY_TICKS = 20;
const MACHINE_RADIUS = 2;

function tickMachines(
  w: World,
) {
  for (const m of w.buildings) {
    if (
      m.kind !==
      'harvester'
    )
      continue;
    // A harvester on the town's power works twice as often (world/city.ts hands the power out).
    const every =
      w
        .city
        .flags[
        m.z *
          w.size +
          m.x
      ] &
      FLAG_POWERED
        ? MACHINE_EVERY_TICKS /
          2
        : MACHINE_EVERY_TICKS;
    if (
      w.tick %
        every !==
      0
    )
      continue;
    for (const c of [
      ...w.crops,
    ]) {
      if (
        tileDistance(
          c.x,
          c.z,
          m.x,
          m.z,
        ) >
          MACHINE_RADIUS ||
        !cropRipe(
          w,
          c,
        )
      )
        continue;
      const def =
        CROPS[
          c
            .kind
        ];
      m.storage ??=
        {};
      m.storage[
        def.yieldItem
      ] =
        (m
          .storage[
          def
            .yieldItem
        ] ??
          0) +
        def.yieldQty;
      w.crops =
        w.crops.filter(
          (
            o,
          ) =>
            o.id !==
            c.id,
        );
    }
  }
}

function tickWorkers(
  w: World,
  ev: WorldEvent[],
  budget: ReturnType<
    typeof newBudget
  >,
) {
  for (const k of [
    ...w.workers,
  ]) {
    const owner =
      w
        .players[
        k
          .ownerId
      ];
    if (
      !owner
    )
      continue;
    if (
      w.tick >=
      k.nextWageTick
    ) {
      k.nextWageTick =
        w.tick +
        WAGE_INTERVAL_TICKS;
      if (
        owner.money <
        WAGE
      ) {
        w.workers =
          w.workers.filter(
            (
              o,
            ) =>
              o.id !==
              k.id,
          );
        ev.push(
          {
            type: 'workerQuit',
            workerId:
              k.id,
            reason:
              'unpaid',
          },
        );
        continue;
      }
      owner.money -=
        WAGE;
    }
    tickFarmhand(
      w,
      k,
      owner,
      budget,
    );
  }
}

export function tickSystems(
  w: World,
  ev: WorldEvent[],
): void {
  // One allowance of route searches for everyone this tick, so a crowd never makes a frame spike.
  const budget =
    newBudget();
  tickCity(
    w,
    ev,
  );
  tickCustomers(
    w,
    ev,
    budget,
  );
  tickMachines(
    w,
  );
  tickWorkers(
    w,
    ev,
    budget,
  );
}
