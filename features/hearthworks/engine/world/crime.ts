/**
 * The crime route, beside the legal one: hustling goods on the street for a markup (which makes heat), buying and
 * firing guns, and what the law does about it (arrests, downed players, officers' deaths). The officers' own
 * behaviour lives in police.ts. Everything here is part of the lockstep tick, so it is integer tick counters and the
 * world's own generator only — no clocks, no Math.random, stable iteration order.
 */

import {
  ITEMS,
  OFFICERS,
  WEAPONS,
  isItemId,
  isWeaponId,
  type ItemId,
} from '../content';
import {
  resolveShot,
  type ShotTarget,
} from './ballistics';
import type {
  Arms,
  CrimeCommand,
} from './crime-types';
import type {
  PlayerState,
  RejectReason,
  World,
  WorldEvent,
} from './types';

export const MAX_HP = 100;
export const HEAT_MAX = 100;
/**
 * Street buyers pay this much over the stall price: the price of asking no questions. Deliberately below the 1.5×
 * a customer pays at a stall (CUSTOMER_PREMIUM), so laundering legal goods is never worth the heat; the money in
 * crime is the contraband's own price (content/items.ts), not the markup.
 */
export const HUSTLE_MARKUP = 1.6;
/**
 * Heat from one hustle: a small fixed cost for making a deal, plus a charge per unit, so a bigger deal is hotter
 * in proportion (there is no bulk discount: dumping a whole stock at once reaches the cap and calls the police).
 * Contraband is hotter per unit than legal goods.
 */
export const HUSTLE_HEAT_DEAL = 2;
export const HUSTLE_HEAT_PER_UNIT = 4;
export const HUSTLE_HEAT_PER_UNIT_CONTRABAND = 7;
/** At this heat (and above) the police come. */
export const WANTED_HEAT = 40;
/** Heat lost every HEAT_DECAY_TICKS (1 per 2.5 s: 44 → calm takes 72 s, a full 100 takes 4 minutes). */
export const HEAT_DECAY_TICKS = 50;
/** Heat for hitting an officer, and for killing one. */
export const HIT_HEAT = 1;
export const KILL_HEAT = 20;
/** Health returns 1 every REGEN_TICKS (2.5 hp/s), starting REGEN_DELAY ticks (3 s) after the last wound. */
export const REGEN_DELAY = 60;
export const REGEN_TICKS = 8;
/** Time knocked out before waking at the meadow (3 s). */
export const DOWNED_TICKS = 60;
export const EQUIP_TICKS = 6;
/**
 * What an arrest and a knock-out cost, as a percentage of the money carried: a base plus a share for every point of
 * heat at the time (the hotter you were, the harder they come down), and never less than the floor (or all you have).
 * Cold (heat 40): 25 % / 18 %. Burning (heat 100): 40 % / 30 %.
 */
export const ARREST_FINE_PCT = 15;
export const ARREST_FINE_PCT_PER_HEAT = 0.25;
export const DOWNED_FINE_PCT = 10;
export const DOWNED_FINE_PCT_PER_HEAT = 0.2;
export const FINE_FLOOR = 30;
/** Having fired this recently counts as fighting back (10 s). */
export const FIGHT_MEMORY_TICKS = 200;

/** The heat one hustle of `qty` units of `item` makes. */
export function hustleHeat(
  item: ItemId,
  qty: number,
): number {
  const per =
    ITEMS[
      item
    ]
      .contraband
      ? HUSTLE_HEAT_PER_UNIT_CONTRABAND
      : HUSTLE_HEAT_PER_UNIT;
  return (
    HUSTLE_HEAT_DEAL +
    per *
      qty
  );
}

export function newArms(): Arms {
  return {
    equipped:
      null,
    guns: {},
    readyAt: 0,
    reloadDoneAt: 0,
    lastShotTick:
      -1,
    lastHitTick:
      -1,
    downedUntil: 0,
  };
}

export const isDowned =
  (
    w: World,
    p: PlayerState,
  ): boolean =>
    p
      .arms
      .downedUntil >
    w.tick;

/** Armed or having just fired: the police shoot at you rather than arrest you. */
export function fightingBack(
  w: World,
  p: PlayerState,
): boolean {
  return (
    p
      .arms
      .equipped !==
      null ||
    (p
      .arms
      .lastShotTick >=
      0 &&
      w.tick -
        p
          .arms
          .lastShotTick <=
        FIGHT_MEMORY_TICKS)
  );
}

export const addHeat =
  (
    p: PlayerState,
    n: number,
  ): void => {
    p.heat =
      Math.min(
        HEAT_MAX,
        Math.max(
          0,
          p.heat +
            n,
        ),
      );
  };

/** Combat and street commands a knocked-out player cannot give ('move' is ignored quietly). */
const DOWNED_BLOCKED: ReadonlySet<string> =
  new Set(
    [
      'move',
      'hustle',
      'buyWeapon',
      'equip',
      'shoot',
      'reload',
    ],
  );

/** Called before every command: null to carry on, else why not ('silent' for no complaint). */
export function crimeGate(
  w: World,
  p: PlayerState,
  type: string,
):
  | RejectReason
  | 'silent'
  | null {
  if (
    !isDowned(
      w,
      p,
    ) ||
    !DOWNED_BLOCKED.has(
      type,
    )
  )
    return null;
  return type ===
    'move'
    ? 'silent'
    : 'downed';
}

type Result =
  | RejectReason
  | 'silent'
  | null;

function gunOf(
  p: PlayerState,
) {
  const id =
    p
      .arms
      .equipped;
  const state =
    id
      ? p
          .arms
          .guns[
          id
        ]
      : undefined;
  return id &&
    state
    ? {
        id,
        def: WEAPONS[
          id
        ],
        state,
      }
    : null;
}

function startReload(
  w: World,
  p: PlayerState,
  ev: WorldEvent[],
): Result {
  const g =
    gunOf(
      p,
    );
  if (
    !g
  )
    return 'no-weapon';
  if (
    p
      .arms
      .reloadDoneAt >
      0 ||
    g
      .state
      .mag >=
      g
        .def
        .magazine
  )
    return 'silent';
  if (
    g
      .state
      .reserve <=
    0
  )
    return 'no-ammo';
  p.arms.reloadDoneAt =
    w.tick +
    g
      .def
      .reloadTicks;
  ev.push(
    {
      type: 'reloading',
      playerId:
        p.id,
      weapon:
        g.id,
    },
  );
  return null;
}

export function applyCrimeCommand(
  w: World,
  p: PlayerState,
  cmd: CrimeCommand,
  ev: WorldEvent[],
): Result {
  switch (
    cmd.type
  ) {
    case 'hustle': {
      if (
        !isItemId(
          cmd.item,
        ) ||
        !Number.isInteger(
          cmd.qty,
        ) ||
        cmd.qty <=
          0
      )
        return 'bad-amount';
      if (
        (p
          .inventory[
          cmd
            .item
        ] ??
          0) <
        cmd.qty
      )
        return 'missing-ingredients';
      p.inventory[
        cmd.item
      ] =
        (p
          .inventory[
          cmd
            .item
        ] ??
          0) -
        cmd.qty;
      const earned =
        Math.floor(
          ITEMS[
            cmd
              .item
          ]
            .price *
            cmd.qty *
            HUSTLE_MARKUP,
        );
      p.money +=
        earned;
      addHeat(
        p,
        hustleHeat(
          cmd.item,
          cmd.qty,
        ),
      );
      ev.push(
        {
          type: 'hustled',
          playerId:
            p.id,
          item: cmd.item,
          qty: cmd.qty,
          earned,
          heat: p.heat,
        },
      );
      return null;
    }
    case 'buyWeapon': {
      if (
        !isWeaponId(
          cmd.weapon,
        )
      )
        return 'unknown-weapon';
      const def =
        WEAPONS[
          cmd
            .weapon
        ];
      const have =
        p
          .arms
          .guns[
          cmd
            .weapon
        ];
      if (
        have
      ) {
        // Already owned: buying again is a spare magazine, up to what you can carry.
        const cap =
          def.maxMags *
          def.magazine;
        if (
          have.reserve >=
          cap
        )
          return 'bad-amount';
        if (
          p.money <
          def.ammoPrice
        )
          return 'cannot-afford';
        p.money -=
          def.ammoPrice;
        have.reserve =
          Math.min(
            cap,
            have.reserve +
              def.magazine,
          );
        ev.push(
          {
            type: 'weaponBought',
            playerId:
              p.id,
            weapon:
              cmd.weapon,
            price:
              def.ammoPrice,
            restock: true,
          },
        );
        return null;
      }
      if (
        p.money <
        def.price
      )
        return 'cannot-afford';
      p.money -=
        def.price;
      p.arms.guns[
        cmd.weapon
      ] =
        {
          mag: def.magazine,
          reserve:
            def.startMags *
            def.magazine,
        };
      ev.push(
        {
          type: 'weaponBought',
          playerId:
            p.id,
          weapon:
            cmd.weapon,
          price:
            def.price,
          restock: false,
        },
      );
      return null;
    }
    case 'equip': {
      if (
        cmd.weapon !==
          null &&
        (!isWeaponId(
          cmd.weapon,
        ) ||
          !p
            .arms
            .guns[
            cmd
              .weapon
          ])
      )
        return 'no-weapon';
      p.arms.equipped =
        cmd.weapon;
      p.arms.reloadDoneAt = 0;
      p.arms.readyAt =
        Math.max(
          p
            .arms
            .readyAt,
          w.tick +
            EQUIP_TICKS,
        );
      ev.push(
        {
          type: 'equipped',
          playerId:
            p.id,
          weapon:
            cmd.weapon,
        },
      );
      return null;
    }
    case 'reload':
      return startReload(
        w,
        p,
        ev,
      );
    case 'shoot': {
      const g =
        gunOf(
          p,
        );
      if (
        !g
      )
        return 'no-weapon';
      if (
        !Number.isFinite(
          cmd.x,
        ) ||
        !Number.isFinite(
          cmd.z,
        )
      )
        return 'bad-aim';
      if (
        p
          .arms
          .reloadDoneAt >
          0 ||
        w.tick <
          p
            .arms
            .readyAt
      )
        return 'silent';
      if (
        g
          .state
          .mag <=
        0
      )
        return (
          startReload(
            w,
            p,
            ev,
          ) ??
          'silent'
        );
      if (
        Math.abs(
          cmd.x -
            p.x,
        ) <
          1e-6 &&
        Math.abs(
          cmd.z -
            p.z,
        ) <
          1e-6
      )
        return 'bad-aim';
      g.state.mag -= 1;
      p.arms.readyAt =
        w.tick +
        g
          .def
          .fireTicks;
      p.arms.lastShotTick =
        w.tick;
      const targets: ShotTarget[] =
        w.officers.map(
          (
            o,
          ) => ({
            id: String(
              o.id,
            ),
            x: o
              .mover
              .x,
            z: o
              .mover
              .z,
          }),
        );
      const r =
        resolveShot(
          w,
          p,
          cmd,
          g.def,
          {
            damageMul: 1,
            spreadMul: 1,
          },
          targets,
        );
      for (const h of r.hits)
        damageOfficer(
          w,
          Number(
            h.id,
          ),
          h.damage,
          p.id,
          ev,
        );
      ev.push(
        {
          type: 'shot',
          by: {
            kind: 'player',
            id: p.id,
          },
          fx: p.x,
          fz: p.z,
          tx: r.endX,
          tz: r.endZ,
          hit:
            r
              .hits
              .length >
            0,
        },
      );
      return null;
    }
  }
}

/** A player's bullet found an officer. A kill drops a little cash — and a lot of heat. */
export function damageOfficer(
  w: World,
  officerId: number,
  damage: number,
  byId: string,
  ev: WorldEvent[],
): void {
  const o =
    w.officers.find(
      (
        q,
      ) =>
        q.id ===
        officerId,
    );
  if (
    !o
  )
    return;
  const by =
    w
      .players[
      byId
    ];
  o.hp -=
    damage;
  ev.push(
    {
      type: 'officerHit',
      officerId:
        o.id,
      by: byId,
      damage,
      hp: Math.max(
        0,
        o.hp,
      ),
    },
  );
  if (
    by
  )
    addHeat(
      by,
      HIT_HEAT,
    );
  // Whoever shot them is who they come for now.
  if (
    by &&
    o.hp >
      0
  ) {
    o.target =
      byId;
    o.mode =
      'hunt';
    o.leaveSince = 0;
  }
  if (
    o.hp >
    0
  )
    return;
  w.officers =
    w.officers.filter(
      (
        q,
      ) =>
        q.id !==
        o.id,
    );
  const drop =
    OFFICERS[
      o
        .kind
    ]
      .drop;
  if (
    by
  ) {
    by.money +=
      drop;
    addHeat(
      by,
      KILL_HEAT,
    );
  }
  ev.push(
    {
      type: 'officerDown',
      officerId:
        o.id,
      by: byId,
      drop,
    },
  );
}

/** Everyone hunting this player gives up and walks away (they were arrested, or knocked out). */
function standDown(
  w: World,
  playerId: string,
): void {
  for (const o of w.officers) {
    if (
      o.target !==
        playerId ||
      o.mode ===
        'leave'
    )
      continue;
    o.mode =
      'leave';
    o.leaveSince =
      w.tick;
    o.arrestAt = 0;
  }
}

/** An officer's bullet found a player. At 0 health they are downed, and back on their feet in DOWNED_TICKS. */
export function damagePlayer(
  w: World,
  p: PlayerState,
  damage: number,
  officerId: number,
  ev: WorldEvent[],
): void {
  if (
    isDowned(
      w,
      p,
    )
  )
    return;
  p.hp =
    Math.max(
      0,
      p.hp -
        damage,
    );
  p.arms.lastHitTick =
    w.tick;
  ev.push(
    {
      type: 'playerHit',
      playerId:
        p.id,
      officerId,
      damage,
      hp: p.hp,
    },
  );
  if (
    p.hp >
    0
  )
    return;
  p.arms.downedUntil =
    w.tick +
    DOWNED_TICKS;
  p.arms.reloadDoneAt = 0;
  standDown(
    w,
    p.id,
  );
  ev.push(
    {
      type: 'downed',
      playerId:
        p.id,
    },
  );
}

/** Take every contraband item the player carries. */
function confiscate(
  p: PlayerState,
): Partial<
  Record<
    ItemId,
    number
  >
> {
  const taken: Partial<
    Record<
      ItemId,
      number
    >
  > =
    {};
  for (const [
    id,
    n,
  ] of Object.entries(
    p.inventory,
  )) {
    if (
      !n ||
      !isItemId(
        id,
      ) ||
      !ITEMS[
        id
      ]
        .contraband
    )
      continue;
    taken[
      id
    ] =
      n;
    delete p
      .inventory[
      id
    ];
  }
  return taken;
}

/** The fine: a share of the money, never less than the floor, never more than you have, never negative. */
const fineOf =
  (
    money: number,
    pct: number,
  ): number =>
    Math.max(
      0,
      Math.min(
        money,
        Math.max(
          FINE_FLOOR,
          Math.floor(
            (money *
              pct) /
              100,
          ),
        ),
      ),
    );

/** The arrest fine for a player of this heat carrying this much. */
export const arrestFine =
  (
    money: number,
    heat: number,
  ): number =>
    fineOf(
      money,
      ARREST_FINE_PCT +
        ARREST_FINE_PCT_PER_HEAT *
          heat,
    );
/** The fine for being knocked out. */
export const downedFine =
  (
    money: number,
    heat: number,
  ): number =>
    fineOf(
      money,
      DOWNED_FINE_PCT +
        DOWNED_FINE_PCT_PER_HEAT *
          heat,
    );

/** The cuffs go on: a fine, the contraband gone, and the heat with it. */
export function arrest(
  w: World,
  p: PlayerState,
  officerId: number,
  ev: WorldEvent[],
): void {
  const fine =
    arrestFine(
      p.money,
      p.heat,
    );
  p.money -=
    fine;
  const confiscated =
    confiscate(
      p,
    );
  p.heat = 0;
  standDown(
    w,
    p.id,
  );
  ev.push(
    {
      type: 'arrested',
      playerId:
        p.id,
      officerId,
      fine,
      confiscated,
    },
  );
}

/** Wake at the meadow: a smaller fine, no contraband, full health, a clean slate. Inventory otherwise kept. */
export function respawn(
  w: World,
  p: PlayerState,
  ev: WorldEvent[],
): void {
  const mid =
    Math.floor(
      w.size /
        2,
    );
  const fine =
    downedFine(
      p.money,
      p.heat,
    );
  p.money -=
    fine;
  const confiscated =
    confiscate(
      p,
    );
  p.x =
    mid;
  p.z =
    mid;
  p.hp =
    MAX_HP;
  p.heat = 0;
  p.arms.downedUntil = 0;
  p.arms.reloadDoneAt = 0;
  p.arms.lastHitTick =
    -1;
  ev.push(
    {
      type: 'respawned',
      playerId:
        p.id,
      x: mid,
      z: mid,
      fine,
      confiscated,
    },
  );
}

/** Per-player upkeep each tick: reloads finish, heat cools, health regrows, the downed get up. */
export function tickPlayersCombat(
  w: World,
  ev: WorldEvent[],
): void {
  for (const id of Object.keys(
    w.players,
  ).sort()) {
    const p =
      w
        .players[
        id
      ];
    if (
      p
        .arms
        .downedUntil >
      0
    ) {
      if (
        w.tick >=
        p
          .arms
          .downedUntil
      )
        respawn(
          w,
          p,
          ev,
        );
      continue;
    }
    const g =
      gunOf(
        p,
      );
    if (
      g &&
      p
        .arms
        .reloadDoneAt >
        0 &&
      w.tick >=
        p
          .arms
          .reloadDoneAt
    ) {
      const moved =
        Math.min(
          g
            .def
            .magazine -
            g
              .state
              .mag,
          g
            .state
            .reserve,
        );
      g.state.mag +=
        moved;
      g.state.reserve -=
        moved;
      p.arms.reloadDoneAt = 0;
      ev.push(
        {
          type: 'reloaded',
          playerId:
            p.id,
          weapon:
            g.id,
        },
      );
    }
    if (
      p.heat >
        0 &&
      w.tick %
        HEAT_DECAY_TICKS ===
        0
    )
      p.heat =
        Math.max(
          0,
          p.heat -
            1,
        );
    if (
      p.hp <
        MAX_HP &&
      w.tick -
        p
          .arms
          .lastHitTick >=
        REGEN_DELAY &&
      w.tick %
        REGEN_TICKS ===
        0
    )
      p.hp += 1;
  }
}
