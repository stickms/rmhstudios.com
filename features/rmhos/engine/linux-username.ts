const FALLBACK =
  'rmh';
const MAX_LENGTH = 31;
// Names the guest already owns; a site user must never map onto them.
const RESERVED =
  new Set(
    [
      'root',
      'nobody',
      'daemon',
      'bin',
      'sys',
      'sync',
      'games',
      'man',
      'lp',
      'mail',
      'news',
      'uucp',
      'proxy',
      'www-data',
      'backup',
      'list',
      'irc',
      'operator',
      'adm',
      'rmh',
      // Alpine's own users and groups (a group name taken by a user makes useradd fail), and the
      // name of the guest's default login.
      'guest',
      'ntp',
      'sshd',
      'cron',
      'ftp',
      'halt',
      'shutdown',
      'wheel',
      'video',
      'audio',
      'input',
      'tty',
      'disk',
      'kmem',
      'floppy',
      'postmaster',
      'smmsp',
      'squid',
      'xfs',
      'cyrus',
      'vpopmail',
      'at',
      'utmp',
      'ping',
      'users',
      'nogroup',
      'shadow',
      'dialout',
      'cdrom',
      'tape',
      'netdev',
      'kvm',
      'abuild',
      'messagebus',
      'polkitd',
    ],
  );

/** Map a site username to a valid `useradd` name: /^[a-z][a-z0-9_-]{0,30}$/. */
export function toLinuxUsername(
  raw:
    | string
    | null
    | undefined,
): string {
  if (
    !raw
  )
    return FALLBACK;
  let name =
    raw
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]/g,
        '_',
      );
  if (
    !/^[a-z]/.test(
      name,
    )
  )
    name = `u${name}`;
  name =
    name.slice(
      0,
      MAX_LENGTH,
    );
  if (
    name ===
      'u' ||
    RESERVED.has(
      name,
    )
  )
    return FALLBACK;
  return name;
}
