import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-schema';

const h = vi.hoisted(() => ({
  updateMany: vi.fn(async () => ({
    count: 1,
  })),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    musicSprintDaily: {
      findUnique: vi.fn(async () => ({
        date: '2026-11-16',
        userId: 'u1',
      })),
      updateMany: h.updateMany,
    },
    musicShare: {
      findUnique: vi.fn(async () => ({
        userId: 'u1',
      })),
      updateMany: h.updateMany,
    },
  },
}));
vi.mock('@/lib/rmhmusic/learn/social/board-cache.server', () => ({
  invalidateBoard: vi.fn(async () => {}),
}));

import { hideMusicContent } from '@/lib/rmhmusic/learn/moderation.server';

/**
 * RMH Music's Daily board (Phase 6) adds two reportable things: a Daily score (`music-score`, the
 * `MusicSprintDaily` id) and a shared result link (`music-share`, the `MusicShare` id). A report type that the admin
 * page offers "Resolve & remove content" for must have a takedown branch, or the button resolves
 * the report and leaves the content up. The admin route is read at source level (it pulls in
 * Prisma and the session); `hideMusicContent` runs against a fake database, once per music type.
 */
const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('RMH Music in the moderation queue', () => {
  it('music-score and music-share are reportable', () => {
    expect(REPORT_ENTITY_TYPES).toContain('music-score');
    expect(REPORT_ENTITY_TYPES).toContain('music-share');
  });

  it('every removable type is reportable and has a takedown branch', () => {
    const takedown = read('lib/moderation/triage.server.ts');
    const body = takedown.slice(takedown.indexOf('async function takedownReportedContent'));
    for (const type of REMOVABLE_REPORT_ENTITY_TYPES) {
      expect(REPORT_ENTITY_TYPES).toContain(type);
      const handled = body.includes(`'${type}'`);
      expect(handled, `${type} has no takedown branch`).toBe(true);
    }
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('music-score');
    // s12-16: a grid, a deck, a persona and a listing are removable too, each with its branch above.
    for (const type of ['connections-grid', 'study-deck', 'persona', 'home-listing']) {
      expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain(type);
    }
    // s13-06: a message in an RMHTube room is removable too, and its branch deletes the row.
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('tube-chat');
    expect(body).toContain('takeDownChatMessage');
    // s13-16: an RMHBox prompt pack is removable too, and its branch stamps the pack removed for good.
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('rmhbox-pack');
    expect(body).toContain('takeDownPack');
    // s13-17: a message in a direct or group conversation is removable too, and its branch removes it as a moderator.
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('dm');
    expect(body).toContain('takeDownDmMessage');
  });

  it('the admin page offers removal from the one list, and the report route resolves music owners', () => {
    expect(read('components/admin/reports/ReportGroups.tsx')).toContain('REMOVABLE_REPORT_ENTITY_TYPES');
    expect(read('lib/moderation/api/moderation.report.server.ts')).toContain('musicReportOwner');
  });

  it('hideMusicContent takes down every removable music type, a shared link as well as a score', async () => {
    const music = REMOVABLE_REPORT_ENTITY_TYPES.filter((type) => type.startsWith('music-'));
    expect(music).toContain('music-score');
    for (const type of music) {
      h.updateMany.mockClear();
      await hideMusicContent(type, 'row-1');
      expect(h.updateMany, `${type} has no takedown in hideMusicContent`).toHaveBeenCalledTimes(1);
    }
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('music-share');
  });
});
