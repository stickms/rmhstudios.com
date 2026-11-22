import { describe, expect, it } from 'vitest';
import { toLinuxUsername } from '../linux-username';

describe('toLinuxUsername', () => {
  it.each<[string | null | undefined, string]>([
    ['alice', 'alice'],
    ['Alice_99', 'alice_99'],
    ['Élan.Vital', 'u_lan_vital'],
    ['9lives', 'u9lives'],
    ['-dash', 'u-dash'],
    ['root', 'rmh'],
    ['nobody', 'rmh'],
    ['', 'rmh'],
    [null, 'rmh'],
    [undefined, 'rmh'],
    ['a'.repeat(60), 'a'.repeat(31)],
  ])('%s -> %s', (raw, out) => expect(toLinuxUsername(raw)).toBe(out));

  it.each(
    'guest ntp sshd cron ftp halt shutdown wheel video audio input tty disk kmem floppy mail news uucp operator man postmaster smmsp squid xfs games cyrus vpopmail at www-data utmp ping users nogroup shadow lp dialout cdrom tape netdev kvm abuild messagebus polkitd'.split(
      ' ',
    ),
  )('%s is a name the guest already owns: it maps to the fallback, in any case', (name) => {
    expect(toLinuxUsername(name)).toBe('rmh');
    expect(toLinuxUsername(name.toUpperCase())).toBe('rmh');
  });

  it('a name that merely contains a reserved one is its own name', () => {
    expect(toLinuxUsername('guest2')).toBe('guest2');
    expect(toLinuxUsername('video-fan')).toBe('video-fan');
  });

  it('always matches the useradd pattern', () =>
    ['x y', '日本', '__', 'A-B'].forEach((s) => expect(toLinuxUsername(s)).toMatch(/^[a-z][a-z0-9_-]{0,30}$/)));
});
