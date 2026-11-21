/** Moderation log, pure parts: the action lists, the public filter and the CSV. */
import { describe, expect, it } from 'vitest';
import {
  MOD_ACTIONS,
  MOD_ACTIONS_BY_GROUP,
  MOD_LOG_CSV_COLUMNS,
  PUBLIC_MOD_ACTIONS,
  groupOfAction,
  isModAction,
  modLogToCsv,
  toPublicEntry,
  type ModLogEntryDTO,
} from '@/lib/communities/modlog';

const row = (over: Partial<Parameters<typeof toPublicEntry>[0]> = {}) => ({
  id: 7n,
  action: 'content_removed',
  targetType: 'post' as string | null,
  ruleTitle: 'Be kind' as string | null,
  reason: 'Insulting' as string | null,
  createdAt: new Date('2026-11-20T10:00:00Z'),
  ...over,
});

const entry = (over: Partial<ModLogEntryDTO> = {}): ModLogEntryDTO => ({
  id: '1',
  action: 'content_removed',
  actor: {
    id: 'u1',
    name: 'Mod One',
    handle: 'modone',
  },
  targetUser: {
    id: 'u2',
    name: 'Member',
    handle: 'member',
  },
  targetType: 'post',
  targetId: 'p1',
  ruleTitle: 'Be kind',
  reason: 'Insulting',
  detail: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  ...over,
});

describe('action codes', () => {
  it('every code fits the 32-character column and appears in exactly one group', () => {
    for (const a of MOD_ACTIONS) {
      expect(a.length).toBeLessThanOrEqual(32);
      const groups = Object.values(MOD_ACTIONS_BY_GROUP).filter((g) => (g as readonly string[]).includes(a));
      expect(groups, a).toHaveLength(1);
    }
    expect(new Set(MOD_ACTIONS).size).toBe(MOD_ACTIONS.length);
  });

  it('maps a code to its group and recognises only known codes', () => {
    expect(groupOfAction('member_removed')).toBe('members');
    expect(groupOfAction('rules_changed')).toBe('settings');
    expect(groupOfAction('content_approved')).toBe('content');
    expect(isModAction('content_removed')).toBe(true);
    expect(isModAction('nuke')).toBe(false);
  });

  it('keeps bans, role changes and settings out of the public subset', () => {
    expect([...PUBLIC_MOD_ACTIONS]).toEqual(['content_removed', 'content_approved']);
    for (const a of MOD_ACTIONS_BY_GROUP.members) {
      expect(
        toPublicEntry(
          row({
            action: a,
          }),
        ),
      ).toBeNull();
    }
    for (const a of MOD_ACTIONS_BY_GROUP.settings) {
      expect(
        toPublicEntry(
          row({
            action: a,
          }),
        ),
      ).toBeNull();
    }
  });
});

describe('toPublicEntry', () => {
  it('returns only the allow-listed fields, even if the row carries more', () => {
    const e = toPublicEntry({
      ...row(),
      actorId: 'u1',
      targetUserId: 'u2',
      detail: {
        secret: true,
      },
    } as ReturnType<typeof row>);
    expect(e).toEqual({
      id: '7',
      action: 'content_removed',
      targetType: 'post',
      ruleTitle: 'Be kind',
      reason: 'Insulting',
      createdAt: '2026-11-20T10:00:00.000Z',
    });
    expect(Object.keys(e!).sort()).toEqual(['action', 'createdAt', 'id', 'reason', 'ruleTitle', 'targetType'].sort());
  });

  it('shows a comment as a comment and anything else as a post', () => {
    expect(
      toPublicEntry(
        row({
          targetType: 'comment',
        }),
      )!.targetType,
    ).toBe('comment');
    expect(
      toPublicEntry(
        row({
          targetType: null,
        }),
      )!.targetType,
    ).toBe('post');
  });
});

describe('modLogToCsv', () => {
  it('writes a header and one CRLF-terminated line per action', () => {
    const csv = modLogToCsv([
      entry(),
      entry({
        id: '2',
        action: 'member_removed',
      }),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(MOD_LOG_CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2026-11-20T10:00:00.000Z,modone,content_removed,member,post,p1,Be kind,Insulting');
    expect(lines[3]).toBe('');
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = modLogToCsv([
      entry({
        reason: 'He said "no", twice\nthen left',
      }),
    ]);
    expect(csv).toContain('"He said ""no"", twice\nthen left"');
  });

  it('defuses cells a spreadsheet would read as a formula', () => {
    const csv = modLogToCsv([
      entry({
        reason: '=HYPERLINK("http://x")',
        ruleTitle: '+1',
        actor: {
          id: 'u',
          name: '@evil',
          handle: null,
        },
      }),
    ]);
    const cells = csv.split('\r\n')[1]!;
    expect(cells).toContain(`'@evil`);
    expect(cells).toContain(`'+1`);
    expect(cells).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it('leaves a deleted member empty and falls back to the name without a handle', () => {
    const csv = modLogToCsv([
      entry({
        actor: null,
        targetUser: {
          id: 'u3',
          name: 'No Handle',
          handle: null,
        },
      }),
    ]);
    expect(csv.split('\r\n')[1]!.startsWith('2026-11-20T10:00:00.000Z,,content_removed,No Handle,')).toBe(true);
  });

  it('is just the header for an empty log', () => {
    expect(modLogToCsv([])).toBe(`${MOD_LOG_CSV_COLUMNS.join(',')}\r\n`);
  });
});
