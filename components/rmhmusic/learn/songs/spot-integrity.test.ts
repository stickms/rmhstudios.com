/**
 * Spot practice is never scored or saved. The behaviour is built so it cannot be (the segment is its own
 * song, so the server's `checkSongRun` refuses its record: `lib/.../songs/spot.test.ts`), and this guard
 * keeps the wiring honest: the spot run is given the saver that keeps nothing, the real saver is made
 * once for the whole-song run, the practice clock is not started for a spot run, and the pure spot module
 * imports nothing that talks to the server.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const screen = read('components/rmhmusic/learn/songs/SongScreen.tsx');
const spotModule = read('lib/rmhmusic/learn/songs/spot.ts');

/** The JSX of the SongRun that carries `spot={{`, which is the spot-practice run. */
function spotRunJsx(): string {
  const start = screen.indexOf('key={`spot:');
  expect(start, 'the spot run is in the screen').toBeGreaterThan(-1);
  const end = screen.indexOf('/>', screen.indexOf('onPass:', start));
  return screen.slice(start, end);
}

describe('spot practice keeps nothing', () => {
  it('gives the spot run the memory saver, no best, and never the real saver', () => {
    const jsx = spotRunJsx();
    expect(jsx).toContain('saver={spotSaver}');
    expect(jsx).toContain('best={undefined}');
    expect(jsx).toContain('onBest={() => undefined}');
    expect(jsx).not.toContain('saver={saver}');
  });

  it('makes the spot saver from the one that saves nothing, and the real saver only once', () => {
    expect(screen).toMatch(/spotSaver = useMemo<SongSaver>\(\(\) => createMemorySongSaver\(\), \[\]\)/);
    expect(screen.match(/createApiSongSaver\(\)/g)).toHaveLength(1);
  });

  it('does not start the practice-log clock for a spot run', () => {
    expect(screen).toContain('if (!spot) beginActivity();');
    expect(screen.match(/beginActivity\(\)/g)).toHaveLength(1);
    expect(screen).not.toContain('endActivity');
  });

  it('keeps the spot module away from the saver, the contract client and the server', () => {
    const imports = spotModule
      .split('\n')
      .filter((l) => l.startsWith('import '))
      .join('\n');
    for (const forbidden of [
      './saver',
      'songs.contract',
      'songs.server',
      'contract/client',
      'activity-clock',
      '.server',
    ]) {
      expect(imports, forbidden).not.toContain(forbidden);
    }
  });
});
