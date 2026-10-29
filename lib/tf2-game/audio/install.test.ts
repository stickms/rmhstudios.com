/**
 * The audio formats against the real games: soundscape scripts, closed captions (text and
 * compiled) and scenes/scenes.image. Needs the installs (skipped without them):
 *
 *   HL2_ROOT=/path/to/hl2demo PORTAL_ROOT=/path/to/portaldemo pnpm test:tf2 lib/tf2-game/audio
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameFileSystem, parseVpkDir, type SearchPath } from '../formats/vpk';
import { CompiledCaptions, parseCaptionsTxt, reduceCaption } from './captions';
import { SceneImage } from './scene-image';
import { parseSoundscapes } from './soundscapes';

const HL2 = process.env.HL2_ROOT ?? '';
const PORTAL = process.env.PORTAL_ROOT ?? '';

function vpk(root: string, dirFile: string): SearchPath | null {
  const full = path.join(root, dirFile);
  if (!fs.existsSync(full)) return null;
  const index = parseVpkDir(new Uint8Array(fs.readFileSync(full)));
  const base = full.replace(/_dir\.vpk$/, '');
  return {
    kind: 'vpk',
    index,
    readArchive: (archive, offset, length) => {
      const fd = fs.openSync(`${base}_${String(archive).padStart(3, '0')}.vpk`, 'r');
      try {
        const out = new Uint8Array(length);
        fs.readSync(fd, out, 0, length, offset);
        return out;
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}

function loose(root: string, dir: string): SearchPath {
  return {
    kind: 'loose',
    read: (p) => {
      const f = path.join(root, dir, p);
      return fs.existsSync(f) && fs.statSync(f).isFile()
        ? new Uint8Array(fs.readFileSync(f))
        : null;
    },
  };
}

/** The game's search path for these files (gameinfo.txt order, VPKs before loose files). */
function gameFs(game: 'hl2' | 'portal'): GameFileSystem {
  const root = game === 'hl2' ? HL2 : PORTAL;
  const g = new GameFileSystem();
  const dirs = game === 'hl2' ? ['hl2'] : ['portal', 'hl2'];
  for (const d of dirs) {
    for (const f of fs
      .readdirSync(path.join(root, d))
      .filter((n) => n.endsWith('_dir.vpk'))
      .sort()) {
      const sp = vpk(root, `${d}/${f}`);
      if (sp) g.add(sp);
    }
  }
  for (const d of dirs) g.add(loose(root, d));
  return g;
}

describe.skipIf(!PORTAL)('Portal: First Slice audio files', () => {
  it('parses the test chambers’ soundscapes', () => {
    const text = gameFs('portal').readText('scripts/soundscapes_testchmb_portal.txt');
    expect(text).toBeTruthy();
    const defs = parseSoundscapes(text ?? '');
    const s = defs['portal_testchmb.explore_space'];
    expect(s).toBeTruthy();
    expect(s.rules.some((r) => r.type === 'looping' && r.wave.startsWith('sound/ambient/'))).toBe(
      true,
    );
    expect(s.rules.some((r) => r.type === 'random' && r.waves.length > 0)).toBe(true);
  });

  it('reads captions from the text and the compiled file alike', () => {
    const g = gameFs('portal');
    const txt = parseCaptionsTxt(g.read('resource/closecaption_english.txt') ?? new Uint8Array());
    const dat = new CompiledCaptions(
      g.read('resource/closecaption_english.dat') ?? new Uint8Array(),
    );
    expect(txt.size).toBeGreaterThan(100);
    expect(dat.size).toBeGreaterThan(100);
    const token = 'Portal.00_part1_entry-1';
    expect(dat.get(token)).toBe(txt.get(token.toLowerCase()));
    const c = reduceCaption(txt.get(token.toLowerCase()) ?? '');
    expect(c.text).toContain('Hello and, again, welcome to the Aperture Science');
    expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(reduceCaption(txt.get('energyball.impact') ?? '').sfx).toBe(true);
  });

  it('finds the sounds a test chamber scene speaks in scenes.image', () => {
    const image = new SceneImage(gameFs('portal').read('scenes/scenes.image') ?? new Uint8Array());
    expect(image.version).toBe(2);
    expect(image.sceneCount).toBeGreaterThan(100);
    const s = image.summary('scenes/test_chamber/ai_00_a_entry.vcd');
    expect(s).not.toBeNull();
    expect(s?.duration).toBeCloseTo(60.046, 2);
    expect(s?.sounds).toContain('Portal.00_part1_entry-1');
    expect(s?.sounds).toContain('Portal.ding_on');
    expect(image.data('scenes/test_chamber/ai_00_a_entry.vcd')?.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!HL2)('Half-Life 2 demo audio files', () => {
  it('parses the trainstation soundscapes', () => {
    const text = gameFs('hl2').readText('scripts/soundscapes_trainyard.txt');
    const defs = parseSoundscapes(text ?? '');
    expect(defs['d1_trainstation.Turnstyle']).toBeTruthy();
    expect(defs['d1_trainstation.Turnstyle'].rules.length).toBeGreaterThan(0);
  });

  it('reads Breen’s captions', () => {
    const g = gameFs('hl2');
    const txt = parseCaptionsTxt(g.read('resource/closecaption_english.txt') ?? new Uint8Array());
    const dat = new CompiledCaptions(
      g.read('resource/closecaption_english.dat') ?? new Uint8Array(),
    );
    expect(dat.get('breencast.br_welcome01')).toBe(txt.get('breencast.br_welcome01'));
    expect(reduceCaption(txt.get('breencast.br_welcome01') ?? '').text).toMatch(/^<i>.+<\/i>$/);
  });

  it('finds the Breencast welcome scene', () => {
    const image = new SceneImage(gameFs('hl2').read('scenes/scenes.image') ?? new Uint8Array());
    const s = image.summary('scenes/Breencast/welcome.vcd');
    expect(s?.sounds).toEqual([
      'breencast.br_welcome01',
      'breencast.br_welcome02',
      'breencast.br_welcome03',
      'breencast.br_welcome04',
      'breencast.br_welcome05',
      'breencast.br_welcome06',
      'breencast.br_welcome07',
    ]);
    expect(s?.duration).toBeCloseTo(42, 2);
    expect(image.summary('scenes/not/there.vcd')).toBeNull();
  });
});
