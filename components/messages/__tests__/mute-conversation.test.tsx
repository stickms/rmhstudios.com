import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown> & { defaultValue?: string }) =>
      (o?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o?.[name] ?? '')),
    i18n: { language: 'en' },
  }),
}));

const { MuteChoiceItems, MutedUntilLine } = await import('../MuteConversationControl');
const { DM_MUTE_CHOICES, activeMuteUntil, dmMuteUntil, isOpenEndedMute } = await import('@/lib/messages/dm-mute');

describe('the mute choices', () => {
  it('offers an hour, eight hours, a week and until turned back on, and not mentions only', () => {
    const html = renderToStaticMarkup(createElement(MuteChoiceItems, { onChoose: () => {} }));
    const rows = [...html.matchAll(/role="menuitem"/g)];
    expect(rows).toHaveLength(4);
    const order = ['For 1 hour', 'For 8 hours', 'For 1 week', 'Until I turn it back on'].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toMatch(/mention/i);
    expect(DM_MUTE_CHOICES).toEqual(['1h', '8h', '7d', 'forever']);
  });

  it('turns a choice into a muteUntil', () => {
    const now = new Date('2026-12-21T12:00:00Z');
    expect(dmMuteUntil('1h', now).toISOString()).toBe('2026-12-21T13:00:00.000Z');
    expect(dmMuteUntil('8h', now).toISOString()).toBe('2026-12-21T20:00:00.000Z');
    expect(dmMuteUntil('7d', now).toISOString()).toBe('2026-12-28T12:00:00.000Z');
    expect(isOpenEndedMute(dmMuteUntil('forever', now))).toBe(true);
  });
});

describe('the Muted until line', () => {
  it('names the time while a timed mute is in force', () => {
    const until = new Date('2026-12-21T20:00:00Z');
    const html = renderToStaticMarkup(createElement(MutedUntilLine, { mutedUntil: until, locale: 'en' }));
    expect(html).toContain('t-meta');
    expect(html).toMatch(/Muted until .*2026/);
  });

  it('says so plainly for the open-ended mute', () => {
    const html = renderToStaticMarkup(createElement(MutedUntilLine, { mutedUntil: dmMuteUntil('forever') }));
    expect(html).toContain('Muted until you turn it back on');
  });

  it('draws nothing when the conversation is not muted, or the mute has ended', () => {
    expect(renderToStaticMarkup(createElement(MutedUntilLine, { mutedUntil: null }))).toBe('');
    const now = new Date('2026-12-21T12:00:00Z');
    expect(activeMuteUntil('2026-12-21T11:00:00.000Z', now)).toBeNull();
    expect(activeMuteUntil(null, now)).toBeNull();
    expect(activeMuteUntil('2026-12-21T13:00:00.000Z', now)?.toISOString()).toBe('2026-12-21T13:00:00.000Z');
  });
});
