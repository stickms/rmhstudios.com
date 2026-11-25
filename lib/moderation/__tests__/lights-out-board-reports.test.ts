import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-schema';

/**
 * A member-made Lights Out board (s11-05) goes through the existing report flow as `lights-out-board`: reportable,
 * removable (the takedown hides it), shown to the admin by its title, and owned by the member who made it. The route
 * and triage pull in Prisma and the session, so they are read at source level, as the other report tests do.
 */
const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('lights-out-board reports', () => {
  it('is reportable and removable', () => {
    expect(REPORT_ENTITY_TYPES).toContain('lights-out-board');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('lights-out-board');
  });

  it('has a takedown branch that hides the board, and an admin snippet with its title', () => {
    const triage = read('lib/moderation/triage.server.ts');
    expect(triage.slice(triage.indexOf('async function takedownReportedContent'))).toContain("'lights-out-board'");
    expect(triage).toContain('hideLightsOutBoard(entityId)');
    expect(triage).toContain("groupKey('lights-out-board', id)");
  });

  it('resolves the reported member as the board’s author', () => {
    const route = read('lib/moderation/api/moderation.report.server.ts');
    expect(route).toContain("case 'lights-out-board'");
    expect(route).toContain('lightsOutBoardAuthor(entityId)');
  });

  it('is named in the reporter’s own list', () => {
    const panel = read('components/moderation/MyReportsPanel.tsx');
    expect(panel).toContain("'lights-out-board': t('kind-lights-out-board'");
    expect(panel).toContain("'lights-out-board': t('gone-lights-out-board'");
  });
});
