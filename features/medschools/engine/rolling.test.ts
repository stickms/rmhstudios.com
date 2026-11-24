import { describe, expect, it } from 'vitest';
import { buildRolling, policyProgramOf, type RollingInput, type RollingPolicy } from './rolling';

const pol = (rolling: boolean): RollingPolicy => ({
  rolling,
  evidence: rolling ? 'We review on a rolling basis.' : 'Decisions are sent in March.',
  url: 'https://school.example/admissions',
  checkedOn: '2026-11-20',
});
const item = (slug: string, over: Partial<RollingInput> = {}): RollingInput => ({
  slug,
  schoolName: slug.toUpperCase(),
  degree: 'MD',
  program: 'REG',
  submitted: null,
  policies: {},
  ...over,
});

describe('policyProgramOf', () => {
  it('PHD reads PHD; REG and ANY read REG', () => {
    expect([policyProgramOf('PHD'), policyProgramOf('REG'), policyProgramOf('ANY')]).toEqual(['PHD', 'REG', 'REG']);
  });
});

describe('buildRolling', () => {
  it('orders rolling, then set dates, then unknown, keeping the member order inside each', () => {
    const r = buildRolling([
      item('u1'),
      item('s1', { policies: { REG: pol(false) } }),
      item('r1', { policies: { REG: pol(true) } }),
      item('u2'),
      item('r2', { policies: { REG: pol(true) } }),
      item('s2', { policies: { REG: pol(false) } }),
    ]);
    expect(r.map((e) => e.slug)).toEqual(['r1', 'r2', 's1', 's2', 'u1', 'u2']);
    expect(r.map((e) => e.kind)).toEqual(['rolling', 'rolling', 'set-dates', 'set-dates', 'unknown', 'unknown']);
  });

  it('inside a kind a school not yet submitted comes first; a list (null) keeps its order', () => {
    const p = { REG: pol(true) };
    const t = buildRolling([
      item('done', { submitted: true, policies: p }),
      item('todo', { submitted: false, policies: p }),
      item('done2', { submitted: true, policies: p }),
    ]);
    expect(t.map((e) => e.slug)).toEqual(['todo', 'done', 'done2']);
    const l = buildRolling([item('b', { policies: p }), item('a', { policies: p })]);
    expect(l.map((e) => e.slug)).toEqual(['b', 'a']);
  });

  it('a submitted rolling school still comes before an unsubmitted set-dates one', () => {
    const r = buildRolling([
      item('s', { submitted: false, policies: { REG: pol(false) } }),
      item('r', { submitted: true, policies: { REG: pol(true) } }),
    ]);
    expect(r.map((e) => e.slug)).toEqual(['r', 's']);
  });

  it('an MD-PhD item never borrows the regular fact, and a regular item never borrows the MD-PhD one', () => {
    const [phd] = buildRolling([item('x', { program: 'PHD', policies: { REG: pol(true) } })]);
    expect(phd).toMatchObject({ program: 'PHD', kind: 'unknown', evidence: null, url: null, checkedOn: null });
    const [reg] = buildRolling([item('x', { program: 'REG', policies: { PHD: pol(true) } })]);
    expect(reg).toMatchObject({ program: 'REG', kind: 'unknown' });
    const [own] = buildRolling([item('x', { program: 'PHD', policies: { REG: pol(false), PHD: pol(true) } })]);
    expect(own).toMatchObject({ program: 'PHD', kind: 'rolling' });
  });

  it('ANY reads the regular fact; the same school as MD and MD-PhD is two rows; a repeated pair is one', () => {
    const policies = { REG: pol(true), PHD: pol(false) };
    const r = buildRolling([
      item('x', { program: 'ANY', policies }),
      item('x', { program: 'PHD', policies }),
      item('x', { program: 'REG', policies }),
    ]);
    expect(r.map((e) => [e.program, e.kind])).toEqual([
      ['REG', 'rolling'],
      ['PHD', 'set-dates'],
    ]);
  });
});
