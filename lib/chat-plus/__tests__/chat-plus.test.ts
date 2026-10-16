import { describe, expect, it } from 'vitest';
import {
  parseChecklist,
  parseDice,
  parsePoll,
  parseRemind,
  parseSlash,
  parseTip,
  resolveCommand,
  suggestCommands,
} from '@/lib/chat-plus/commands';
import {
  FORWARD_MANY_THRESHOLD,
  computeAttachFlags,
  expiryFor,
  forwardLabel,
  isExpired,
  maxForwardTargets,
} from '@/lib/chat-plus/flags';
import { isValidThemeKey, parseTheme, encodeTheme } from '@/lib/chat-plus/themes';
import { applyChatUpdate } from '@/lib/chat-plus/apply-update';

/**
 * Scope (docs/testing.md): these are the rules that gate coins (`/tip`), leak or
 * lose private messages (disappearing timers, forward limits) or are decided for
 * other people (dice). Pure functions only — the server modules that use them
 * are thin.
 */
describe('slash command parsing', () => {
  it('parses dice and bounds them', () => {
    expect(parseDice('2d6')).toEqual({ ok: true, value: { count: 2, sides: 6 } });
    expect(parseDice('d20')).toEqual({ ok: true, value: { count: 1, sides: 20 } });
    expect(parseDice('')).toEqual({ ok: true, value: { count: 1, sides: 6 } });
    expect(parseDice('21d6').ok).toBe(false);
    expect(parseDice('2d1').ok).toBe(false);
    expect(parseDice('1d100000').ok).toBe(false);
    expect(parseDice('2d6; drop table').ok).toBe(false);
  });

  it('only accepts whole, bounded tips', () => {
    expect(parseTip('50')).toEqual({ ok: true, value: { amount: 50, handle: null } });
    expect(parseTip('50 @sam')).toEqual({ ok: true, value: { amount: 50, handle: 'sam' } });
    expect(parseTip('0').ok).toBe(false);
    expect(parseTip('-5').ok).toBe(false);
    expect(parseTip('1.5').ok).toBe(false);
    expect(parseTip('100001').ok).toBe(false);
  });

  it('parses polls and checklists', () => {
    expect(parsePoll('Pizza? | yes | no')).toEqual({
      ok: true,
      value: { question: 'Pizza?', options: ['yes', 'no'] },
    });
    expect(parsePoll('Pizza? | yes').ok).toBe(false);
    expect(parsePoll('q | a | b | c | d | e | f | g').ok).toBe(false);
    expect(parseChecklist('Night | chips | dip').ok).toBe(true);
    expect(parseChecklist('Night').ok).toBe(false);
  });

  it('parses reminders against the caller clock', () => {
    const now = new Date('2026-10-12T10:00:00Z');
    const r = parseRemind('1h30m call back', now);
    expect(r.ok && r.value.remindAt.toISOString()).toBe('2026-10-12T11:30:00.000Z');
    expect(parseRemind('10s hi', now).ok).toBe(false);
    expect(parseRemind('2h', now).ok).toBe(false);
    expect(parseRemind('999d later', now).ok).toBe(false);
  });

  it('suggests and resolves commands', () => {
    expect(suggestCommands('/ro', 'dm').map((c) => c.name)).toEqual(['roll']);
    expect(suggestCommands('/roll 2d6', 'dm')).toEqual([]);
    expect(suggestCommands('hello', 'dm')).toEqual([]);
    expect(parseSlash('/Roll 2d6')).toEqual({ name: 'roll', args: '2d6' });
    expect(resolveCommand('/flip', 'group')?.command.where).toBe('server');
    expect(resolveCommand('/nonsense', 'dm')).toBeNull();
  });
});

describe('disappearing messages', () => {
  it('computes expiry and enforces it at read time', () => {
    const now = new Date('2026-10-12T10:00:00Z');
    expect(expiryFor(null, now)).toBeNull();
    expect(expiryFor(3600, now)?.toISOString()).toBe('2026-10-12T11:00:00.000Z');
    expect(isExpired(null)).toBe(false);
    expect(isExpired('2026-10-12T09:59:59Z', now.getTime())).toBe(true);
    expect(isExpired('2026-10-12T10:00:01Z', now.getTime())).toBe(false);
  });
});

describe('forward limits', () => {
  it('labels hops and limits viral messages to one chat', () => {
    expect(forwardLabel(0)).toBe('none');
    expect(forwardLabel(1)).toBe('forwarded');
    expect(forwardLabel(FORWARD_MANY_THRESHOLD)).toBe('forwarded');
    expect(forwardLabel(FORWARD_MANY_THRESHOLD + 1)).toBe('many');
    expect(maxForwardTargets(2)).toBe(5);
    expect(maxForwardTargets(6)).toBe(1);
  });
});

describe('shared media flags and themes', () => {
  it('flags media and links separately', () => {
    expect(computeAttachFlags({ content: 'hi' })).toBe(0);
    expect(computeAttachFlags({ content: 'see https://x.test/a', gifUrl: null })).toBe(2);
    expect(computeAttachFlags({ content: '', imageUrls: ['a'] })).toBe(1);
    expect(computeAttachFlags({ content: 'http://a.test', audioUrl: 'v' })).toBe(3);
  });

  it('only accepts preset themes', () => {
    expect(isValidThemeKey('danger.dots')).toBe(true);
    expect(isValidThemeKey('#ff0000.none')).toBe(false);
    expect(isValidThemeKey('danger.dots.x')).toBe(false);
    expect(parseTheme('bogus')).toEqual({ accent: 'default', wallpaper: 'none' });
    expect(encodeTheme({ accent: 'default', wallpaper: 'none' })).toBeNull();
  });
});

describe('chat-update reducer', () => {
  it('marks own messages seen and swaps checklist items', () => {
    const msgs = [
      { id: 'a', senderId: 'me', read: false },
      { id: 'b', senderId: 'them', read: false },
      { id: 'c', senderId: 'me', meta: { title: 't', items: [] } },
    ];
    const seen = applyChatUpdate(msgs, { kind: 'dm', chatId: 'x', op: 'read' }, 'me');
    expect(seen.map((m) => (m as { read?: boolean }).read)).toEqual([true, false, undefined]);
    const ticked = applyChatUpdate(
      msgs,
      {
        kind: 'dm',
        chatId: 'x',
        op: 'checklist',
        messageId: 'c',
        items: [{ text: 'z', doneBy: 'u', doneAt: null }],
      },
      'me',
    );
    expect((ticked[2].meta as { items: unknown[] }).items).toHaveLength(1);
  });
});
