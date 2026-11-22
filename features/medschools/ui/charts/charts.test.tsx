import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ActivityTypeDto } from '../../medschools.contract';
import { CategoryLines, CATEGORY_STYLE } from './CategoryLines';
import type { ChartLabels } from './ChartFrame';
import { CumulativeLine } from './CumulativeLine';
import { CycleOverlay } from './CycleOverlay';
import { DailyBars } from './DailyBars';

type Series = ActivityTypeDto['sources'][number];

const labels: ChartLabels = {
  title: 'Interview invites',
  unit: 'Reported events',
  unitDaily: 'Reported events per day',
  unitCumulative: 'Reported events, running total',
  daysSinceStart: 'Days since cycle start',
  sourcesLine: ({ primary, comparison }) =>
    `Sources: ${primary} (primary)${comparison.length ? `, ${comparison.join(', ')}` : ''}`,
  primary: 'Primary',
  comparison: 'Comparison',
  date: 'Date',
  day: 'Day',
  count: 'Count',
  cumulative: 'Cumulative',
  empty: 'No reported events yet',
  showData: 'Show data',
  summary: ({ lines }) => `Chart of ${lines.map((l) => `${l.name} ${l.total}`).join('; ')}`,
  locale: 'en-US',
};

const ct: Series = {
  source: 'CYCLETRACK',
  total: 6,
  days: [
    { date: '2026-11-20', count: 4 },
    { date: '2026-11-22', count: 2 },
  ],
};
const admit: Series = { source: 'ADMIT', total: 3, days: [{ date: '2026-11-21', count: 3 }] };
const empty: Series = { source: 'CYCLETRACK', total: 0, days: [] };

const cumulative = (xs: number[]) => xs.map((c, i) => ({ day: i * 10, cumulative: c }));

/** The first drawing (the phone one): path counts and the like are per drawing, the page holds one per width. */
const phone = (html: string) => html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
const wide = (html: string) => html.slice(html.lastIndexOf('<svg'), html.lastIndexOf('</svg>'));

function expectBasics(html: string) {
  expect(html).toContain('<svg');
  expect(html).toContain('role="img"');
  expect(html).toContain('Reported events');
  expect(html.match(/<svg/g)).toHaveLength(3);
  expect(html).toContain('<details');
  expect(html).toContain('<table');
  expect(html).toContain('dir="ltr"');
  expect(html).not.toContain('NaN');
  expect(html).not.toMatch(/ d=""/);
}

describe('DailyBars', () => {
  const props = { from: '2026-11-19', to: '2026-11-23', labels };
  it('renders the frame, names exactly the sources passed, and reads Nov 20 whatever the zone', () => {
    const html = renderToString(<DailyBars primary={ct} {...props} />);
    expectBasics(html);
    expect(html).toContain('CycleTrack');
    expect(html).not.toContain('Admit');
    expect(html).not.toContain('RMH');
    expect(html).toContain('Nov 20');
    expect(html).toContain('<rect');
  });
  it('draws the primary source only: no comparison line, nothing dashed, no zero line before the first report', () => {
    const html = renderToString(<DailyBars primary={ct} {...props} />);
    expect(html).not.toContain('stroke-dasharray');
    expect(html).not.toContain('<path');
    expect(html).toContain('Reported events per day');
  });
  it('an empty primary renders the empty state, no NaN, no empty path', () => {
    const html = renderToString(<DailyBars primary={empty} {...props} />);
    expectBasics(html);
    expect(html).toContain('No reported events yet');
  });
});

describe('CumulativeLine', () => {
  const props = { dayZeroOn: '2026-11-10', to: '2026-11-23', labels };
  it('renders, and the caption is built from the data it is given', () => {
    const html = renderToString(<CumulativeLine primary={ct} comparison={[admit]} {...props} />);
    expectBasics(html);
    expect(html).toContain('CycleTrack');
    expect(html).toContain('Admit.org');
    expect(html).not.toContain('RMH');
    expect(html).toContain('<path');
  });
  it('the x axis is calendar dates of the cycle, never a day count, and the phone drawing uses short end labels', () => {
    const html = renderToString(<CumulativeLine primary={ct} comparison={[admit]} {...props} />);
    expect(phone(html)).toContain('>Nov 10<');
    expect(phone(html)).toContain('>Nov 23<');
    expect(phone(html)).not.toContain('>Admit.org<');
    expect(phone(html)).toContain('>Admit<');
    expect(wide(html)).toContain('>Admit.org<');
    expect(html).toContain('Reported events, running total');
  });
  it('an empty primary is safe', () => {
    const html = renderToString(<CumulativeLine primary={empty} comparison={[]} {...props} />);
    expectBasics(html);
  });
});

describe('CategoryLines', () => {
  const series = (['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'] as const).map((t, i) => ({
    eventType: t,
    label: `Label-${t}`,
    shortLabel: `Short-${t}`,
    points: cumulative([i + 1, i + 3, i + 6]),
  }));
  const base = { series, sources: ['CYCLETRACK'] as const, dayZeroOn: '2026-06-01', labels };
  it('draws only the visible series, with an end label each', () => {
    const html = renderToString(<CategoryLines {...base} visible={['INTERVIEW', 'ACCEPTANCE']} />);
    expectBasics(html);
    expect(phone(html).match(/<path/g)).toHaveLength(2);
    expect(wide(html).match(/<path/g)).toHaveLength(2);
    expect(html).toContain('Label-INTERVIEW');
    expect(html).toContain('Label-ACCEPTANCE');
    expect(html).not.toContain('Label-WAITLIST');
  });
  it('prints calendar dates on the time axis and short end labels on the phone drawing only', () => {
    const html = renderToString(<CategoryLines {...base} visible={['INTERVIEW']} />);
    expect(phone(html)).toContain('>Jun 1<');
    expect(phone(html)).toContain('>Short-INTERVIEW<');
    expect(phone(html)).not.toContain('>Label-INTERVIEW<');
    expect(wide(html)).toContain('>Label-INTERVIEW<');
    expect(wide(html)).toContain('>Jun 21<');
  });
  it('uses the O4 dash patterns and widths', () => {
    expect(CATEGORY_STYLE.INTERVIEW).toEqual({ stroke: 'ink', width: 2 });
    expect(CATEGORY_STYLE.ACCEPTANCE).toEqual({ stroke: 'ink', width: 1.25 });
    expect(CATEGORY_STYLE.SECONDARY).toMatchObject({ stroke: 'muted', dash: '1 3' });
    expect(CATEGORY_STYLE.WAITLIST).toMatchObject({ stroke: 'muted', dash: '6 3' });
    expect(CATEGORY_STYLE.REJECTION).toMatchObject({ stroke: 'muted', dash: '8 3 2 3' });
    const html = renderToString(<CategoryLines {...base} visible={['SECONDARY', 'WAITLIST', 'REJECTION']} />);
    for (const d of ['1 3', '6 3', '8 3 2 3']) expect(html).toContain(`stroke-dasharray="${d}"`);
  });
  it('the table lists the visible categories only', () => {
    const html = renderToString(<CategoryLines {...base} visible={['INTERVIEW']} />);
    const table = html.slice(html.indexOf('<table'));
    expect(table).toContain('Label-INTERVIEW');
    expect(table).not.toContain('Label-SECONDARY');
  });
  it('no visible series (or none with data) renders the empty state, no NaN', () => {
    const html = renderToString(
      <CategoryLines {...base} series={series.map((s) => ({ ...s, points: [] }))} visible={['INTERVIEW']} />,
    );
    expectBasics(html);
    expect(html).toContain('No reported events yet');
    const none = renderToString(<CategoryLines {...base} visible={[]} />);
    expect(none).not.toContain('NaN');
  });
});

describe('CycleOverlay', () => {
  const cycles = [
    { cycleYear: 2026, points: cumulative([1, 5, 9]) },
    { cycleYear: 2025, points: cumulative([2, 6, 12]) },
    { cycleYear: 2024, points: cumulative([1, 2, 3]) },
  ];
  it('current cycle solid ink, priors muted with their own dashes, end labels, one source named', () => {
    const html = renderToString(<CycleOverlay cycles={cycles} sourceName="CycleTrack" labels={labels} />);
    expectBasics(html);
    expect(html).toContain('2026');
    expect(html).toContain('2025');
    expect(html).toContain('CycleTrack');
    expect(html).toContain('stroke-dasharray="6 3"');
    expect(phone(html).match(/<path/g)).toHaveLength(3);
    expect(html).toContain('Days since cycle start');
  });
  it('no cycles or all-empty cycles are safe', () => {
    expectBasics(renderToString(<CycleOverlay cycles={[]} sourceName="CycleTrack" labels={labels} />));
    expectBasics(
      renderToString(
        <CycleOverlay cycles={[{ cycleYear: 2026, points: [] }]} sourceName="CycleTrack" labels={labels} />,
      ),
    );
  });
});

describe('static rules', () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'));
  const ROOT = path.resolve(dir, '../../../..');
  it('has the five chart files', () => {
    expect(files.sort()).toEqual([
      'CategoryLines.tsx',
      'ChartFrame.tsx',
      'CumulativeLine.tsx',
      'CycleOverlay.tsx',
      'DailyBars.tsx',
    ]);
  });
  it.each(files)('%s uses only the three chart tokens and nothing that moves', (f) => {
    const src = readFileSync(path.join(dir, f), 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(/);
    expect(src).not.toMatch(/\b(fill|stroke)=["'](?!none["']|var\()[a-z]/i);
    for (const m of src.matchAll(/var\((--[\w-]+)/g)) {
      expect(['--site-text', '--site-text-muted', '--site-border']).toContain(m[1]);
    }
    expect(src).not.toMatch(
      /animate|transition|requestAnimationFrame|useEffect|dangerouslySetInnerHTML|gradient|<filter|filter[=:]|backdrop|shadow|window\b|Observer/,
    );
  });
  it('only engine/chart-geometry.ts imports d3-*', () => {
    const importers: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')) {
          if (/from ['"]d3-/.test(readFileSync(p, 'utf8'))) importers.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'features/medschools'));
    expect(importers).toEqual(['features/medschools/engine/chart-geometry.ts']);
  });
  it('routes and the api tier never import the charts', () => {
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) {
          if (/ui\/charts|chart-geometry/.test(readFileSync(p, 'utf8'))) offenders.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'app/routes'));
    walk(path.join(ROOT, 'features/medschools/api'));
    expect(offenders).toEqual([]);
  });
});
