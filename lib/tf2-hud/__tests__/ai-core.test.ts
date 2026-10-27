import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyChanges,
  excerptForAi,
  HUD_AI_LIMITS,
  parseChanges,
  validateSelection,
  type HudChange,
} from '../ai-core';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');
const read = (p: string) => readFileSync(path.join(BASE, p), 'utf8');
const HEALTH = 'resource/ui/hudplayerhealth.res';
const SCHEME = 'resource/clientscheme.res';
const files = { [HEALTH]: read(HEALTH), [SCHEME]: read(SCHEME) };
const ROOT = 'Resource/UI/HudPlayerHealth.res';

describe('validateSelection', () => {
  const allowed = new Set([HEALTH, SCHEME, 'a.res', 'b.res', 'c.res', 'd.res']);
  it('keeps offered paths once each, in order, up to the limit', () => {
    expect(validateSelection([HEALTH, 'nope.res', HEALTH, SCHEME], allowed)).toEqual([HEALTH, SCHEME]);
    expect(validateSelection(['a.res', 'b.res', 'c.res', 'd.res', HEALTH], allowed)).toHaveLength(
      HUD_AI_LIMITS.files,
    );
  });
  it('ignores anything that is not a list of strings', () => {
    expect(validateSelection('x', allowed)).toEqual([]);
    expect(validateSelection([1, null, {}], allowed)).toEqual([]);
  });
});

describe('parseChanges', () => {
  it('accepts set and remove, and counts what is malformed', () => {
    const r = parseChanges([
      { file: HEALTH, op: 'set', path: [ROOT, 'HudPlayerHealth', 'xpos'], value: '10' },
      { file: HEALTH, op: 'remove', path: [ROOT, 'HudPlayerHealth', 'zpos'] },
      { file: HEALTH, op: 'set', path: [ROOT], value: 'x\nvalue' }, // control character
      { file: HEALTH, op: 'set', path: [], value: '1' },
      { file: HEALTH, op: 'delete', path: ['a'] },
      { file: 1, op: 'set', path: ['a'], value: '1' },
      null,
    ]);
    expect(r.changes).toHaveLength(2);
    expect(r.malformed).toBe(5);
  });
  it('tolerates input that is not a list', () => {
    expect(parseChanges('x')).toEqual({ changes: [], malformed: 0 });
  });
});

describe('applyChanges', () => {
  const set = (file: string, p: string[], value: string): HudChange => ({ file, op: 'set', path: p, value });

  it('changes one value and nothing else, and reports before and after', () => {
    const r = applyChanges(files, [set(HEALTH, [ROOT, 'HudPlayerHealth', 'wide'], '300')]);
    expect(r.applied).toEqual([
      { file: HEALTH, op: 'set', path: [ROOT, 'HudPlayerHealth', 'wide'], before: '250', after: '300' },
    ]);
    const before = files[HEALTH].split('\n');
    const after = r.files[HEALTH].split('\n');
    expect(after).toHaveLength(before.length);
    expect(after.filter((l, i) => l !== before[i])).toHaveLength(1);
  });

  it('edits a colour in the scheme', () => {
    const r = applyChanges(files, [set(SCHEME, ['Scheme', 'Colors', 'Orange'], '30 144 255 255')]);
    expect(r.applied[0]).toMatchObject({ before: '178 82 22 255', after: '30 144 255 255' });
    expect(r.files[SCHEME]).toContain('"Orange"');
    expect(r.files[SCHEME]).toContain('30 144 255 255');
  });

  it('creates a missing key, removes an existing one, and is a no-op for a value already set', () => {
    const r = applyChanges(files, [
      set(HEALTH, [ROOT, 'HudPlayerHealth', 'newkey'], '1'),
      { file: HEALTH, op: 'remove', path: [ROOT, 'HudPlayerHealth', 'HealthDeathWarning'] },
      set(HEALTH, [ROOT, 'HudPlayerHealth', 'wide'], '250'),
    ]);
    expect(r.applied.map((a) => [a.op, a.path.at(-1), a.before, a.after])).toEqual([
      ['set', 'newkey', null, '1'],
      ['remove', 'HealthDeathWarning', '0.49', null],
    ]);
    expect(r.files[HEALTH]).not.toContain('"HealthDeathWarning"\t"0.49"');
  });

  it('refuses a file it was not given, a block, and a key that is not there to remove', () => {
    const r = applyChanges(files, [
      set('resource/ui/other.res', ['a', 'b'], '1'),
      set(HEALTH, [ROOT, 'HudPlayerHealth'], 'x'), // a block
      { file: HEALTH, op: 'remove', path: [ROOT, 'HudPlayerHealth', 'nope'] },
    ]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['unknown-file', 'not-a-value', 'missing']);
    expect(r.applied).toEqual([]);
    expect(r.files).toEqual({});
  });

  it('keeps one file\'s changes when another file\'s change is refused', () => {
    const r = applyChanges(files, [
      set(SCHEME, ['Scheme', 'Colors', 'Orange'], '1 2 3 255'),
      set('missing.res', ['a'], '1'),
    ]);
    expect(Object.keys(r.files)).toEqual([SCHEME]);
    expect(r.rejected).toHaveLength(1);
  });
});

describe('excerptForAi', () => {
  it('sends only the colours and base settings of the scheme', () => {
    const x = excerptForAi(SCHEME, files[SCHEME]);
    expect(x).toContain('"Orange"');
    expect(x).not.toContain('Fonts');
    expect(x.length).toBeLessThan(files[SCHEME].length);
  });
  it('sends other files whole, marking a cut', () => {
    expect(excerptForAi(HEALTH, files[HEALTH])).toBe(files[HEALTH]);
    const big = 'a'.repeat(HUD_AI_LIMITS.fileChars + 100);
    expect(excerptForAi('x.res', big)).toContain('(file continues)');
  });
});
