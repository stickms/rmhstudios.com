import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ActivityTypeDto } from '../../medschools.contract';
import { CategoryLines } from './CategoryLines';
import { CATEGORY_COLOR, CATEGORY_STYLE, SOURCE_COLOR, cycleColor } from './chartColors';
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
  sourcesLine: ({ primary, comparison }) =>
    `Sources: ${primary} (primary)${comparison.length ? `, ${comparison.join(', ')}` : ''}`,
  sourcesPlain: (names) => `Sources: ${names.join(', ')}`,
  primary: 'Primary',
  comparison: 'Comparison',
  date: 'Date',
  count: 'Count',
  cumulative: 'Cumulative',
  empty: 'No reported events yet',
  showData: 'Show data',
  hint: 'Use the arrow keys to read values by date',
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
const phone = (html: string) => {
  const a = html.indexOf('<svg viewBox="0 0 252');
  return html.slice(a, html.indexOf('</svg>', a));
};
const wide = (html: string) => {
  const a = html.indexOf('<svg viewBox="0 0 640');
  return html.slice(a, html.indexOf('</svg>', a));
};

function expectBasics(html: string, empty = false) {
  expect(html).toContain('<svg');
  // A chart with something to read is one focusable group (arrow keys move the crosshair); an empty one is a plain image.
  if (!empty) {
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="0"');
  }
  expect(html).toContain('border-site-border bg-site-surface');
  expect(html).toContain('Reported events');
  expect(html.match(/<svg viewBox/g)).toHaveLength(3);
  expect(html).toContain('<details');
  expect(html).toContain('<table');
  expect(html).toContain('dir="ltr"');
  expect(html).not.toContain('NaN');
  expect(html).not.toMatch(/ d=""/);
}

describe('DailyBars', () => {
  const props = { from: '2026-11-19', to: '2026-11-23', color: 'var(--site-chart-1)', labels };
  it('renders the frame, names exactly the sources passed, and reads Nov 20 whatever the zone', () => {
    const html = renderToString(<DailyBars primary={ct} {...props} />);
    expectBasics(html);
    expect(html).toContain('CycleTrack');
    expect(html).not.toContain('Admit');
    expect(html).not.toContain('RMH');
    expect(html).toContain('Nov 20');
    expect(html).toContain('<rect');
    expect(html).toContain('fill="var(--site-chart-1)"');
  });
  it('draws the primary source only: no comparison line, nothing dashed, no zero line before the first report', () => {
    const html = renderToString(<DailyBars primary={ct} {...props} />);
    expect(html).not.toContain('stroke-dasharray');
    expect(html).not.toContain('<path');
    expect(html).toContain('Reported events per day');
  });
  it('one series: no legend and no end label', () => {
    const html = renderToString(<DailyBars primary={ct} {...props} />);
    expect(html).not.toContain('<ul');
    expect(phone(html)).not.toContain('>CycleTrack<');
  });
  it('an empty primary renders the empty state, no NaN, no empty path', () => {
    const html = renderToString(<DailyBars primary={empty} {...props} />);
    expectBasics(html, true);
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
  it('the x axis is calendar dates of the cycle, never a day count; a legend names the sources, no end labels', () => {
    const html = renderToString(<CumulativeLine primary={ct} comparison={[admit]} {...props} />);
    expect(phone(html)).toContain('>Nov 10<');
    expect(phone(html)).toContain('>Nov 23<');
    expect(phone(html)).not.toContain('>Admit.org<');
    expect(html).toContain('<ul');
    expect(html).toContain(`stroke="${SOURCE_COLOR.CYCLETRACK}"`);
    expect(html).toContain(`stroke="${SOURCE_COLOR.ADMIT}"`);
    expect(html).toContain('Reported events, running total');
  });
  it('rises from 0: the path starts at the baseline on the first day', () => {
    const html = renderToString(<CumulativeLine primary={ct} comparison={[]} {...props} />);
    const d = /<path d="M([\d.]+),([\d.]+)/.exec(phone(html));
    expect(d).not.toBeNull();
    // The first point is x = plot left (day 0), y = the plot bottom (value 0).
    expect(Number(d![1])).toBeCloseTo(38, 1);
    expect(Number(d![2])).toBeCloseTo(196, 1);
  });
  it('an empty primary is safe', () => {
    const html = renderToString(<CumulativeLine primary={empty} comparison={[]} {...props} />);
    expectBasics(html, true);
  });
});

describe('CategoryLines caption', () => {
  it('names the given sources plainly, with no (primary)', () => {
    const html = renderToString(
      <CategoryLines
        series={[{ eventType: 'INTERVIEW', label: 'Interview', points: cumulative([1, 2]) }]}
        visible={['INTERVIEW']}
        sources={['CYCLETRACK', 'ADMIT']}
        dayZeroOn="2026-06-01"
        labels={labels}
      />,
    );
    expect(html).toContain('Sources: CycleTrack, Admit.org');
    expect(html).not.toContain('(primary)');
  });
});

describe('CategoryLines', () => {
  const series = (['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'] as const).map((t, i) => ({
    eventType: t,
    label: `Label-${t}`,
    points: cumulative([i + 1, i + 3, i + 6]),
  }));
  const base = { series, sources: ['CYCLETRACK'] as const, dayZeroOn: '2026-06-01', labels };
  it('draws only the visible series, each in its fixed category colour', () => {
    const html = renderToString(<CategoryLines {...base} visible={['INTERVIEW', 'ACCEPTANCE']} />);
    expectBasics(html);
    expect(phone(html).match(/<path/g)).toHaveLength(2);
    expect(wide(html).match(/<path/g)).toHaveLength(2);
    expect(phone(html)).toContain(`stroke="${CATEGORY_COLOR.INTERVIEW}"`);
    expect(phone(html)).toContain(`stroke="${CATEGORY_COLOR.ACCEPTANCE}"`);
    expect(phone(html)).not.toContain(`stroke="${CATEGORY_COLOR.WAITLIST}"`);
    expect(html).not.toContain('Label-WAITLIST');
  });
  it('a category keeps its colour whichever others are on (colour follows the entity)', () => {
    const alone = renderToString(<CategoryLines {...base} visible={['INTERVIEW']} />);
    const all = renderToString(
      <CategoryLines {...base} visible={['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE']} />,
    );
    expect(alone).toContain(`stroke="${CATEGORY_COLOR.INTERVIEW}"`);
    expect(all).toContain(`stroke="${CATEGORY_COLOR.INTERVIEW}"`);
    expect(new Set(Object.values(CATEGORY_COLOR)).size).toBe(5);
  });
  it('prints calendar dates on the time axis and no end labels', () => {
    const html = renderToString(<CategoryLines {...base} visible={['INTERVIEW']} />);
    expect(phone(html)).toContain('>Jun 1<');
    expect(phone(html)).not.toContain('>Label-INTERVIEW<');
    expect(wide(html)).not.toContain('>Label-INTERVIEW<');
    expect(wide(html)).toContain('>Jun 21<');
  });
  it('the legend slot is rendered above the plot inside the card', () => {
    const html = renderToString(
      <CategoryLines {...base} visible={['INTERVIEW']} legend={<div data-legend="yes">legend</div>} />,
    );
    expect(html.indexOf('data-legend')).toBeGreaterThan(html.indexOf('<figure'));
    expect(html.indexOf('data-legend')).toBeLessThan(html.indexOf('<svg'));
  });
  it('keeps the dash patterns and widths as the secondary cue', () => {
    expect(CATEGORY_STYLE.INTERVIEW).toMatchObject({ width: 2 });
    expect(CATEGORY_STYLE.INTERVIEW.dash).toBeUndefined();
    const dashes = Object.values(CATEGORY_STYLE).map((s) => s.dash);
    expect(new Set(dashes).size).toBe(5);
    const html = renderToString(<CategoryLines {...base} visible={['SECONDARY', 'WAITLIST', 'REJECTION']} />);
    for (const t of ['SECONDARY', 'WAITLIST', 'REJECTION'] as const)
      expect(html).toContain(`stroke-dasharray="${CATEGORY_STYLE[t].dash}"`);
  });
  it('rises from 0 on day zero: the first point of each line is the plot left at the baseline', () => {
    const html = renderToString(<CategoryLines {...base} visible={['INTERVIEW']} />);
    const d = /<path d="M([\d.]+),([\d.]+)/.exec(phone(html));
    expect(Number(d![1])).toBeCloseTo(38, 1);
    expect(Number(d![2])).toBeCloseTo(196, 1);
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
    expectBasics(html, true);
    expect(html).toContain('No reported events yet');
    const none = renderToString(<CategoryLines {...base} visible={[]} />);
    expect(none).not.toContain('NaN');
  });
});

describe('CycleOverlay', () => {
  const cycles = [
    { cycleYear: 2026, dayZeroOn: '2025-06-01', points: cumulative([1, 5, 9]) },
    { cycleYear: 2025, dayZeroOn: '2024-06-03', points: cumulative([2, 6, 12]) },
    { cycleYear: 2024, dayZeroOn: '2023-06-01', points: cumulative([1, 2, 3]) },
  ];
  it('one line per cycle named by cycle, a legend, one source named, dates and no day count', () => {
    const html = renderToString(<CycleOverlay cycles={cycles} sourceName="CycleTrack" labels={labels} />);
    expectBasics(html);
    expect(html).toContain('2025\u20132026');
    expect(html).toContain('2024\u20132025');
    expect(html).toContain('<ul');
    expect(html).toContain('CycleTrack');
    expect(html).not.toMatch(/days since/i);
    expect(phone(html).match(/<path/g)).toHaveLength(3);
    expect(phone(html)).toContain(`stroke="${cycleColor(0)}"`);
    expect(phone(html)).toContain('stroke-dasharray="6 3"');
  });
  it('aligns by calendar: the axis starts at Jun 1 and prints dates without a year', () => {
    const html = renderToString(<CycleOverlay cycles={cycles} sourceName="CycleTrack" labels={labels} />);
    expect(phone(html)).toContain('>Jun 1<');
    expect(phone(html)).not.toMatch(/>(Jun|Jul|Aug|Sep|Oct|Nov) \d+, \d{4}</);
    // Both cycles start their line at 0 on their own first day: Jun 1 is x 0, Jun 3 (2024-25) is x 2.
    const starts = [...phone(html).matchAll(/<path d="M([\d.]+),([\d.]+)/g)].map((m) => Number(m[1]));
    expect(starts).toHaveLength(3);
    expect(Math.max(...starts)).toBeGreaterThan(Math.min(...starts));
  });
  it('the table is blank for a cycle after its last report (it may still be running), never a carried value', () => {
    const html = renderToString(
      <CycleOverlay
        cycles={[
          { cycleYear: 2026, dayZeroOn: '2025-06-01', points: [{ day: 3, cumulative: 4 }] },
          { cycleYear: 2025, dayZeroOn: '2024-06-01', points: [{ day: 40, cumulative: 9 }] },
        ]}
        sourceName="CycleTrack"
        labels={labels}
      />,
    );
    const table = html.slice(html.indexOf('<table'));
    const rows = [...table.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) =>
      [...m[1]!.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1]),
    );
    const jul = rows.find((r) => r[0] === 'Jul 11')!;
    expect(jul).toEqual(['Jul 11', '', '9']);
    expect(rows.find((r) => r[0] === 'Jun 4')).toEqual(['Jun 4', '4', '0']);
  });
  it('only the newest cycle is the thick line', () => {
    const html = renderToString(<CycleOverlay cycles={cycles} sourceName="CycleTrack" labels={labels} />);
    expect(phone(html).match(/stroke-width="2"/g)).toHaveLength(1);
  });
  it('no cycles or all-empty cycles are safe', () => {
    expectBasics(renderToString(<CycleOverlay cycles={[]} sourceName="CycleTrack" labels={labels} />), true);
    expectBasics(
      renderToString(
        <CycleOverlay
          cycles={[{ cycleYear: 2026, dayZeroOn: '2025-06-01', points: [] }]}
          sourceName="CycleTrack"
          labels={labels}
        />,
      ),
      true,
    );
  });
});

describe('static rules', () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'));
  const ROOT = path.resolve(dir, '../../../..');
  it('has the chart files', () => {
    expect(files.sort()).toEqual([
      'CategoryLines.tsx',
      'ChartFrame.tsx',
      'CumulativeLine.tsx',
      'CycleOverlay.tsx',
      'DailyBars.tsx',
    ]);
  });
  it.each(files)('%s uses only site tokens (text, border, surface, chart) and no motion of its own', (f) => {
    const src = readFileSync(path.join(dir, f), 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(/);
    expect(src).not.toMatch(/\b(fill|stroke)=["'](?!none["']|var\()[a-z]/i);
    for (const m of src.matchAll(/var\((--[\w-]+)/g)) {
      expect(m[1]).toMatch(/^--site-(text|text-muted|border|surface|chart-[1-5])$/);
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
