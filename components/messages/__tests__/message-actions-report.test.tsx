/**
 * s13-17: the "Report message" row is on another member's message only: not your own, not an unsent one, not a system
 * or tip line. The direct menu (`MessageActions`) and the group menu (`GroupMessageMenu`) both reach the same row and
 * the same dialog (entity type `dm`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown> & { defaultValue?: string }) =>
      (o?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o?.[name] ?? '')),
  }),
}));

const { MessageReportRow, ReportMenuRow } = await import('../ReportMessage');
const { canReportMessage } = await import('@/lib/messages/dm-report');

const other = { senderId: 'them', deletedAt: null, kind: 'text' };
const render = (message: Parameters<typeof MessageReportRow>[0]['message'], viewerId = 'me') =>
  renderToStaticMarkup(createElement(MessageReportRow, { message, viewerId, onReport: () => {} }));

describe('the report row', () => {
  it('is on another member’s message', () => {
    const html = render(other);
    expect(html).toContain('Report message');
    expect(html).toContain('role="menuitem"');
  });

  it('is not on your own message', () => {
    expect(render({ ...other, senderId: 'me' })).toBe('');
  });

  it('is not on an unsent message', () => {
    expect(render({ ...other, deletedAt: '2026-12-21T10:00:00.000Z' })).toBe('');
  });

  it('is not on a system line or a tip', () => {
    expect(render({ ...other, kind: 'system' })).toBe('');
    expect(render({ ...other, kind: 'tip' })).toBe('');
  });

  it('is on a card kind another member sent (dice, a poll)', () => {
    expect(render({ ...other, kind: 'dice' })).toContain('Report message');
  });

  it('the same rule is one function for both menus', () => {
    expect(canReportMessage({ senderId: 'them' }, 'me')).toBe(true);
    expect(canReportMessage({ senderId: 'me' }, 'me')).toBe(false);
    expect(renderToStaticMarkup(createElement(ReportMenuRow, { onReport: () => {} }))).toContain('Report message');
  });
});

describe('where the row is mounted', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  it('the direct menu shows it and opens the dialog for entity type dm', () => {
    const menu = read('components/messages/MessageActions.tsx');
    expect(menu).toContain('<MessageReportRow');
    expect(menu).toContain('<ReportMessageDialog');
    expect(read('components/messages/ReportMessage.tsx')).toContain('entityType="dm"');
  });

  it('the group menu shows it for another member’s message and opens the same dialog', () => {
    expect(read('components/chat-plus/MessagePlusItems.tsx')).toContain('<ReportMenuRow');
    const row = read('components/feed/group-chat/GroupMessageRow.tsx');
    expect(row).toContain('canReportMessage(');
    expect(row).toContain('<ReportMessageDialog');
  });
});
