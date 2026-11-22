// Private/reserved address test for the relay hub. Ported from the site's SSRF
// guard so this folder stays self-contained (the hub runs sandboxed and imports
// nothing from the site). Fails closed: anything that is not a parseable IP
// literal is reported as private. The guest controls the host string, so IPv6
// is parsed to bytes and judged by range, never by text prefix.
import { isIP } from 'node:net';

function isPrivateV4(a: number, b: number, c: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  // 192.0.0.0/24 (IETF protocol) and 192.0.2.0/24 (TEST-NET-1) only: the rest of 192.0/16 is public
  // (192.0.64.0/18 is WordPress.com and Gravatar).
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18/15
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4 (incl. broadcast)
  return false;
}

function parseV4(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** Parse IPv6 text (with `::` compression and an optional trailing dotted quad) to 16 bytes. */
function parseV6(text: string): number[] | null {
  let s = text;
  const tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  if (lastColon === -1) return null;
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = parseV4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail.push(v4[0]! * 256 + v4[1]!, v4[2]! * 256 + v4[3]!);
    s = s.slice(0, lastColon + 1) + '0:0'; // placeholder groups, replaced below
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const groups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  if (!head || !rest) return null;
  let all: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    all = [...head, ...new Array<number>(fill).fill(0), ...rest];
  } else {
    all = head;
  }
  if (all.length !== 8) return null;
  if (tail.length) {
    all[6] = tail[0]!;
    all[7] = tail[1]!;
  }
  return all.flatMap((g) => [g >> 8, g & 255]);
}

function isPrivateV6(b: number[]): boolean {
  const zeroUpTo = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(12)) return true; // ::/96 covers ::, ::1 and IPv4-compatible
  // IPv4-mapped ::ffff:0:0/96
  if (zeroUpTo(10) && b[10] === 0xff && b[11] === 0xff) return isPrivateV4(b[12]!, b[13]!, b[14]!);
  // NAT64 64:ff9b::/96
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
    return isPrivateV4(b[12]!, b[13]!, b[14]!);
  }
  // 6to4 2002::/16
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateV4(b[2]!, b[3]!, b[4]!);
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return true; // fec0::/10
  if (b[0] === 0xff) return true; // ff00::/8
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (ip.includes('%')) return true; // zone ids are never a public destination
  const version = isIP(ip);
  if (version === 4) {
    const v4 = parseV4(ip);
    return v4 === null ? true : isPrivateV4(v4[0]!, v4[1]!, v4[2]!);
  }
  if (version === 6) {
    const bytes = parseV6(ip);
    return bytes === null ? true : isPrivateV6(bytes);
  }
  return true; // not an IP literal: fail closed
}
