/** The single-player server half of the console (SpServerConsole): cheats, level changes, saves. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  FL_NOTARGET,
  MOVETYPE_NOCLIP,
  MOVETYPE_WALK,
} from '@/lib/tf2-game/core/constants';
import {
  DAMAGE_NO,
  DAMAGE_YES,
} from '@/lib/tf2-game/sim/entity';
import { SpServerConsole } from './sp-server';

describe('single-player server half', () => {
  function fakeWorld() {
    const player =
      {
        id: 1,
        health: 100,
        maxHealth: 100,
        armor: 0,
        hasSuit: false,
        portalgun:
          null as null | {
            canFire1: boolean;
            canFire2: boolean;
            nextFire: number;
          },
        takeDamage:
          DAMAGE_YES,
        flags: 0,
        dead: false,
        buddha: false,
        origin:
          {
            x: 0,
            y: 0,
            z: 0,
          },
        eyeAngles:
          {
            x: 0,
            y: 0,
            z: 0,
          },
        velocity:
          {
            x: 0,
            y: 0,
            z: 0,
          },
        move: {
          moveType:
            MOVETYPE_WALK,
        },
        placeAt(
          o: {
            x: number;
            y: number;
            z: number;
          },
          a: {
            x: number;
            y: number;
            z: number;
          } | null,
        ) {
          Object.assign(
            this
              .origin,
            o,
          );
          if (
            a
          )
            Object.assign(
              this
                .eyeAngles,
              a,
            );
        },
        die() {
          this.dead = true;
        },
      };
    let saved = 0;
    const world =
      {
        player,
        mapName:
          'testchmb_a_00',
        curtime: 1,
        checkpoint:
          null as
            | null
            | object,
        portals:
          {},
        saveCheckpoint() {
          saved++;
          this.checkpoint =
            {};
        },
        reloadAfterDeath() {},
        damage(
          p: typeof player,
          n: number,
        ) {
          p.health -=
            n;
        },
      };
    return {
      world,
      player,
      saved:
        () =>
          saved,
    };
  }

  it('is its own host: sets sv_cheats, gates cheats, runs them on the world', () => {
    const printed: string[] =
      [];
    const cvars: Array<
      [
        string,
        string,
      ]
    > =
      [];
    const loads: string[] =
      [];
    const sp =
      new SpServerConsole(
        'portal',
        {
          print:
            (
              t,
            ) =>
              printed.push(
                t,
              ),
          cvar: (
            n,
            v,
          ) =>
            cvars.push(
              [
                n,
                v,
              ],
            ),
          changeLevel:
            (
              m,
            ) => (
              loads.push(
                m,
              ),
              true
            ),
          maps: () => [
            'testchmb_a_00',
            'testchmb_a_01',
          ],
        },
      );
    const f =
      fakeWorld();
    sp.bind(
      f.world as never,
    );
    sp.execute(
      'noclip',
      [],
    );
    expect(
      printed.at(
        -1,
      ),
    ).toContain(
      "Can't use cheat command noclip",
    );
    sp.execute(
      'sv_cheats',
      [
        '1',
      ],
    );
    expect(
      cvars,
    ).toContainEqual(
      [
        'sv_cheats',
        '1',
      ],
    );
    sp.execute(
      'noclip',
      [],
    );
    expect(
      f
        .player
        .move
        .moveType,
    ).toBe(
      MOVETYPE_NOCLIP,
    );
    sp.execute(
      'god',
      [],
    );
    expect(
      f
        .player
        .takeDamage,
    ).toBe(
      DAMAGE_NO,
    );
    sp.execute(
      'notarget',
      [],
    );
    expect(
      f
        .player
        .flags &
        FL_NOTARGET,
    ).not.toBe(
      0,
    );
    sp.execute(
      'impulse',
      [
        101,
      ],
    );
    expect(
      f
        .player
        .portalgun,
    ).toEqual(
      {
        canFire1: true,
        canFire2: true,
        nextFire: 0,
      },
    );
    sp.execute(
      'setpos',
      [
        '10',
        '20',
        '30',
      ],
    );
    expect(
      f
        .player
        .origin,
    ).toEqual(
      {
        x: 10,
        y: 20,
        z: 30,
      },
    );
    sp.execute(
      'host_timescale',
      [
        '0.5',
      ],
    );
    expect(
      sp.timescale,
    ).toBe(
      0.5,
    );
    sp.execute(
      'changelevel',
      [
        'testchmb_a_01',
      ],
    );
    sp.execute(
      'changelevel',
      [
        'd1_trainstation_01',
      ],
    );
    expect(
      loads,
    ).toEqual(
      [
        'testchmb_a_01',
      ],
    );
    sp.execute(
      'save',
      [],
    );
    expect(
      f.saved(),
    ).toBe(
      1,
    );
    // A new level's player gets the toggles back.
    const g =
      fakeWorld();
    sp.bind(
      g.world as never,
    );
    expect(
      g
        .player
        .move
        .moveType,
    ).toBe(
      MOVETYPE_NOCLIP,
    );
    expect(
      g
        .player
        .takeDamage,
    ).toBe(
      DAMAGE_NO,
    );
    // sv_cheats 0 ends them and resets the cheat cvars.
    sp.execute(
      'sv_cheats',
      [
        '0',
      ],
    );
    expect(
      g
        .player
        .move
        .moveType,
    ).toBe(
      MOVETYPE_WALK,
    );
    expect(
      g
        .player
        .takeDamage,
    ).toBe(
      DAMAGE_YES,
    );
    expect(
      sp.timescale,
    ).toBe(
      1,
    );
    expect(
      sp.execute(
        'not_a_command',
        [],
      ),
    ).toBe(
      false,
    );
    expect(
      sp.execute(
        'setpos',
        [
          '\u0000',
        ],
      ),
    ).toBe(
      true,
    );
  });
});
