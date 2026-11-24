import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ActivityTypeDto } from '../../medschools.contract';
import { CategoryLines } from './CategoryLines';
import { CATEGORY_COLOR, CATEGORY_STYLE, SOURCE_COLOR, cycleColor } from './chartColors';
import type { ChartLabels } from './ChartFrame';
import { CumulativeLine } from './CumulativeLine';
import { ArrivalBars } from './ArrivalBars';
import { CycleOverlay } from './CycleOverlay';
import { DailyBars } from './DailyBars';
import { ForecastBand } from './ForecastBand';

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
  wave: { legend: 'Wave', probe: (n) => `Wave: ${n} invites` },
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
  expect(html).toContain('class="medapp-chart"');
  expect(html).toContain('Reported events');
  expect(html.match(/<svg viewBox/g)).toHaveLength(3);
  expect(html).toContain('<details');
  expect(html).toContain('<table');
  expect(html).toContain('dir="ltr"');
  expect(html).not.toContain('NaN');
  expect(html).not.toMatch(/ d=""/);
}

describe('DailyBars', () => {
  const props = { from: '2026-11-19', to: '2026-11-23', color: 'var(--app-med-chart-1)', labels };
  it('renders the frame, names exactly the sources passed, and reads Nov 20 whatever the zone', () => {
    const html = renderToString(<DailyBars primary={ct} {...props} />);
    expectBasics(html);
    expect(html).toContain('CycleTrack');
    expect(html).not.toContain('Admit');
    expect(html).not.toContain('RMH');
    expect(html).toContain('Nov 20');
    expect(html).toContain('<rect');
    expect(html).toContain('fill="var(--app-med-chart-1)"');
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
  it('every cycle is a 2px line (a dash reads too faint thinner), none 1.5px', () => {
    const html = renderToString(<CycleOverlay cycles={cycles} sourceName="CycleTrack" labels={labels} />);
    expect(phone(html)).not.toMatch(/stroke-width="1\.5"/);
    expect(phone(html).match(/stroke-width="2"/g)!.length).toBeGreaterThanOrEqual(cycles.length);
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

describe('wave marks', () => {
  const series = (['INTERVIEW', 'ACCEPTANCE'] as const).map((t, i) => ({
    eventType: t,
    label: `Label-${t}`,
    points: cumulative([i + 1, i + 3, i + 6]),
  }));
  const base = { series, sources: ['CYCLETRACK'] as const, dayZeroOn: '2026-06-01', labels };
  const waves = [{ date: '2026-06-11', count: 12 }];
  const ticks = (html: string) => [...html.matchAll(/<line [^>]*data-wave[^>]*>/g)].map((m) => m[0]);

  it('CategoryLines: a 1px muted tick at the wave date, rising 8 units, no fill or opacity, and a Wave legend entry', () => {
    const html = renderToString(<CategoryLines {...base} visible={['INTERVIEW', 'ACCEPTANCE']} waves={waves} />);
    const t = ticks(phone(html));
    expect(t).toHaveLength(1);
    expect(t[0]).toContain('stroke="var(--app-text-muted)"');
    expect(t[0]).toContain('stroke-width="1"');
    expect(t[0]).not.toMatch(/opacity|fill="(?!none)/);
    const x = Number(/x1="([\d.]+)"/.exec(t[0]!)![1]);
    const y1 = Number(/y1="([\d.]+)"/.exec(t[0]!)![1]);
    const y2 = Number(/y2="([\d.]+)"/.exec(t[0]!)![1]);
    expect(y1 - y2).toBe(8);
    // Day 10 of the domain 0..20 is the middle of the plot.
    const lo = Number(/<clipPath[^>]*><rect x="([\d.]+)" [^>]* width="([\d.]+)"/.exec(phone(html))![1]) + 2;
    const w = Number(/<clipPath[^>]*><rect x="[\d.]+" [^>]* width="([\d.]+)"/.exec(phone(html))![1]) - 4;
    expect(x).toBeCloseTo(lo + w / 2, 0);
    expect(html).toContain('>Wave<');
  });
  it('CategoryLines: no tick and no legend entry while Interview is off, or with no waves', () => {
    const off = renderToString(<CategoryLines {...base} visible={['ACCEPTANCE']} waves={waves} />);
    expect(ticks(off)).toHaveLength(0);
    expect(off).not.toContain('>Wave<');
    const none = renderToString(<CategoryLines {...base} visible={['INTERVIEW']} waves={[]} />);
    expect(ticks(none)).toHaveLength(0);
    expect(none).not.toContain('>Wave<');
  });
  it('DailyBars: a tick under the wave day bar and the legend entry; nothing without waves', () => {
    const props = { from: '2026-11-19', to: '2026-11-23', color: 'var(--app-med-chart-1)', labels };
    const html = renderToString(<DailyBars primary={ct} {...props} waves={[{ date: '2026-11-20', count: 4 }]} />);
    expect(ticks(phone(html))).toHaveLength(1);
    expect(html).toContain('>Wave<');
    const plain = renderToString(<DailyBars primary={ct} {...props} />);
    expect(ticks(plain)).toHaveLength(0);
    expect(plain).not.toContain('>Wave<');
  });
});

describe('ForecastBand', () => {
  const legendLabels = {
    observed: 'Reported so far',
    median: 'Median forecast',
    range: '10th to 90th percentile',
    low: '10th percentile',
    high: '90th percentile',
  };
  const observed = [
    { day: 170, cumulative: 4 },
    { day: 172, cumulative: 10 },
  ];
  const band = [
    { day: 172, p10: 10, p50: 10, p90: 10 },
    { day: 250, p10: 14, p50: 20, p90: 28 },
    { day: 364, p10: 20, p50: 30, p90: 44 },
  ];
  const draw = (o: { observed?: typeof observed; band?: typeof band } = {}) =>
    renderToString(
      <ForecastBand
        eventType="INTERVIEW"
        sourceName="Admit"
        dayZeroOn="2025-06-01"
        observed={o.observed ?? observed}
        band={o.band ?? band}
        labels={labels}
        legendLabels={legendLabels}
      />,
    );

  it('draws the observed line solid, the median and both boundaries dashed, in the category colour', () => {
    const svg = phone(draw());
    const paths = [...svg.matchAll(/<path [^>]*>/g)].map((m) => m[0]);
    const dashed = paths.filter((p) => p.includes('stroke-dasharray'));
    expect(dashed).toHaveLength(3);
    expect(paths.filter((p) => !p.includes('stroke-dasharray'))).toHaveLength(1);
    expect(dashed.filter((p) => p.includes('stroke-dasharray="6 3"') && p.includes('stroke-width="2"'))).toHaveLength(
      1,
    );
    expect(dashed.filter((p) => p.includes('stroke-dasharray="2 3"') && p.includes('stroke-width="1"'))).toHaveLength(
      2,
    );
    for (const p of paths) expect(p).toContain(`stroke="${CATEGORY_COLOR.INTERVIEW}"`);
  });

  it('nothing is filled, translucent or a gradient (Steel R1)', () => {
    const html = draw();
    for (const p of html.matchAll(/<path [^>]*>/g)) {
      expect(p[0]).toContain('fill="none"');
      expect(p[0]).not.toMatch(/opacity/);
    }
    expect(html).not.toMatch(/fill-opacity|linearGradient|radialGradient/);
    expect(html).not.toMatch(/fill="(?!none|var\()/);
  });

  it('prints calendar dates on the axis, never a day count, starts at 0, and sits in a left-to-right wrapper', () => {
    const html = draw();
    const ticks = [...phone(html).matchAll(/<text [^>]*text-anchor="[a-z]+"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
    const dates = ticks.filter((t) => /^[A-Z][a-z]{2} \d{1,2}$/.test(t));
    expect(dates.length).toBeGreaterThan(2);
    expect(ticks.join(' ')).not.toMatch(/day/i);
    expect(ticks).toContain('0');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain(CATEGORY_COLOR.INTERVIEW);
  });

  it('a legend of three entries, and a data table with one row a week plus the last day', () => {
    const html = draw();
    for (const l of [legendLabels.observed, legendLabels.median, legendLabels.range]) expect(html).toContain(l);
    const rows = html.slice(html.indexOf('<tbody>')).match(/<tr>/g)!;
    // Day 0 to day 364 is 52 whole weeks: a row every 7 days, and the last day is the 53rd.
    expect(rows).toHaveLength(53);
    expect(html).toContain('<td>May 31, 2026</td>');
  });

  it('an empty band draws the observed line only and no range legend', () => {
    const html = draw({ band: [] });
    const paths = [...phone(html).matchAll(/<path [^>]*>/g)];
    expect(paths).toHaveLength(1);
    expect(html).not.toContain(legendLabels.range);
  });

  it('nothing at all is the empty note, no NaN', () => {
    const html = draw({ observed: [], band: [] });
    expect(html).toContain(labels.empty);
    expect(html).not.toContain('NaN');
    expect(phone(html)).not.toContain('<path');
  });
});

describe('zoom and pan (owner 2026-11-24)', () => {
  const src = readFileSync(path.join(__dirname, 'ChartFrame.tsx'), 'utf8');
  it('draws the whole domain on the server, with no zoom buttons until the client has hydrated', () => {
    expect(src).toMatch(/const client = useSyncExternalStore\(\s*noSubscribe,\s*\(\) => true,\s*\(\) => false,?\s*\)/);
    expect(src).toMatch(/zoomable && client \?/);
  });
  it('zooms only on a pinch or ctrl / cmd + wheel (a plain wheel scrolls the page), through a non-passive listener', () => {
    expect(src).toContain("addEventListener('wheel', on, { passive: false })");
    expect(src).toMatch(/!\(e\.ctrlKey \|\| e\.metaKey\)/);
  });
  it('keeps vertical page scrolling on touch, and names its buttons and keys', () => {
    expect(src).toContain('touch-pan-y');
    for (const k of ["'chart-zoom-in'", "'chart-zoom-out'", "'chart-zoom-reset'", "'chart-zoom-hint'"])
      expect(src).toContain(k);
  });
  it('every time chart passes its domain, and draws and probes in the view', () => {
    for (const f of [
      'CategoryLines.tsx',
      'CumulativeLine.tsx',
      'CycleOverlay.tsx',
      'ForecastBand.tsx',
      'DailyBars.tsx',
    ]) {
      const c = readFileSync(path.join(__dirname, f), 'utf8');
      expect(c, f).toMatch(/domain=\{/);
      expect(c, f).toMatch(/render=\{\(g, clipId, view\)/);
      expect(c, f).toMatch(/x: \(g, i, view\)/);
    }
  });
});

describe('static rules', () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'));
  const ROOT = path.resolve(dir, '../../../..');
  it('has the chart files', () => {
    expect(files.sort()).toEqual([
      'ArrivalBars.tsx',
      'CategoryLines.tsx',
      'ChartFrame.tsx',
      'CumulativeLine.tsx',
      'CycleOverlay.tsx',
      'DailyBars.tsx',
      'ForecastBand.tsx',
    ]);
  });
  it.each(files)('%s uses only app tokens (text, border, surface, chart) and no motion of its own', (f) => {
    const src = readFileSync(path.join(dir, f), 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(/);
    expect(src).not.toMatch(/\b(fill|stroke)=["'](?!none["']|var\()[a-z]/i);
    for (const m of src.matchAll(/var\((--[\w-]+)/g)) {
      expect(m[1]).toMatch(/^--app-(text|text-muted|border|surface|med-chart-[1-5])$/);
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

describe('ArrivalBars (when results arrive)', () => {
  const items = [
    { key: 'd0', label: 'Monday', tick: 'Mon', count: 6 },
    { key: 'd1', label: 'Tuesday', tick: 'Tue', count: 0 },
    { key: 'd2', label: 'Wednesday', tick: null, count: 3 },
  ];
  const render = (data = items) =>
    renderToString(
      <ArrivalBars
        items={data}
        color="var(--app-med-chart-3)"
        title="Acceptance by day of the week"
        unit="Reported events, US Eastern time"
        sourcesLine="Sources: Admit.org, Student Doctor Network"
        head={['Day', 'Reported events']}
        labels={labels}
      />,
    );
  it('is a chart card with one bar per item in the category colour, a labelled zone and a data table', () => {
    const html = render();
    expect(html).toContain('US Eastern time');
    expect(html.match(/<rect/g)!.length).toBeGreaterThanOrEqual(items.length);
    expect(html).toContain('fill="var(--app-med-chart-3-fill)" stroke="var(--app-med-chart-3)"');
    expect(html).toContain('<table');
    expect(html).toContain('>Monday<');
    expect(html).toContain('role="group"');
  });
  it('labels only the ticks it was given', () => {
    const html = render();
    expect(html).toContain('>Mon<');
    expect(html).not.toContain('>Wed<');
  });
  it('an all-zero histogram says there is nothing, and draws no bars', () => {
    const html = render(items.map((i) => ({ ...i, count: 0 })));
    expect(html).toContain(labels.empty);
  });
});

describe('chart colours, from the stylesheet', () => {
  const css = readFileSync(path.resolve(__dirname, '../medschools.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  /** The `--name: #hex` declarations of the first `{ ... }` after `selector`. */
  const tokens = (selector: string): Record<string, string> => {
    const at = css.indexOf(selector);
    const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
    return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1]!, m[2]!]));
  };
  const lum = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const MODES = {
    light: tokens('.app-theme.medapp-theme,\n:root:has(.medapp-theme)'),
    dark: tokens(":root[data-app-dark='1'] .app-theme.medapp-theme"),
  };

  it.each(Object.entries(MODES))(
    '%s: every line holds 3:1 on paper and on the ground, and the fills differ',
    (_m, mode) => {
      const lines = [1, 2, 3, 4, 5].map((i) => mode[`app-med-chart-${i}`]!);
      expect(new Set(lines).size).toBe(5);
      for (const [i, line] of lines.entries()) {
        expect(contrast(line, mode['app-surface']!), `chart-${i + 1} on paper`).toBeGreaterThanOrEqual(3);
        expect(contrast(line, mode['app-bg']!), `chart-${i + 1} on ground`).toBeGreaterThanOrEqual(3);
        expect(mode[`app-med-chart-${i + 1}-fill`], `chart-${i + 1} fill`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    },
  );

  it('no site chart token is left anywhere in the app or its stylesheets', () => {
    expect(css).not.toContain('--site-chart');
    expect(readFileSync(path.resolve(__dirname, '../../../../app/globals/tokens-themes.css'), 'utf8')).not.toContain(
      '--site-chart',
    );
  });
});
