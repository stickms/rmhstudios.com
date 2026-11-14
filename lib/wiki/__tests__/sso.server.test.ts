/**
 * The sign-in pass the site hands the wiki. The wiki's verifier is PHP
 * (deploy/mediawiki/extensions/RMHStudiosLogin/includes/Pass.php), so the two
 * agree only if the bytes agree: FIXTURE below is a pass made by this module
 * that the PHP verifier accepted (checked against MediaWiki 1.43.11), and the
 * key is the one deploy/mediawiki/env.php derives from the same secret.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  signWikiPass,
  WIKI_LOGIN_LABEL,
  WIKI_PASS_TTL_SECONDS,
  wikiLoginKey,
  wikiPublicUrl,
} from '@/lib/wiki/sso.server';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const CLAIMS = {
  sub: 'user_1',
  name: 'alex_doe',
  admin: true,
  state: '0123456789abcdef0123456789abcdef',
};
const NOW = 1_800_000_000;
const KEY = 'dc5300fd23166b4669c6e15bd99e4fd823b833f4c7e46f82bc61f1a70d500fe4';
const FIXTURE =
  'eyJ2IjoxLCJzdWIiOiJ1c2VyXzEiLCJuYW1lIjoiYWxleF9kb2UiLCJhZG1pbiI6dHJ1ZSwic3RhdGUiOiIwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZiIsImV4cCI6MTgwMDAwMDEyMH0.kZZUqJI5iFXtYw0K9SsNweBwe7ldOnkOzoBhIuUSsjE';

afterEach(() => vi.unstubAllEnvs());

describe('the wiki sign-in key', () => {
  it("is PHP's hash_hmac('sha256', label, BETTER_AUTH_SECRET), hex", () => {
    expect(wikiLoginKey('test-secret')).toBe(KEY);
  });

  it('uses the same label as the wiki', () => {
    expect(read('deploy/mediawiki/env.php')).toContain(
      `const RMH_WIKI_LOGIN_LABEL = '${WIKI_LOGIN_LABEL}';`,
    );
  });

  it('is unrelated to the secret itself and to the wiki secret key', () => {
    expect(KEY).not.toContain('test-secret');
    const secretKey = createHmac('sha256', 'test-secret')
      .update('rmhstudios wiki secret key v1')
      .digest('hex');
    expect(secretKey).not.toBe(KEY);
  });
});

describe('signWikiPass', () => {
  it('produces exactly the pass the wiki accepts', () => {
    expect(signWikiPass(CLAIMS, KEY, NOW)).toBe(FIXTURE);
  });

  it('carries the claims, version 1 and a two-minute expiry, as base64url JSON', () => {
    const [body] = signWikiPass(CLAIMS, KEY, NOW).split('.');
    expect(JSON.parse(Buffer.from(body!, 'base64url').toString())).toEqual({
      v: 1,
      ...CLAIMS,
      exp: NOW + WIKI_PASS_TTL_SECONDS,
    });
    expect(WIKI_PASS_TTL_SECONDS).toBe(120);
  });

  it('is URL-safe and changes with every claim and with the key', () => {
    const pass = signWikiPass(CLAIMS, KEY, NOW);
    expect(pass).toMatch(/^[\w-]+\.[\w-]+$/);
    for (const changed of [
      { ...CLAIMS, sub: 'user_2' },
      { ...CLAIMS, admin: false },
      { ...CLAIMS, state: 'f'.repeat(32) },
    ]) {
      expect(signWikiPass(changed, KEY, NOW)).not.toBe(pass);
    }
    expect(signWikiPass(CLAIMS, wikiLoginKey('other'), NOW).split('.')[1]).not.toBe(
      pass.split('.')[1],
    );
  });
});

describe('wikiPublicUrl', () => {
  it('defaults to the wiki subdomain and drops a trailing slash', () => {
    vi.stubEnv('WIKI_PUBLIC_URL', '');
    expect(wikiPublicUrl()).toBe('https://wiki.rmhstudios.com');
    vi.stubEnv('WIKI_PUBLIC_URL', 'http://localhost:7010/');
    expect(wikiPublicUrl()).toBe('http://localhost:7010');
  });
});
