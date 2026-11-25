import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { notice } from '@/lib/notifications/notice-keys';

/**
 * API key suspend and restore notices are keys (sprint 12, feature 19). The emitters run, with the notification stub
 * recording what they hand over, in `api-keys.test.ts`; this holds the keys, their params and the reader's-language
 * preview.
 */

const source = readFileSync('lib/admin/api-keys.server.ts', 'utf8');

describe('api key notices', () => {
  it('the suspend notice carries the key name and the admin reason as params', () => {
    const n = notice('api-key-suspended', { name: 'build bot', reason: 'scraping every profile' });
    expect(n.key).toBe('api-key-suspended');
    expect(n.params).toEqual({ name: 'build bot', reason: 'scraping every profile' });
    expect(n.fallback).toBe('Your API key build bot was suspended: scraping every profile');
  });

  it('the restore notice carries the key name', () => {
    const n = notice('api-key-restored', { name: 'build bot' });
    expect(n.params).toEqual({ name: 'build bot' });
    expect(n.fallback).toBe('Your API key build bot works again');
  });

  it('both emitters hand createNotification a notice, not the bare reason or name', () => {
    expect(source).toContain("notice('api-key-suspended', { name: key.name, reason: change.suspend.reason })");
    expect(source).toContain("notice('api-key-restored', { name: key.name })");
    expect(source).not.toMatch(/preview: (change\.suspend\.reason|key\.name)\b/);
  });
});
