import { describe, it, expect } from 'vitest';
import { auditRowsToCsv, buildAuditWhere, csvCell, parseAuditFilters } from '@/lib/admin/audit-query';

const qs = (s: string) => new URLSearchParams(s);

describe('parseAuditFilters', () => {
  it('reads action, target type and an inclusive day range', () => {
    const f = parseAuditFilters(qs('action=user.&targetType=user&from=2026-10-01&to=2026-10-31'));
    expect(f.action).toBe('user.');
    expect(f.targetType).toBe('user');
    expect(f.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(f.to?.toISOString()).toBe('2026-10-31T23:59:59.999Z');
  });

  it('ignores blanks and malformed dates', () => {
    const f = parseAuditFilters(qs('action=%20%20&from=yesterday&to=2026-13-45'));
    expect(f).toEqual({ action: undefined, targetType: undefined, from: undefined, to: undefined });
  });

  it('caps over-long values', () => {
    expect(parseAuditFilters(qs(`action=${'a'.repeat(200)}`)).action).toHaveLength(64);
  });
});

describe('buildAuditWhere', () => {
  it('is empty with no filters', () => {
    expect(buildAuditWhere({})).toEqual({});
  });

  it('prefix-matches the action and bounds createdAt', () => {
    const from = new Date('2026-10-01T00:00:00Z');
    expect(buildAuditWhere({ action: 'user.', from })).toEqual({
      action: { startsWith: 'user.' },
      createdAt: { gte: from },
    });
  });
});

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });

  it('treats null and undefined as empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('auditRowsToCsv', () => {
  it('writes a header and one CRLF-terminated line per row', () => {
    const csv = auditRowsToCsv([
      { createdAt: '2026-10-31T12:00:00.000Z', admin: 'Sam', action: 'user.ban', targetType: 'user', targetId: 'u1', detail: '=cmd' },
    ]);
    expect(csv).toBe(
      "time,admin,action,targetType,targetId,detail\r\n2026-10-31T12:00:00.000Z,Sam,user.ban,user,u1,'=cmd\r\n",
    );
  });
});
