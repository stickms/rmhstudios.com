import { describe, expect, it } from 'vitest';
import { explainFlag } from '../evaluate';
import { MAX_TARGET_IDS, applyListEdit, describeListEdit } from '../targeting';

const lists = (allow: string[] = [], deny: string[] = []) => ({
  allow,
  deny,
});

describe('applyListEdit', () => {
  it('adds ids to the named list and ignores ones already there', () => {
    const r = applyListEdit(lists(['a']), {
      list: 'allow',
      add: ['a', 'b', 'b'],
      remove: [],
    });
    expect(r).toMatchObject({
      ok: true,
      lists: lists(['a', 'b']),
      added: ['b'],
      removed: [],
      moved: [],
    });
  });

  it('removes ids, and only reports the ones that were there', () => {
    const r = applyListEdit(lists(['a', 'b']), {
      list: 'allow',
      add: [],
      remove: ['a', 'z'],
    });
    expect(r).toMatchObject({
      ok: true,
      lists: lists(['b']),
      removed: ['a'],
    });
  });

  it('never leaves a member in both lists: adding to one removes from the other', () => {
    const r = applyListEdit(lists(['a'], ['b', 'c']), {
      list: 'allow',
      add: ['b'],
      remove: [],
    });
    expect(r).toMatchObject({
      ok: true,
      lists: lists(['a', 'b'], ['c']),
      added: ['b'],
      moved: ['b'],
    });
    const back = applyListEdit(lists(['a', 'b'], ['c']), {
      list: 'deny',
      add: ['a'],
      remove: [],
    });
    expect(back).toMatchObject({
      ok: true,
      lists: lists(['b'], ['c', 'a']),
      moved: ['a'],
    });
  });

  it('removes before it adds, so one edit can re-add an id', () => {
    const r = applyListEdit(lists(['a']), {
      list: 'allow',
      add: ['a'],
      remove: ['a'],
    });
    expect(r).toMatchObject({
      ok: true,
      lists: lists(['a']),
      added: ['a'],
      removed: ['a'],
    });
  });

  it('refuses an edit that would pass 200 members and changes nothing', () => {
    const full = Array.from(
      {
        length: MAX_TARGET_IDS,
      },
      (_, i) => `u${i}`,
    );
    expect(
      applyListEdit(lists(full), {
        list: 'allow',
        add: ['extra'],
        remove: [],
      }),
    ).toEqual({
      ok: false,
      code: 'full',
      list: 'allow',
    });
    // 200 exactly is fine, and a removal in the same edit makes room.
    expect(
      applyListEdit(lists(full.slice(1)), {
        list: 'allow',
        add: ['extra'],
        remove: [],
      }).ok,
    ).toBe(true);
    expect(
      applyListEdit(lists(full), {
        list: 'allow',
        add: ['extra'],
        remove: ['u0'],
      }).ok,
    ).toBe(true);
    // The other list's size is not the added list's problem.
    expect(
      applyListEdit(lists([], full), {
        list: 'allow',
        add: ['x'],
        remove: [],
      }).ok,
    ).toBe(true);
  });

  it('does not mutate its input', () => {
    const input = lists(['a'], ['b']);
    applyListEdit(input, {
      list: 'allow',
      add: ['b'],
      remove: ['a'],
    });
    expect(input).toEqual(lists(['a'], ['b']));
  });
});

describe('describeListEdit', () => {
  it('names the handles added, removed and moved', () => {
    expect(
      describeListEdit('allow', {
        added: ['@ann', '@bo'],
        removed: ['@cy'],
        moved: ['@ann'],
      }),
    ).toBe('allow +@ann +@bo -@cy; deny -@ann');
    expect(
      describeListEdit('deny', {
        added: [],
        removed: ['@cy'],
        moved: [],
      }),
    ).toBe('deny -@cy');
  });
  it('is null for an edit that changed nothing', () => {
    expect(
      describeListEdit('allow', {
        added: [],
        removed: [],
        moved: [],
      }),
    ).toBeNull();
  });
});

describe('explainFlag reasons', () => {
  const flag = (enabled: boolean, rolloutPercent: number) => ({
    key: 'k',
    enabled,
    rolloutPercent,
  });
  const targeting = {
    allow: new Set(['yes']),
    deny: new Set(['no']),
  };

  it('names each way a flag resolves', () => {
    expect(explainFlag(undefined, 'u')).toEqual({
      on: false,
      reason: {
        code: 'missing',
      },
    });
    expect(explainFlag(flag(false, 100), 'yes', targeting)).toEqual({
      on: false,
      reason: {
        code: 'disabled',
      },
    });
    expect(explainFlag(flag(true, 0), 'no', targeting)).toEqual({
      on: false,
      reason: {
        code: 'denied',
      },
    });
    expect(explainFlag(flag(true, 0), 'yes', targeting)).toEqual({
      on: true,
      reason: {
        code: 'allowed',
      },
    });
    expect(explainFlag(flag(true, 100), 'other', targeting)).toEqual({
      on: true,
      reason: {
        code: 'full',
      },
    });
    expect(explainFlag(flag(true, 50), null, targeting)).toEqual({
      on: false,
      reason: {
        code: 'anonymous',
        percent: 50,
      },
    });
  });

  it('reports the bucket and the percentage it was compared with', () => {
    const r = explainFlag(flag(true, 50), 'someone');
    expect(r.reason.code).toBe('bucket');
    if (r.reason.code === 'bucket') {
      expect(r.reason.percent).toBe(50);
      expect(r.on).toBe(r.reason.bucket < 50);
    }
  });

  it('clamps an out-of-range percentage in the reason', () => {
    expect(explainFlag(flag(true, 250), 'u').reason).toEqual({
      code: 'full',
    });
    expect(explainFlag(flag(true, -5), 'u').reason).toMatchObject({
      code: 'bucket',
      percent: 0,
    });
  });
});
