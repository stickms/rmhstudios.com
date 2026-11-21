import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));

import { CompareTable } from '../CompareTable';
import type { CompareRow, SideState } from '@/lib/achievements/compare';

const locked = (progress = 0): SideState => ({ unlocked: false, unlockedAt: null, progress });
const done: SideState = { unlocked: true, unlockedAt: '2026-05-03T12:00:00Z', progress: 1 };
const row = (id: string, bucket: CompareRow['bucket'], extra: Partial<CompareRow> = {}): CompareRow => ({
  id,
  masked: false,
  name: `Name ${id}`,
  description: `Desc ${id}`,
  icon: '',
  tier: 'bronze',
  category: 'games',
  target: 1,
  rarity: null,
  you: bucket === 'both' || bucket === 'you' ? done : locked(),
  them: bucket === 'both' || bucket === 'them' ? done : locked(),
  bucket,
  trackable: bucket === 'them',
  ...extra,
});

const render = (rows: CompareRow[], canTrack = true) =>
  renderToStaticMarkup(
    <CompareTable
      rows={rows}
      themName="Alex"
      trackedIds={new Set()}
      busyId={null}
      canTrack={canTrack}
      onToggleTrack={() => {}}
    />,
  );

describe('CompareTable', () => {
  it('is a table with a caption and column headers for both members', () => {
    const html = render([row('a', 'both')]);
    expect(html).toContain('<caption');
    expect(html).toContain('scope="col"');
    expect(html).toContain('>You<');
    expect(html).toContain('>Alex<');
  });

  it('writes each state as words: unlocked with a date, progress, locked', () => {
    const html = render([row('a', 'both'), row('b', 'you', { target: 10, them: locked(3) })]);
    expect(html).toContain('Unlocked');
    expect(html).toMatch(/2026/);
    expect(html).toContain('Locked');
    expect(html).toContain('3 / 10');
  });

  it('shows rarity as a percentage of players', () => {
    expect(render([row('a', 'both', { rarity: 0.04 })])).toContain('4% of players');
  });

  it('offers Track only on "Only them" rows', () => {
    const html = render([row('a', 'both'), row('b', 'you'), row('c', 'them'), row('d', 'neither')]);
    expect(html.match(/Track /g)).toHaveLength(1);
    expect(html).toContain('Track Name c');
  });

  it('hides Track until the tracker has loaded', () => {
    expect(render([row('c', 'them')], false)).not.toContain('Track');
  });

  it('shows a masked secret without its name and without Track', () => {
    const html = render([
      row('s', 'them', { masked: true, name: '', description: '', trackable: false }),
    ]);
    expect(html).toContain('A secret achievement');
    expect(html).not.toContain('Track');
    expect(html).toContain('Unlocked');
  });
});
