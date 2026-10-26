import { afterEach, describe, expect, it, vi } from 'vitest';
import { envInt } from '../shared/config';

afterEach(() => vi.unstubAllEnvs());

describe('integer service configuration', () => {
  it.each(['', 'bad', '10ms', '1.2', '-5', '0', '2147483648', '9007199254740992'])(
    'falls back for invalid timer %s',
    (value) => {
      vi.stubEnv('AUDIT_TIMER_MS', value);
      expect(envInt('AUDIT_TIMER_MS', 5000)).toBe(5000);
    },
  );
  it('accepts complete integers and enforces port bounds', () => {
    vi.stubEnv('AUDIT_PORT', ' 7001 ');
    expect(envInt('AUDIT_PORT', 7676, 1, 65535)).toBe(7001);
    vi.stubEnv('AUDIT_PORT', '65536');
    expect(envInt('AUDIT_PORT', 7676, 1, 65535)).toBe(7676);
  });
});
