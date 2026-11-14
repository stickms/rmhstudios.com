// Private/reserved address test for the relay hub. Ported from the site's SSRF
// guard so this folder stays self-contained (the hub runs sandboxed and imports
// nothing from the site). Fails closed: anything that is not an IP literal is
// reported as private.
import { isIP } from 'node:net';

export function isPrivateIp(
  ip: string,
): boolean {
  const version =
    isIP(
      ip,
    );
  if (
    version ===
    4
  ) {
    const parts =
      ip
        .split(
          '.',
        )
        .map(
          (
            p,
          ) =>
            parseInt(
              p,
              10,
            ),
        );
    if (
      parts.length !==
        4 ||
      parts.some(
        (
          n,
        ) =>
          Number.isNaN(
            n,
          ) ||
          n <
            0 ||
          n >
            255,
      )
    )
      return true;
    const [
      a,
      b,
    ] =
      parts as [
        number,
        number,
        number,
        number,
      ];
    if (
      a ===
      0
    )
      return true; // 0.0.0.0/8
    if (
      a ===
      10
    )
      return true; // 10/8
    if (
      a ===
      127
    )
      return true; // loopback
    if (
      a ===
        169 &&
      b ===
        254
    )
      return true; // link-local + metadata
    if (
      a ===
        172 &&
      b >=
        16 &&
      b <=
        31
    )
      return true; // 172.16/12
    if (
      a ===
        192 &&
      b ===
        168
    )
      return true; // 192.168/16
    if (
      a ===
        100 &&
      b >=
        64 &&
      b <=
        127
    )
      return true; // CGNAT 100.64/10
    if (
      a ===
        192 &&
      b ===
        0
    )
      return true; // 192.0.0/24, 192.0.2/24
    if (
      a ===
        198 &&
      (b ===
        18 ||
        b ===
          19)
    )
      return true; // benchmark 198.18/15
    if (
      a >=
      224
    )
      return true; // multicast + reserved
    return false;
  }
  if (
    version ===
    6
  ) {
    const addr =
      ip.toLowerCase();
    if (
      addr ===
        '::' ||
      addr ===
        '::1'
    )
      return true;
    // ULA fc00::/7 and link-local fe80::/10 (fe8-feb).
    if (
      /^(fc|fd|fe8|fe9|fea|feb)/.test(
        addr,
      )
    )
      return true;
    // IPv4-mapped, dotted form: re-check the embedded v4 address.
    const mapped =
      addr.match(
        /::ffff:(\d+\.\d+\.\d+\.\d+)$/,
      );
    if (
      mapped
    )
      return isPrivateIp(
        mapped[1] as string,
      );
    // IPv4-mapped, hex form (::ffff:7f00:1).
    const hex =
      addr.match(
        /::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
      );
    if (
      hex
    ) {
      const hi =
        parseInt(
          hex[1] as string,
          16,
        );
      const lo =
        parseInt(
          hex[2] as string,
          16,
        );
      return isPrivateIp(
        `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`,
      );
    }
    return false;
  }
  return true; // not an IP literal: fail closed
}
