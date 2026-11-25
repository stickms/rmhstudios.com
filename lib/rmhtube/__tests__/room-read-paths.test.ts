import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TUBE_ROOM_READ_PATHS } from '@/lib/rmhtube/room-reports';

/**
 * s14-10: every server path that reads RMHTube rooms to show or start them leaves a removed room (`moderatedAt`) out.
 * `TUBE_ROOM_READ_PATHS` names each one; this scan strips comments and requires real use, so a comment cannot pass it.
 *
 * - `filter`: the file's own queries carry `moderatedAt: null`.
 * - `delegates`: the file imports the named functions from a `filter` file and calls them.
 * - `closed`: the file reads `closedAt` and the takedown always stamps it (held in `room-reports.test.ts`).
 */

const root = join(__dirname, '..', '..', '..');

/** The source without `//` and block comments or string-looking comment text, so a mention cannot satisfy a scan. */
function code(file: string): string {
  const source = readFileSync(join(root, file), 'utf8');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const filterFiles = TUBE_ROOM_READ_PATHS.filter((p) => p.how === 'filter').map((p) => p.file);

describe('TUBE_ROOM_READ_PATHS', () => {
  it('lists each file once, and every file exists', () => {
    const files = TUBE_ROOM_READ_PATHS.map((p) => p.file);
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) expect(() => readFileSync(join(root, file), 'utf8'), file).not.toThrow();
  });

  it('names the reads the specification lists: landing, list, page, calendar, developer API, hub', () => {
    const files = TUBE_ROOM_READ_PATHS.map((p) => p.file);
    expect(files).toContain('lib/rmhtube/parties.server.ts');
    expect(files).toContain('lib/api/v1/rmhtube.server.ts');
    expect(files).toContain('server/rmhtube/room-manager.ts');
    expect(files).toContain('app/routes/api/rmhtube/parties/$roomId/ics.ts');
  });

  for (const path of TUBE_ROOM_READ_PATHS) {
    it(`${path.file} (${path.how}) leaves a removed room out`, () => {
      const source = code(path.file);
      if (path.how === 'filter') {
        expect(source, `${path.file} reads rooms without moderatedAt: null`).toMatch(/moderatedAt:\s*null/);
      } else if (path.how === 'delegates') {
        expect(filterFiles, `${path.file} delegates to a file that is not a filter path`).toContain(path.from);
        const from = path.from.replace(/\.ts$/, '').replace(/^lib\//, '@/lib/');
        const imported = source.match(
          new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${from.replace(/[$/]/g, '\\$&')}'`),
        );
        expect(imported, `${path.file} does not import from ${path.from}`).not.toBeNull();
        for (const fn of path.functions) {
          expect(imported?.[1], `${path.file} does not import ${fn}`).toMatch(new RegExp(`\\b${fn}\\b`));
          expect(source, `${path.file} never calls ${fn}`).toMatch(new RegExp(`\\b${fn}\\(`));
          // The delegate must itself be a filtered read: the function exists in the filter file.
          expect(code(path.from), `${path.from} does not define ${fn}`).toMatch(
            new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`),
          );
        }
      } else {
        expect(source, `${path.file} no longer reads closedAt`).toMatch(/closedAt/);
      }
    });
  }

  it('the takedown stamps closedAt with moderatedAt, which the closed-path readers rely on', () => {
    const source = code('lib/rmhtube/room-reports.server.ts');
    expect(source).toMatch(/moderatedAt:\s*now/);
    expect(source).toMatch(/closedAt:\s*now/);
  });

  it('both hub loaders carry the filter', () => {
    const source = code('server/rmhtube/room-manager.ts');
    expect(source.match(/moderatedAt:\s*null/g)?.length).toBeGreaterThanOrEqual(2);
    // restoreRoomsFromDb and loadRoomFromDb each read `closedAt: null` and must sit beside the filter.
    for (const fn of ['restoreRoomsFromDb', 'loadRoomFromDb']) {
      const start = source.indexOf(`async ${fn}(`);
      expect(start, fn).toBeGreaterThan(-1);
      const body = source.slice(start, start + 900);
      expect(body, `${fn} reads closedAt: null without moderatedAt: null`).toMatch(
        /closedAt:\s*null,\s*moderatedAt:\s*null/,
      );
    }
  });

  it('every listing in parties.server filters a removed room', () => {
    const source = code('lib/rmhtube/parties.server.ts');
    // listUpcoming (the shared `open` filter), getParty and partyForCalendar.
    expect(source.match(/moderatedAt:\s*null/g)?.length).toBeGreaterThanOrEqual(3);
    const upcoming = source.slice(source.indexOf('export async function listUpcoming'));
    expect(upcoming.slice(0, upcoming.indexOf('const NOTIFY_ENTITY'))).toMatch(/moderatedAt:\s*null/);
  });
});
