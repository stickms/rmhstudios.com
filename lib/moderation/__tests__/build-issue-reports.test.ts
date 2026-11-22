import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-schema';

const h = vi.hoisted(() => ({ deleteMany: vi.fn(async () => ({ count: 1 })) }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { buildIssue: { deleteMany: h.deleteMany } } }));

import { moderatorRemoveIssue } from '@/lib/builds/issues.server';

/**
 * A bug report on a build (s10-09) goes through the existing report flow as `build-issue`: reportable, removable by
 * a moderator (the takedown deletes the issue), shown to the admin with its build, owned by the reporter, and the
 * report route refuses what the reporter could not read. The route and triage pull in Prisma and the session, so
 * they are read at source level, as the music report tests do.
 */
const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('build-issue reports', () => {
  it('is reportable and removable', () => {
    expect(REPORT_ENTITY_TYPES).toContain('build-issue');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('build-issue');
  });

  it('has a takedown branch that removes the issue, and an admin snippet with its build', () => {
    const triage = read('lib/moderation/triage.server.ts');
    expect(triage.slice(triage.indexOf('async function takedownReportedContent'))).toContain("'build-issue'");
    expect(triage).toContain('moderatorRemoveIssue(entityId)');
    expect(triage).toContain("groupKey('build-issue', bi.id)");
  });

  it('removes only the named issue, idempotently', async () => {
    await moderatorRemoveIssue('i1');
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { id: 'i1' } });
  });

  it('resolves the reported member as the reporter and refuses an issue the reporter cannot read', () => {
    const route = read('lib/moderation/api/moderation.report.server.ts');
    expect(route).toContain("case 'build-issue'");
    expect(route).toContain('reporterId: true');
    // A private build's issue, and one hidden from this reporter, answer like a missing one.
    expect(route).toContain('issuesReadable(bi.build.visibility, bi.build.userId === me)');
    expect(route).toContain('issueVisibleTo(bi,');
    expect(route).toContain("'Issue not found'");
  });
});
