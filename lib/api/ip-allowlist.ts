/**
 * Source-address allowlists for developer API keys.
 *
 * Pure and dependency-free: the save-time schema, the key settings form and the
 * request wrapper all read it. Parsing is deliberately strict, because the cost
 * of a typo is a key that is open to the world: no hostnames, no wildcards, no
 * leading zeros, no zone ids, prefix lengths bounded (IPv4 /8-/32, IPv6
 * /16-/128), and `/0` ranges refused (leave the list empty to allow any address).
 *
 * Addresses are held as BigInt so IPv4 and IPv6 share one matching routine.
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is normalised to plain IPv4 on both the
 * client address and the list entries, so a dual-stack listener sees the same
 * address the owner typed.
 */

export const MAX_ALLOWED_ENTRIES = 20;

const PREFIX_BOUNDS = {
  4: {
    min: 8,
    max: 32,
  },
  6: {
    min: 16,
    max: 128,
  },
} as const;

type Version = 4 | 6;

interface Address {
  version: Version;
  value: bigint;
}

export interface ParsedCidr {
  version: Version;
  /** The network address with host bits cleared. */
  network: bigint;
  prefix: number;
}

export type CidrErrorCode = 'invalid_address' | 'open_range' | 'prefix_out_of_range';

export type CidrResult =
  | {
      ok: true;
      cidr: ParsedCidr;
    }
  | {
      ok: false;
      code: CidrErrorCode;
      min?: number;
      max?: number;
    };

export type AllowlistErrorCode = CidrErrorCode | 'too_many';

export interface AllowlistError {
  /** 1-based line of the textarea the problem is on. */
  line: number;
  code: AllowlistErrorCode;
  /** The offending text (empty for `too_many`). */
  value: string;
  /** Prefix bounds for `prefix_out_of_range`; the entry cap for `too_many`. */
  min?: number;
  max?: number;
}

export interface AllowlistResult {
  /** Valid entries, trimmed, duplicates removed, in the order given. */
  entries: string[];
  errors: AllowlistError[];
}

const MAPPED_PREFIX = BigInt(0xffff);
const MASK_32 = (BigInt(1) << BigInt(32)) - BigInt(1);

function parseIpv4(text: string): bigint | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = BigInt(0);
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << BigInt(8)) | BigInt(octet);
  }
  return value;
}

function parseIpv6(text: string): bigint | null {
  if (!/^[0-9a-fA-F:.]+$/.test(text) || !text.includes(':')) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;

  const groupsOf = (half: string): number[] | null => {
    if (half === '') return [];
    const out: number[] = [];
    const pieces = half.split(':');
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i] ?? '';
      if (piece.includes('.')) {
        // An embedded IPv4 is only valid as the very last piece of the address.
        if (i !== pieces.length - 1) return null;
        const v4 = parseIpv4(piece);
        if (v4 === null) return null;
        out.push(Number(v4 >> BigInt(16)), Number(v4 & BigInt(0xffff)));
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
        out.push(parseInt(piece, 16));
      }
    }
    return out;
  };

  const head = groupsOf(halves[0] ?? '');
  if (!head) return null;
  let groups: number[];
  if (halves.length === 2) {
    const tail = groupsOf(halves[1] ?? '');
    if (!tail) return null;
    // `::` stands for at least one group of zeros.
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    // An embedded IPv4 must end the address, so it cannot sit in the head.
    if ((halves[0] ?? '').includes('.')) return null;
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  let value = BigInt(0);
  for (const g of groups) value = (value << BigInt(16)) | BigInt(g);
  return value;
}

/** Parse an address and fold IPv4-mapped IPv6 into IPv4. Null when it is neither. */
function parseAddress(text: string): Address | null {
  const v4 = parseIpv4(text);
  if (v4 !== null)
    return {
      version: 4,
      value: v4,
    };
  const v6 = parseIpv6(text);
  if (v6 === null) return null;
  if (v6 >> BigInt(32) === MAPPED_PREFIX)
    return {
      version: 4,
      value: v6 & MASK_32,
    };
  return {
    version: 6,
    value: v6,
  };
}

function bitsOf(version: Version): number {
  return version === 4 ? 32 : 128;
}

function networkOf(value: bigint, version: Version, prefix: number): bigint {
  const hostBits = BigInt(bitsOf(version) - prefix);
  return (value >> hostBits) << hostBits;
}

/**
 * Parse one address or CIDR range. A bare address is a single-host range
 * (/32 or /128); host bits in a range are cleared (`10.1.2.3/24` is `10.1.2.0/24`).
 */
export function parseCidr(input: string): CidrResult {
  const text = input.trim();
  const slash = text.indexOf('/');
  const addressText = slash === -1 ? text : text.slice(0, slash);
  const prefixText = slash === -1 ? null : text.slice(slash + 1);

  const hasPrefix = prefixText !== null;
  if (hasPrefix && !/^\d{1,3}$/.test(prefixText))
    return {
      ok: false,
      code: 'invalid_address',
    };

  // Parse the raw address first so `::ffff:10.0.0.0/104` can become `10.0.0.0/8`.
  const rawV4 = parseIpv4(addressText);
  const rawV6 = rawV4 === null ? parseIpv6(addressText) : null;
  if (rawV4 === null && rawV6 === null)
    return {
      ok: false,
      code: 'invalid_address',
    };

  let version: Version = rawV4 !== null ? 4 : 6;
  let value = rawV4 ?? rawV6 ?? BigInt(0);
  let prefix = hasPrefix ? Number(prefixText) : bitsOf(version);

  if (version === 6 && value >> BigInt(32) === MAPPED_PREFIX && prefix >= 96) {
    version = 4;
    value &= MASK_32;
    prefix -= 96;
  }

  if (prefix === 0)
    return {
      ok: false,
      code: 'open_range',
    };
  const { min, max } = PREFIX_BOUNDS[version];
  if (prefix < min || prefix > max)
    return {
      ok: false,
      code: 'prefix_out_of_range',
      min,
      max,
    };

  return {
    ok: true,
    cidr: {
      version,
      network: networkOf(value, version, prefix),
      prefix,
    },
  };
}

/**
 * Validate a list of lines. Blank lines are skipped, duplicates collapse, and
 * every problem names its 1-based line so the form can mark it.
 */
export function parseAllowlistLines(lines: readonly string[]): AllowlistResult {
  const entries: string[] = [];
  const errors: AllowlistError[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, index) => {
    const text = raw.trim();
    if (text === '') return;
    const line = index + 1;
    const result = parseCidr(text);
    if (!result.ok) {
      errors.push({
        line,
        code: result.code,
        value: text,
        min: result.min,
        max: result.max,
      });
      return;
    }
    const identity = `${result.cidr.version}:${result.cidr.network}/${result.cidr.prefix}`;
    if (seen.has(identity)) return;
    if (entries.length >= MAX_ALLOWED_ENTRIES) {
      errors.push({
        line,
        code: 'too_many',
        value: '',
        max: MAX_ALLOWED_ENTRIES,
      });
      return;
    }
    seen.add(identity);
    entries.push(text);
  });

  return {
    entries,
    errors,
  };
}

/** Validate the textarea's text, one address or range per line. */
export function parseAllowlist(text: string): AllowlistResult {
  return parseAllowlistLines(text.split(/\r?\n/));
}

/**
 * Whether a client address may use a key restricted to `entries`. An empty list
 * means any address. Otherwise this fails closed: an address that does not
 * parse, or a stored entry that does not, never matches.
 */
export function ipAllowed(ip: string, entries: readonly string[]): boolean {
  if (entries.length === 0) return true;
  const address = parseAddress(ip.trim());
  if (!address) return false;
  for (const entry of entries) {
    const result = parseCidr(entry);
    if (!result.ok || result.cidr.version !== address.version) continue;
    if (networkOf(address.value, address.version, result.cidr.prefix) === result.cidr.network) {
      return true;
    }
  }
  return false;
}

/**
 * A client address with its identifying tail removed, for display and for the
 * refusal log: IPv4 loses its last octet (`203.0.113.x`), IPv6 its last 80 bits
 * (`2001:db8:1::x`). Null when the text is not an address, so junk is never stored.
 */
export function maskAddress(ip: string): string | null {
  const address = parseAddress(ip.trim());
  if (!address) return null;
  if (address.version === 4) {
    const v = address.value;
    return `${Number(v >> BigInt(24))}.${Number((v >> BigInt(16)) & BigInt(255))}.${Number((v >> BigInt(8)) & BigInt(255))}.x`;
  }
  const group = (i: number) => Number((address.value >> BigInt(112 - 16 * i)) & BigInt(0xffff)).toString(16);
  return `${group(0)}:${group(1)}:${group(2)}::x`;
}
