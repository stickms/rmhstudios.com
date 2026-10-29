/**
 * Map logic entities on a synthetic room (no game files needed): the
 * logic_* and math_* entities' outputs and the values they pass (the SDK's
 * variant float formatting), team_round_timer's setup → normal flow and
 * AddTime, tf_logic_koth's team timers, mode detection on entity sets, and
 * a round restart recreating the map's entities.
 */
import { describe, expect, it } from 'vitest';
import { TF_CLASS_SOLDIER, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { BspEntity } from '../../formats/keyvalues';
import { BoxWorld, roomBrushes } from '../__fixtures__/box-world';
import { Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { GR_STATE_RND_RUNNING } from '../rules';
import { GameWorld } from '../world';
import { createGameModeForMap } from '../modes';
import { formatFloat, MathCounter, objectives, registerMapEntities, TeamRoundTimer } from '.';

class LogRecorder extends Entity {
  static log: string[] = [];
  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    LogRecorder.log.push(`${input}:${value}`);
    return super.acceptInput(input, value, activator, caller) || true;
  }
}
registerEntityClass('test_logic_recorder', LogRecorder);

const kv = (pairs: Record<string, string>, outputs: Array<[string, string]> = []): BspEntity =>
  new BspEntity([...Object.entries(pairs), ...outputs]);

function room(extra: BspEntity[]): GameWorld {
  registerMapEntities();
  const world = new GameWorld({
    collision: new BoxWorld(roomBrushes(1024, 512)),
    entities: [
      kv({ classname: 'worldspawn' }),
      kv({ classname: 'info_player_teamspawn', origin: '-600 0 8', TeamNum: '2' }),
      kv({ classname: 'info_player_teamspawn', origin: '600 0 8', TeamNum: '3' }),
      kv({ classname: 'test_logic_recorder', targetname: 'rec' }),
      ...extra,
    ],
    options: { seed: 5, lagCompensation: false, rules: { bonusRoundTime: 2 } },
  });
  world.setMode(createGameModeForMap(world));
  return world;
}

function players(world: GameWorld): void {
  for (const team of [TF_TEAM_RED, TF_TEAM_BLUE]) {
    const p = world.addPlayer(`p${team}`, { bot: true });
    p.requestTeam(team);
    p.requestClass(TF_CLASS_SOLDIER);
  }
}

const steps = (world: GameWorld, n: number): void => {
  for (let i = 0; i < n; i++) world.step();
};
const fire = (world: GameWorld, target: string, input: string, value = ''): void => {
  world.io.addEvent(target, input, value, 0, null, null);
  steps(world, 1);
};

describe('variant float formatting (%g)', () => {
  it('matches the SDK string forms', () => {
    expect(formatFloat(1)).toBe('1');
    expect(formatFloat(0.5)).toBe('0.5');
    expect(formatFloat(-3.25)).toBe('-3.25');
    expect(formatFloat(1 / 3)).toBe('0.333333');
    expect(formatFloat(1234567)).toBe('1.23457e+06');
    expect(formatFloat(123456)).toBe('123456');
    expect(formatFloat(0.0001)).toBe('0.0001');
    expect(formatFloat(0.00001)).toBe('1e-05');
    expect(formatFloat(-0.0000001)).toBe('-1e-07');
    expect(formatFloat(2.5e-3)).toBe('0.0025');
  });
});

describe('math_counter', () => {
  it('clamps to min/max, fires OnHitMax/OnHitMin once per hit and passes OutValue', () => {
    LogRecorder.log = [];
    const world = room([
      kv({ classname: 'math_counter', targetname: 'cnt', startvalue: '1', min: '0', max: '3' }, [
        ['OnHitMax', 'rec,Max,,0,-1'],
        ['OnHitMin', 'rec,Min,,0,-1'],
        ['OutValue', 'rec,Out,,0,-1'],
      ]),
    ]);
    steps(world, 1);
    fire(world, 'cnt', 'Add', '1');
    fire(world, 'cnt', 'Add', '5');
    fire(world, 'cnt', 'Subtract', '0.5');
    fire(world, 'cnt', 'Subtract', '10');
    fire(world, 'cnt', 'GetValue');
    steps(world, 2);
    expect(LogRecorder.log).toEqual(['Out:2', 'Max:', 'Out:3', 'Out:2.5', 'Min:', 'Out:0']);
    const cnt = world.findByName('cnt') as MathCounter;
    expect(cnt.value).toBe(0);
  });
});

describe('logic_case / logic_compare / logic_branch / math_remap', () => {
  it('route values to the matching outputs', () => {
    LogRecorder.log = [];
    const world = room([
      kv({ classname: 'logic_case', targetname: 'case', Case01: 'red', Case02: '2' }, [
        ['OnCase01', 'rec,Case1,,0,-1'],
        ['OnCase02', 'rec,Case2,,0,-1'],
        ['OnDefault', 'rec,Default,,0,-1'],
      ]),
      kv({ classname: 'logic_compare', targetname: 'cmp', InitialValue: '0', CompareValue: '5' }, [
        ['OnLessThan', 'rec,Less,,0,-1'],
        ['OnEqualTo', 'rec,Equal,,0,-1'],
        ['OnGreaterThan', 'rec,Greater,,0,-1'],
      ]),
      kv({ classname: 'logic_branch', targetname: 'br', InitialValue: '0' }, [
        ['OnTrue', 'rec,True,,0,-1'],
        ['OnFalse', 'rec,False,,0,-1'],
      ]),
      kv(
        { classname: 'math_remap', targetname: 'remap', in1: '0', in2: '10', out1: '0', out2: '1' },
        [['OutValue', 'rec,Remap,,0,-1']],
      ),
    ]);
    steps(world, 1);
    fire(world, 'case', 'InValue', 'red');
    fire(world, 'case', 'InValue', '2');
    fire(world, 'case', 'InValue', 'blue');
    fire(world, 'cmp', 'SetValueCompare', '7');
    fire(world, 'cmp', 'SetValueCompare', '5');
    fire(world, 'cmp', 'SetValueCompare', '-1');
    fire(world, 'br', 'Test');
    fire(world, 'br', 'Toggle');
    fire(world, 'br', 'Test');
    fire(world, 'remap', 'InValue', '2.5');
    steps(world, 2);
    expect(LogRecorder.log).toEqual([
      'Case1:',
      'Case2:',
      'Default:blue',
      'Greater:7',
      'Equal:5',
      'Less:-1',
      // Toggle flips without firing; only Test (and ToggleTest) fire.
      'False:',
      'True:',
      'Remap:0.25',
    ]);
  });
});

describe('team_round_timer', () => {
  it('runs setup, fires OnSetupFinished, ends setup in the rules, and adds time', () => {
    LogRecorder.log = [];
    const world = room([
      kv(
        {
          classname: 'team_round_timer',
          targetname: 'timer',
          timer_length: '120',
          setup_length: '5',
          auto_countdown: '1',
          show_in_hud: '1',
          start_paused: '0',
        },
        [
          ['OnSetupFinished', 'rec,SetupDone,,0,-1'],
          ['OnFinished', 'rec,Finished,,0,-1'],
        ],
      ),
    ]);
    players(world);
    for (let i = 0; i < 4000 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    expect(world.rules.state).toBe(GR_STATE_RND_RUNNING);
    const timer = world.findByName('timer') as TeamRoundTimer;
    expect(world.rules.inSetup).toBe(true);
    for (let i = 0; i < 2000 && world.rules.inSetup; i++) world.step();
    expect(world.rules.inSetup).toBe(false);
    expect(LogRecorder.log).toContain('SetupDone:');
    expect(timer.getTimeRemaining()).toBeGreaterThan(118);
    expect(timer.getTimeRemaining()).toBeLessThanOrEqual(120);
    const before = timer.getTimeRemaining();
    fire(world, 'timer', 'AddTime', '30');
    expect(timer.getTimeRemaining()).toBeCloseTo(before + 30 - world.frametime, 3);
    fire(world, 'timer', 'Pause');
    const paused = timer.getTimeRemaining();
    steps(world, 66);
    expect(timer.getTimeRemaining()).toBe(paused);
  });
});

describe('mode detection from entities', () => {
  it('reads the mode from the map logic entities', () => {
    expect(
      room([kv({ classname: 'tf_logic_koth', timer_length: '180', unlock_point: '30' })]).rules.mode
        ?.name,
    ).toBe('koth');
    expect(room([kv({ classname: 'tf_logic_arena', CapEnableDelay: '60' })]).rules.mode?.name).toBe(
      'arena',
    );
    expect(room([]).rules.mode?.name).toBe('');
  });
});

describe('round restart', () => {
  it('recreates the map entities on a full reset and keeps the objective resource', () => {
    const world = room([
      kv({ classname: 'math_counter', targetname: 'cnt', startvalue: '1', max: '10' }),
    ]);
    players(world);
    for (let i = 0; i < 4000 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    const cnt = world.findByName('cnt') as MathCounter;
    fire(world, 'cnt', 'Add', '4');
    expect(cnt.value).toBe(5);
    const resource = objectives(world).resource;
    world.rules.setWinningTeam(TF_TEAM_RED, 1, true);
    for (let i = 0; i < 4000 && world.findByName('cnt') === cnt; i++) world.step();
    const again = world.findByName('cnt') as MathCounter;
    expect(again).not.toBe(cnt);
    expect(cnt.removed).toBe(true);
    expect(again.value).toBe(1);
    expect(objectives(world).resource).toBe(resource);
  });
});

describe('SetHealth on a player (pit kill triggers)', () => {
  it('kills through the damage path, as CBaseEntity::InputSetHealth does', () => {
    const world = room([]);
    players(world);
    for (let i = 0; i < 4000 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    let victim: Entity | null = null;
    world.forEachPlayer((p) => {
      if (p.team === TF_TEAM_RED) victim = p;
    });
    const p = victim! as Entity & { alive: boolean };
    expect(p.alive).toBe(true);
    p.acceptInput('SetHealth', '-1000', p, null);
    expect(p.alive).toBe(false);
  });
});
