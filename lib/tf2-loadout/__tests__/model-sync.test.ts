import { describe, expect, it } from 'vitest';
import {
  emptyState,
  nextState,
  parseState,
  planSync,
  shouldRun,
  type ModelState,
} from '../model-sync';

const state = (over: Partial<ModelState> = {}): ModelState => ({
  ...emptyState(1),
  steamBuild: '100',
  models: { '13': { src: 'a', size: 10 }, '940_soldier': { src: 'b', size: 20 } },
  ...over,
});

describe('shouldRun', () => {
  it('skips everything when the game build and converter are unchanged', () => {
    expect(shouldRun(state(), '100', { builder: 1 }).run).toBe(false);
  });
  it.each([
    ['a new game build', state(), '101', {}],
    ['an unreadable build id', state(), null, {}],
    ['a changed converter', state({ builder: 0 }), '100', {}],
    ['nothing published yet', emptyState(1), '100', {}],
    ['a forced run', state(), '100', { force: true }],
  ] as [string, ModelState, string | null, { force?: boolean }][])(
    'runs for %s',
    (_n, s, build, opts) => {
      expect(shouldRun(s, build, { builder: 1, ...opts }).run).toBe(true);
    },
  );
});

describe('planSync', () => {
  it('uploads only new and changed models, and reports the rest as unchanged', () => {
    const plan = planSync(state(), [
      { name: '13', src: 'a' }, // identical
      { name: '940_soldier', src: 'changed' }, // changed
      { name: '1104', src: 'new' }, // new
    ]);
    expect(plan.upload.map((u) => u.name)).toEqual(['940_soldier', '1104']);
    expect(plan.unchanged).toBe(1);
    expect(plan.stale).toEqual([]);
  });
  it('lists models that left the schema without removing them', () => {
    expect(planSync(state(), [{ name: '13', src: 'a' }]).stale).toEqual(['940_soldier']);
  });
  it('a second run over the same input uploads nothing', () => {
    const wanted = [
      { name: '13', src: 'a' },
      { name: '940_soldier', src: 'b' },
    ];
    expect(planSync(state(), wanted).upload).toEqual([]);
  });
});

describe('state', () => {
  it('merges what was published and drops what was pruned', () => {
    const next = nextState(
      state(),
      { '1104': { src: 'n', size: 5 } },
      '101',
      ['13'],
      1,
      new Date('2026-01-01'),
    );
    expect(Object.keys(next.models).sort()).toEqual(['1104', '940_soldier']);
    expect(next.steamBuild).toBe('101');
    expect(next.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
  it('treats a missing or corrupt state file as empty', () => {
    expect(parseState(null).models).toEqual({});
    expect(parseState('{nope').models).toEqual({});
    expect(parseState(JSON.stringify(state())).models['13']?.src).toBe('a');
  });
});
