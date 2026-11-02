import { describe, expect, it } from 'vitest';
import { buildStateViews } from '../map-model';
import {
  decodePicks,
  encodePicks,
  nextPick,
  project,
  raceKey,
  scorePicks,
} from '../predict';
import { normalizeNytPage } from '../nyt';
import { STATE_CODES } from '../states';
import { TILE_CODES, TILE_POS, GRID_COLS, GRID_ROWS } from '../tilegrid';
import { housePage, senatePage } from './fixtures';

describe('tile grid', () => {
  it('places every state and DC exactly once, inside the grid, without overlaps', () => {
    expect([...TILE_CODES].sort()).toEqual([...STATE_CODES].sort());
    const cells = new Set<string>();
    for (const [r, c] of Object.values(TILE_POS)) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(GRID_ROWS);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(GRID_COLS);
      cells.add(`${r},${c}`);
    }
    expect(cells.size).toBe(TILE_CODES.length);
  });
});

describe('buildStateViews', () => {
  const sen = normalizeNytPage(senatePage, 'senate').races;
  const views = buildStateViews(sen, 'senate');

  it('only includes states with a race', () => {
    expect([...views.keys()].sort()).toEqual(['MI', 'OH', 'PA', 'TX']);
  });
  it('colours called races by winner with the margin', () => {
    expect(views.get('PA')).toMatchObject({ tone: 'DEM', phase: 'called', caption: 'D+20.0' });
    expect(views.get('MI')).toMatchObject({ tone: 'GOP', flipped: true });
  });
  it('shows the leader while counting', () => {
    expect(views.get('OH')).toMatchObject({ tone: 'gop-lead', phase: 'counting', caption: 'R+1.0' });
  });
  it('falls back to the rating before votes', () => {
    expect(views.get('TX')).toMatchObject({ tone: 'gop-lean', phase: 'ratings', caption: 'R+' });
  });
  it('summarises multi-district House states', () => {
    const house = normalizeNytPage(housePage, 'house').races;
    const v = buildStateViews(house, 'house');
    expect(v.get('AL')?.phase).toBe('ratings');
    expect(v.get('WY')).toBeDefined();
  });
});

describe('picks', () => {
  it('cycles unpicked → DEM → TOSS → GOP → unpicked', () => {
    let p = nextPick(undefined);
    const seen = [p];
    for (let i = 0; i < 3; i++) {
      p = nextPick(p);
      seen.push(p);
    }
    expect(seen).toEqual(['DEM', 'TOSS', 'GOP', undefined]);
  });

  it('round-trips through the URL form and ignores junk', () => {
    const picks = { 'PA-G-S': 'DEM', 'OH-S_W-S': 'GOP', 'WI-G-G': 'TOSS' } as const;
    const enc = encodePicks({ ...picks });
    expect(enc).toBe('OH-S_W-S.r,PA-G-S.d,WI-G-G.t');
    expect(decodePicks(enc)).toEqual(picks);
    expect(decodePicks('bogus,PA-G-S.x,<script>.d,PA-G-S.d')).toEqual({ 'PA-G-S': 'DEM' });
    expect(decodePicks(enc, new Set(['PA-G-S']))).toEqual({ 'PA-G-S': 'DEM' });
    expect(decodePicks(null)).toEqual({});
    expect(decodePicks('x'.repeat(5000))).toEqual({});
  });

  const parsed = normalizeNytPage(senatePage, 'senate');
  it('projects control from holdovers plus picks', () => {
    const picks = { 'PA-G-S': 'DEM', 'OH-S_W-S': 'GOP', 'MI-G-S': 'DEM' } as const;
    const p = project({ ...picks }, parsed.races, parsed.chamber!);
    // notUp: DEM 34, GOP 31 in the fixture
    expect(p).toMatchObject({ DEM: 36, GOP: 32, open: 1, toWin: 51, controlledBy: null });
  });

  it('scores only called races where a side was picked', () => {
    const picks = { 'PA-G-S': 'DEM', 'MI-G-S': 'DEM', 'OH-S_W-S': 'GOP', 'TX-G-S': 'TOSS' } as const;
    expect(scorePicks({ ...picks }, parsed.races)).toEqual({
      correct: 1, // PA
      wrong: 1, // MI went GOP
      pending: 1, // OH still counting
      abstained: 1, // TX toss-up
      accuracy: 50,
    });
    expect(scorePicks({}, parsed.races).accuracy).toBeNull();
  });

  it('keys races without the date', () => {
    expect(raceKey({ id: 'PA-G-S-2026-11-03' })).toBe('PA-G-S');
    expect(raceKey({ id: 'OH-S_W-S-2026-11-03' })).toBe('OH-S_W-S');
  });
});
