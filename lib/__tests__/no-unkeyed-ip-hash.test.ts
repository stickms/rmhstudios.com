/**
 * No module hashes a client address, or a member id, on its own. An unkeyed SHA-256 of an IPv4
 * address is undone by hashing all 2^32 of them, so every identity hash goes through the keyed
 * helpers in `lib/hash-ip.server.ts` (`hashIp`, `hashScoped`).
 *
 * The gate looks at every unkeyed `createHash(...).update(<identity>` in production sources (a keyed
 * `createHmac`, such as a signed ticket, is not an unkeyed hash), where `<identity>` starts with an
 * address-like name (`ip`, `clientIp`,
 * `getClientIp(`, `remoteAddr`, ...) or a member id (`userId`, `user.id`). Content hashing, ETags,
 * webhook signatures and cache keys hash other things and are not matched.
 *
 * ALLOWED is the shrinking allowlist: a file is listed only with the reason it may hash an identity
 * itself. Entries come out, they do not go in. `lib/hash-ip.server.ts` is the one implementation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'components', 'features', 'hooks', 'lib', 'server', 'stores'];
const SOURCE = /\.(ts|tsx|mjs|cjs|js)$/;
const SKIPPED_DIRS = new Set(['node_modules', '__tests__', '.cache', 'dist', 'generated']);

/** The one place an identity is hashed, keyed. */
const ALLOWED: Readonly<Record<string, string>> = {
  'lib/hash-ip.server.ts': 'the keyed implementation itself (its unkeyed branch is the no-secret fallback)',
};

const IDENTITY =
  '(?:ip|ips|ipAddr|ipAddress|clientIp|remoteIp|remoteAddr|remoteAddress|xff|getClientIp\\s*\\(|userId|user\\.id|session\\.user\\.id)\\b';
/** `createHash('sha256').update(ip`, the template-literal form and the `ip +` form. */
const IDENTITY_HASH = new RegExp(
  `createHash\\s*\\([^)]*\\)\\s*\\.update\\s*\\(\\s*(?:\`\\$\\{\\s*)?(?:String\\s*\\(\\s*)?${IDENTITY}`,
);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
}

describe('no unkeyed identity hashing', () => {
  it('the pattern catches the forms that were in the code base', () => {
    const bad = [
      "crypto.createHash('sha256').update(ip).digest('hex')",
      "createHash('sha256').update(ip + process.env.IP_HASH_SALT || 'rmh-salt')",
      "createHash('sha256').update(`${ip}:${day}`)",
      "createHash('sha256')\n    .update(getClientIp(request))",
    ];
    for (const src of bad) expect(IDENTITY_HASH.test(src), src).toBe(true);
  });

  it('the pattern leaves content hashing, signatures and ids alone', () => {
    const fine = [
      "createHash('sha256').update(body).digest('hex')",
      "createHash('sha256').update(JSON.stringify(payload))",
      "createHmac('sha256', secret).update(rawBody)",
      "createHash('sha256').update(ipsum)",
      "createHash('sha256').update(userIdentifier)",
      "createHmac('sha256', key).update(`${userId}.${expiry}`)",
    ];
    for (const src of fine) expect(IDENTITY_HASH.test(src), src).toBe(false);
  });

  it('no production source hashes an address or a member id outside the allowlist', () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);
    expect(files.length).toBeGreaterThan(500);
    const offenders = files
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .filter((rel) => !(rel in ALLOWED) && IDENTITY_HASH.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(offenders, 'hash identities with hashIp / hashScoped from lib/hash-ip.server.ts').toEqual([]);
  });

  it('every allowlist entry still exists and still needs its entry', () => {
    for (const rel of Object.keys(ALLOWED)) {
      expect(
        IDENTITY_HASH.test(readFileSync(join(ROOT, rel), 'utf8')),
        `${rel} no longer hashes an identity: remove it`,
      ).toBe(true);
    }
  });
});
