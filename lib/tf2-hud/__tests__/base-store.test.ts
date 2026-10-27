import { describe, expect, it } from 'vitest';
import { isSafeBasePath } from '../base-store.server';

describe('isSafeBasePath', () => {
  it.each([
    'manifest.json',
    'resource/ui/hudplayerhealth.res',
    'materials/vgui/hud/health_bg.vtf',
    'scripts/screens/hud_spy.txt',
  ])('accepts %s', (p) => expect(isSafeBasePath(p)).toBe(true));

  it.each([
    '',
    '../secrets.json',
    'resource/../../etc/passwd.txt',
    '/etc/passwd.txt',
    'resource//ui/a.res',
    'resource/ui/a.exe',
    'resource/ui/a.res?x=1',
    'resource\\ui\\a.res',
    'a/'.repeat(200) + 'b.res',
    '_state.json/../x.json',
  ])('rejects %j', (p) => expect(isSafeBasePath(p)).toBe(false));
});
