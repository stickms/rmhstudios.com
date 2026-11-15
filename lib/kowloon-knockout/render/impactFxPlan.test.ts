import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  ImpactBus,
  impactProfile,
  type ImpactEvent,
} from './impact';
import {
  BLOCK_COLOR,
  KO_COLOR,
  flashAt,
  planImpactFx,
  ringAt,
  sparkVelocity,
  streakLength,
  type PlanOptions,
} from './impactFxPlan';

const OPTS: PlanOptions =
  {
    sparkBudget: 200,
    lite: false,
  };
const ev =
  (
    over: Partial<ImpactEvent> = {},
  ): ImpactEvent => ({
    kind: 'hit',
    victim: 1,
    attacker: 0,
    power: 14,
    x: 1,
    y: 1.1,
    z: 0,
    dirX: 1,
    dirZ: 0,
    color:
      '#ff2e88',
    ...over,
  });
const plan =
  (
    e: ImpactEvent,
    o: Partial<PlanOptions> = {},
  ) =>
    planImpactFx(
      e,
      impactProfile(
        e.kind,
        e.power,
      ),
      {
        ...OPTS,
        ...o,
      },
    );
const total =
  (
    p: ReturnType<
      typeof plan
    >,
  ) =>
    p.sparks.reduce(
      (
        n,
        s,
      ) =>
        n +
        s.count,
      0,
    );

describe('a hit', () => {
  it('sends a ground shockwave and a camera-facing ring, sparks in the attacker colour along the blow', () => {
    const p =
      plan(
        ev(),
      );
    expect(
      p.rings.map(
        (
          r,
        ) =>
          r.kind,
      ),
    ).toEqual(
      [
        'ground',
        'contact',
      ],
    );
    expect(
      p
        .rings[0]
        .color,
    ).toBe(
      '#ff2e88',
    );
    expect(
      p.flash,
    ).not.toBeNull();
    const main =
      p
        .sparks[0];
    expect(
      main.color,
    ).toBe(
      '#ff2e88',
    );
    expect(
      main.dirX,
    ).toBe(
      1,
    );
    expect(
      p.sparks.some(
        (
          s,
        ) =>
          s.color ===
          '#ffffff',
      ),
    ).toBe(
      true,
    ); // a few hot white ones
  });
  it('a harder hit is a bigger ring and more, faster sparks', () => {
    const soft =
      plan(
        ev(
          {
            power: 4,
          },
        ),
      );
    const hard =
      plan(
        ev(
          {
            power: 40,
          },
        ),
      );
    expect(
      hard
        .rings[0]
        .size,
    ).toBeGreaterThan(
      soft
        .rings[0]
        .size,
    );
    expect(
      total(
        hard,
      ),
    ).toBeGreaterThan(
      total(
        soft,
      ),
    );
    expect(
      hard
        .sparks[0]
        .speedMax,
    ).toBeGreaterThan(
      soft
        .sparks[0]
        .speedMax,
    );
  });
  it('falls back to gold when the attacker colour is unknown', () => {
    expect(
      plan(
        ev(
          {
            color:
              undefined,
          },
        ),
      )
        .rings[0]
        .color,
    ).toBe(
      '#ffcc00',
    );
  });
});

describe('a block', () => {
  const block =
    plan(
      ev(
        {
          kind: 'block',
          attacker:
            null,
          power: 9,
          color:
            undefined,
        },
      ),
    );
  const hit =
    plan(
      ev(
        {
          power: 9,
        },
      ),
    );
  it('is a small hard ring at the guard and no ground shockwave', () => {
    expect(
      block.rings.map(
        (
          r,
        ) =>
          r.kind,
      ),
    ).toEqual(
      [
        'contact',
      ],
    );
    expect(
      block
        .rings[0]
        .color,
    ).toBe(
      BLOCK_COLOR,
    );
    expect(
      block
        .rings[0]
        .size,
    ).toBeLessThan(
      hit
        .rings[0]
        .size,
    );
  });
  it('shoots a tight, cool, fast forward shower', () => {
    expect(
      block.sparks,
    ).toHaveLength(
      1,
    );
    expect(
      block
        .sparks[0]
        .color,
    ).toBe(
      BLOCK_COLOR,
    );
    expect(
      block
        .sparks[0]
        .spread,
    ).toBeLessThan(
      hit
        .sparks[0]
        .spread,
    );
    expect(
      block
        .sparks[0]
        .lifeMax,
    ).toBeLessThan(
      hit
        .sparks[0]
        .lifeMax,
    );
    expect(
      block
        .sparks[0]
        .count,
    ).toBeGreaterThanOrEqual(
      18,
    );
  });
});

describe('a knockout', () => {
  const ko =
    plan(
      ev(
        {
          kind: 'ko',
          power: 34,
          color:
            undefined,
        },
      ),
    );
  it('is one huge golden ring and the biggest burst, every direction', () => {
    expect(
      ko
        .rings[0],
    ).toMatchObject(
      {
        kind: 'ground',
        color:
          KO_COLOR,
      },
    );
    const bigHit =
      plan(
        ev(
          {
            power: 45,
          },
        ),
      );
    expect(
      ko
        .rings[0]
        .size,
    ).toBeGreaterThan(
      bigHit
        .rings[0]
        .size,
    );
    expect(
      total(
        ko,
      ),
    ).toBeGreaterThan(
      total(
        bigHit,
      ),
    );
    expect(
      ko
        .sparks[0]
        .spread,
    ).toBe(
      1,
    );
  });
});

describe('budgets and the calm / lite modes', () => {
  it('never plans more sparks than the pool can take', () => {
    for (const budget of [
      0,
      3,
      10,
      500,
    ]) {
      for (const kind of [
        'hit',
        'block',
        'ko',
      ] as const) {
        expect(
          total(
            plan(
              ev(
                {
                  kind,
                },
              ),
              {
                sparkBudget:
                  budget,
              },
            ),
          ),
        ).toBeLessThanOrEqual(
          budget,
        );
      }
    }
    expect(
      total(
        plan(
          ev(),
          {
            sparkBudget:
              -5,
          },
        ),
      ),
    ).toBe(
      0,
    );
  });
  it('lite drops the contact ring but keeps the shockwave', () => {
    const p =
      plan(
        ev(),
        {
          lite: true,
        },
      );
    expect(
      p.rings.map(
        (
          r,
        ) =>
          r.kind,
      ),
    ).toEqual(
      [
        'ground',
      ],
    );
  });
  it('a calm impact (Jelly motion Still) plans sparks only: no ring, no flash', () => {
    const bus =
      new ImpactBus();
    let calm =
      null as ReturnType<
        typeof plan
      > | null;
    bus.subscribe(
      (
        e,
        prof,
      ) => {
        calm =
          planImpactFx(
            e,
            prof,
            OPTS,
          );
      },
    );
    bus.emitCalm(
      ev(
        {
          power: 40,
        },
      ),
    );
    expect(
      calm!
        .rings,
    ).toEqual(
      [],
    );
    expect(
      calm!
        .flash,
    ).toBeNull();
    expect(
      total(
        calm!,
      ),
    ).toBeGreaterThan(
      0,
    );
    expect(
      total(
        calm!,
      ),
    ).toBeLessThanOrEqual(
      8,
    );
  });
});

describe('motion curves', () => {
  it('a ring flies out fast, slows, and fades to nothing at the end of its life', () => {
    const a =
      ringAt(
        0.05,
        0.4,
        3,
      );
    const b =
      ringAt(
        0.2,
        0.4,
        3,
      );
    const c =
      ringAt(
        0.4,
        0.4,
        3,
      );
    expect(
      a.radius,
    ).toBeGreaterThan(
      0.5,
    ); // already well out after an eighth of its life
    expect(
      b.radius -
        a.radius,
    ).toBeLessThan(
      a.radius *
        3,
    ); // decelerating
    expect(
      c.radius,
    ).toBeCloseTo(
      3,
    );
    expect(
      c.fade,
    ).toBe(
      0,
    );
    expect(
      a.fade,
    ).toBeGreaterThan(
      b.fade,
    );
    expect(
      ringAt(
        -1,
        0.4,
        3,
      ),
    ).toEqual(
      {
        radius: 0,
        fade: 1,
      },
    );
    expect(
      ringAt(
        1,
        0,
        3,
      )
        .fade,
    ).toBe(
      0,
    );
  });
  it('the flash swells quickly and is gone by the end', () => {
    expect(
      flashAt(
        0,
        0.12,
        1,
      )
        .radius,
    ).toBeCloseTo(
      0.35,
    );
    expect(
      flashAt(
        0.12,
        0.12,
        1,
      ),
    ).toMatchObject(
      {
        radius: 1,
        fade: 0,
      },
    );
    expect(
      flashAt(
        0.03,
        0.12,
        1,
      )
        .fade,
    ).toBeGreaterThan(
      flashAt(
        0.09,
        0.12,
        1,
      )
        .fade,
    );
  });
  it('spark velocity: speed within range, biased along the blow and upward, tighter cone for a smaller spread', () => {
    const base =
      {
        count: 1,
        speedMin: 4,
        speedMax: 8,
        up: 0.3,
        dirX: 1,
        dirZ: 0,
        lifeMin: 0.2,
        lifeMax: 0.4,
        color:
          '#fff',
      };
    const tight =
      {
        ...base,
        spread: 0.2,
      };
    const loose =
      {
        ...base,
        spread: 1,
      };
    let tightAlong = 0,
      looseAlong = 0;
    const N = 200;
    for (
      let i = 0;
      i <
      N;
      i++
    ) {
      const r =
        [
          Math.random(),
          Math.random(),
          Math.random(),
        ] as const;
      const vt =
        sparkVelocity(
          tight,
          ...r,
        );
      const vl =
        sparkVelocity(
          loose,
          ...r,
        );
      for (const v of [
        vt,
        vl,
      ]) {
        const sp =
          Math.hypot(
            ...v,
          );
        expect(
          sp,
        ).toBeGreaterThanOrEqual(
          4 -
            1e-9,
        );
        expect(
          sp,
        ).toBeLessThanOrEqual(
          8 +
            1e-9,
        );
      }
      tightAlong +=
        vt[0] /
        Math.hypot(
          ...vt,
        );
      looseAlong +=
        vl[0] /
        Math.hypot(
          ...vl,
        );
    }
    expect(
      tightAlong /
        N,
    ).toBeGreaterThan(
      0.85,
    );
    expect(
      looseAlong /
        N,
    ).toBeLessThan(
      tightAlong /
        N,
    );
    expect(
      looseAlong /
        N,
    ).toBeGreaterThan(
      0.2,
    ); // still leans along the blow
  });
  it('spark velocity survives a zero direction and stays finite', () => {
    const v =
      sparkVelocity(
        {
          count: 1,
          speedMin: 1,
          speedMax: 2,
          spread: 0,
          up: 0,
          dirX: 0,
          dirZ: 0,
          lifeMin: 1,
          lifeMax: 1,
          color:
            '#fff',
        },
        0.5,
        0.5,
        0.5,
      );
    expect(
      v.every(
        Number.isFinite,
      ),
    ).toBe(
      true,
    );
  });
  it('streaks are longer for faster sparks and capped', () => {
    expect(
      streakLength(
        10,
      ),
    ).toBeGreaterThan(
      streakLength(
        3,
      ),
    );
    expect(
      streakLength(
        1000,
      ),
    ).toBe(
      0.55,
    );
    expect(
      streakLength(
        0,
      ),
    ).toBeGreaterThan(
      0,
    );
  });
});
