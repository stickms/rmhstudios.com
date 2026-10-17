import { describe, expect, it } from 'vitest';
import { labAccessAllowed } from './access';

describe('labAccessAllowed (the /eversion-lab gate)', () => {
  it('admits admins and turns everyone else away', () => {
    expect(labAccessAllowed({ nodeEnv: 'production', openFlag: undefined, isAdmin: true })).toBe(
      true,
    );
    expect(labAccessAllowed({ nodeEnv: 'production', openFlag: undefined, isAdmin: false })).toBe(
      false,
    );
  });

  it('honours the dev-only open flag outside production', () => {
    expect(labAccessAllowed({ nodeEnv: 'development', openFlag: '1', isAdmin: false })).toBe(true);
    expect(labAccessAllowed({ nodeEnv: undefined, openFlag: '1', isAdmin: false })).toBe(true);
    expect(labAccessAllowed({ nodeEnv: 'development', openFlag: undefined, isAdmin: false })).toBe(
      false,
    );
  });

  it('ignores the open flag in production', () => {
    expect(labAccessAllowed({ nodeEnv: 'production', openFlag: '1', isAdmin: false })).toBe(false);
  });
});
