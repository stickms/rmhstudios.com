import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAlertPrefs, shouldAlert, toggleState, MAX_FOLLOWED } from '../alerts';
import { __resetDiscordRelay, formatBatch, relayToDiscord, relayable, webhookUrl } from '../discord.server';
import type { ElectionEvent } from '../events';

const ev = (o: Partial<ElectionEvent>): ElectionEvent => ({ id: o.id ?? 'e1', at: 1, date: '2026-11-03', kind: 'call', importance: 2, text: 'PA called', ...o });

describe('alert prefs', () => {
  it('falls back on junk and keeps only valid, unique postal codes', () => {
    expect(parseAlertPrefs('nope')).toEqual({ major: true, calls: false, states: [] });
    expect(parseAlertPrefs(JSON.stringify({ major: false, calls: true, states: ['PA', 'pa', 'PA', 'XYZ', 5] }))).toEqual({ major: false, calls: true, states: ['PA'] });
  });
  it('toggles and caps followed states', () => {
    expect(toggleState([], 'GA')).toEqual(['GA']);
    expect(toggleState(['GA'], 'GA')).toEqual([]);
    expect(toggleState(['GA'], 'bad')).toEqual(['GA']);
    const full = Array.from({ length: MAX_FOLLOWED }, (_, i) => String.fromCharCode(65 + i) + 'A');
    expect(toggleState(full, 'ZZ')).toEqual(full);
  });
});

describe('shouldAlert', () => {
  const base = { major: false, calls: false, states: [] as string[] };
  it('alerts on a followed state, on majors, and on calls only when chosen — never on news', () => {
    expect(shouldAlert(ev({ state: 'PA' }), { ...base, states: ['PA'] })).toBe(true);
    expect(shouldAlert(ev({ state: 'OH' }), { ...base, states: ['PA'] })).toBe(false);
    expect(shouldAlert(ev({ importance: 3 }), { ...base, major: true })).toBe(true);
    expect(shouldAlert(ev({ importance: 2 }), { ...base, major: true })).toBe(false);
    expect(shouldAlert(ev({ kind: 'call' }), { ...base, calls: true })).toBe(true);
    expect(shouldAlert(ev({ kind: 'lead-change' }), { ...base, calls: true })).toBe(false);
    expect(shouldAlert(ev({ kind: 'news', importance: 3, state: 'PA' }), { major: true, calls: true, states: ['PA'] })).toBe(false);
  });
});

describe('discord relay', () => {
  afterEach(() => {
    __resetDiscordRelay();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it('only accepts Discord webhook URLs over https', () => {
    expect(webhookUrl('https://discord.com/api/webhooks/1/abc')).toContain('discord.com');
    expect(webhookUrl('http://discord.com/api/webhooks/1/abc')).toBeNull();
    expect(webhookUrl('https://evil.example/api/webhooks/1/abc')).toBeNull();
    expect(webhookUrl('https://discord.com/other')).toBeNull();
    expect(webhookUrl(undefined)).toBeNull();
  });
  it('relays notable events, skips news and noise, formats a capped message', () => {
    expect(relayable(ev({ kind: 'news' }))).toBe(false);
    expect(relayable(ev({ kind: 'lead-change', importance: 1 }))).toBe(false);
    expect(relayable(ev({ kind: 'clinch', importance: 1 }))).toBe(true);
    const text = formatBatch(Array.from({ length: 14 }, (_, i) => ev({ id: `x${i}`, text: `Race ${i}` })));
    expect(text).toContain('…and 4 more');
    expect(text.length).toBeLessThan(2000);
  });
  it('batches a burst into one post and never posts without a webhook', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', f);
    relayToDiscord([ev({ id: 'a' })]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(f).not.toHaveBeenCalled();
    vi.stubEnv('ELECTIONS_DISCORD_WEBHOOK', 'https://discord.com/api/webhooks/1/abc');
    relayToDiscord([ev({ id: 'b' }), ev({ id: 'c' }), ev({ id: 'b' })]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.content.match(/PA called/g)).toHaveLength(2);
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
});
