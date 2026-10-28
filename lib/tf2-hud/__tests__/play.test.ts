import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_STATE, type TestState } from '../fixtures';
import { interpretCommand } from '../play/commands';
import { press, tick } from '../play/sim';

const state = (patch: Partial<TestState> = {}): TestState => ({ ...DEFAULT_TEST_STATE, ...patch });

describe('button commands', () => {
  it('maps dismiss commands to back', () => {
    for (const c of ['close', 'Cancel', 'vguicancel', 'cancelmenu', 'OKAY']) {
      expect(interpretCommand(c)).toEqual({ type: 'back' });
    }
  });

  it('opens the screens the default HUD buttons name', () => {
    expect(interpretCommand('openloadout')).toEqual({ type: 'page', page: 'loadout' });
    expect(interpretCommand('engine open_charinfo')).toEqual({ type: 'page', page: 'loadout' });
    expect(interpretCommand('OpenAchievementsDialog')).toEqual({
      type: 'page',
      page: 'achievements',
    });
    expect(interpretCommand('jointeam spectate')).toEqual({ type: 'page', page: 'spectator' });
  });

  it('team then class flow', () => {
    expect(interpretCommand('jointeam blue')).toEqual({
      type: 'team',
      team: 'blue',
      then: 'classselect',
    });
    expect(interpretCommand('jointeam auto')).toEqual({
      type: 'team',
      team: null,
      then: 'classselect',
    });
    expect(interpretCommand('select 5')).toEqual({ type: 'class', cls: 'medic' });
    expect(interpretCommand('select 1')).toEqual({ type: 'class', cls: 'scout' });
  });

  it('reports what it does not simulate', () => {
    expect(interpretCommand('callvote')).toEqual({ type: 'unknown', raw: 'callvote' });
    expect(interpretCommand('')).toEqual({ type: 'unknown', raw: '' });
    expect(interpretCommand(undefined)).toEqual({ type: 'unknown', raw: '' });
    expect(interpretCommand('select 12').type).toBe('unknown');
  });
});

describe('match simulator', () => {
  it('fires, reloads and runs dry', () => {
    let s = state({ playerClass: 'scout', ammoClip: 1, ammoReserve: 10 });
    expect(press(s, 'f')!.patch).toEqual({ ammoClip: 0 });
    s = state({ playerClass: 'scout', ammoClip: 0, ammoReserve: 10 });
    expect(press(s, 'f')).toBeNull();
    expect(press(s, 'r')!.patch).toEqual({ ammoClip: 6, ammoReserve: 4 });
    expect(press(state({ ammoClip: 6 }), 'r')).toBeNull();
  });

  it('classes without a clip fire from the reserve', () => {
    const s = state({ playerClass: 'heavy', ammoClip: 0, ammoReserve: 100 });
    expect(press(s, 'f')!.patch).toEqual({ ammoReserve: 99 });
  });

  it('damage, healing, death and respawn', () => {
    expect(press(state({ health: 100 }), 'h')).toMatchObject({
      patch: { health: 75 },
      pulse: { event: 'damage' },
    });
    expect(press(state({ health: 10 }), 'h')!.patch.health).toBe(0);
    expect(press(state({ health: 100, maxHealth: 125 }), 'j')!.patch.health).toBe(125);
    expect(press(state({ health: 125, maxHealth: 125 }), 'j')).toBeNull();
    expect(press(state({ health: 50 }), 'k')!.patch.health).toBe(0);
    const respawn = press(state({ health: 0, playerClass: 'scout', maxHealth: 125 }), 'k')!;
    expect(respawn.patch).toMatchObject({ health: 125, ammoClip: 6, ammoReserve: 32 });
  });

  it('does nothing but respawn while dead', () => {
    const dead = state({ health: 0 });
    expect(press(dead, 'f')).toBeNull();
    expect(press(dead, 'h')).toBeNull();
    expect(press(dead, 'k')).not.toBeNull();
  });

  it('switches weapons by slot', () => {
    const s = state({ playerClass: 'scout', weapon: 'auto' });
    expect(press(s, '2')!.patch.weapon).toBe('bonk');
    expect(press(state({ playerClass: 'scout', weapon: 'bonk' }), '2')).toBeNull();
    expect(press(s, '9')).toBeNull();
  });

  it('time runs the round clock down, builds a Medic charge and fills a meter', () => {
    expect(tick(state({ roundSeconds: 100 }), 1)!.roundSeconds).toBe(99);
    expect(
      tick(state({ roundSeconds: 0, playerClass: 'scout', weapon: 'scattergun' }), 1),
    ).toBeNull();
    const medic = state({ playerClass: 'medic', weapon: 'medigun', charge: 10, roundSeconds: 99 });
    expect(tick(medic, 1)!.charge).toBe(12.5);
    expect(tick(state({ ...medic, charge: 99 }), 1)!.charge).toBe(100);
    expect(tick(state({ ...medic, charge: 100, roundSeconds: 0 }), 1)).toBeNull();
    const bonk = state({ playerClass: 'scout', weapon: 'bonk', meter: 10, roundSeconds: 99 });
    expect(tick(bonk, 1)!.meter).toBe(15);
    expect(tick(state({ ...bonk, health: 0, roundSeconds: 0 }), 1)).toBeNull();
  });
});

describe('armed button colours', () => {
  it('a hovered button takes its armed colours, and others are untouched', async () => {
    const { propsFromMap } = await import('../kv/props');
    const { armedStyle } = await import('../play/style');
    const props = propsFromMap({
      defaultFgColor_override: 'White',
      armedFgColor_override: 'Orange',
      armedBgColor_override: 'Black',
    });
    const style = armedStyle({ file: 'resource/ui/a.res', name: 'Btn' })!;
    const hot = style('resource/ui/a.res', 'Btn', props);
    expect(hot.get('defaultfgcolor_override')).toBe('Orange');
    expect(hot.get('bgcolor_override')).toBe('Black');
    expect(style('resource/ui/a.res', 'Other', props)).toBe(props);
    expect(style('resource/ui/b.res', 'Btn', props)).toBe(props);
    expect(armedStyle(null)).toBeUndefined();
  });
});
