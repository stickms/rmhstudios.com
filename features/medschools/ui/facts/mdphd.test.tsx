import { readCss } from '@/lib/__tests__/css-source';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
    i18n: { language: 'en-US' },
  }),
}));

import type { MedMdPhdDto } from '../../medschools.contract';
import { MdPhdView } from './MdPhdProgram';

const program = (over: Partial<MedMdPhdDto['program']> = {}): MedMdPhdDto['program'] => ({
  exists: true,
  name: 'M.D./Ph.D. Program',
  source: 'SCHOOL_PAGE',
  sourceUrl: 'https://fixture.edu/md-phd/curriculum',
  checkedOn: '2026-11-24',
  ...over,
});
const verified: MedMdPhdDto['timeline'] = {
  pattern: '1.5-4-2.5',
  totalYears: null,
  phases: [
    { phase: 'other', years: null, label: 'two lab rotations before M1' },
    { phase: 'preclinical', years: 1.5, label: 'Your preclinical medical education' },
    { phase: 'research', years: 4, label: 'Your graduate school studies' },
    { phase: 'clinical', years: 2.5, label: 'Your medical school clinical training' },
  ],
  evidence: 'You will typically follow a 1.5 - 4 - 2.5 track: 1.5 years: Your preclinical medical education',
  sourceUrl: 'https://fixture.edu/md-phd/faq',
  checkedOn: '2026-11-24',
};
const partial: MedMdPhdDto['timeline'] = {
  pattern: null,
  totalYears: null,
  phases: [
    { phase: 'preclinical', years: 2, label: 'M1 and M2' },
    { phase: 'research', years: null, label: 'Graduate School (3.5 to 4.5 years)' },
    { phase: 'clinical', years: null, label: 'Phase 3' },
  ],
  evidence: 'The program typically takes between seven and eight years to complete, with flexibility.',
  sourceUrl: 'https://fixture.edu/mstp',
  checkedOn: '2026-11-24',
};
const listed: MedMdPhdDto['mstp'] = {
  listed: true,
  grant: 'T32GM145408',
  fiscalYear: 2026,
  sourceUrl: 'https://reporter.nih.gov/project-details/11362501',
  checkedOn: '2026-11-24',
};
const notListed: MedMdPhdDto['mstp'] = {
  listed: false,
  grant: null,
  fiscalYear: null,
  sourceUrl: 'https://reporter.nih.gov/',
  checkedOn: '2026-11-24',
};
const render = (data: MedMdPhdDto, degree: 'MD' | 'DO' = 'MD') =>
  renderToString(<MdPhdView data={data} degree={degree} />);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, s: string) => html.split(s).length - 1;

describe('MdPhdView', () => {
  it('a verified pattern: the school’s bar, proportional, with its pattern, rotations and the quote behind a text fragment', () => {
    const html = render({ program: program(), timeline: verified, mstp: notListed });
    expect(html).toContain('>MD-PhD program<');
    expect(html).toContain('M.D./Ph.D. Program');
    expect(html).toContain('>1.5-4-2.5<');
    expect(html).toContain('data-proportional="true"');
    expect(html).toMatch(
      /grid-template-columns:minmax\(3\.5rem, 18\.8fr\) minmax\(3\.5rem, 50fr\) minmax\(3\.5rem, 31\.3fr\)/,
    );
    expect(html).toContain('aria-label="Preclinical 1.5 years, then PhD research 4 years, then clinical 2.5 years"');
    expect(html).toContain('Two lab rotations before M1');
    expect(html).not.toContain('Typical layout');
    // The deep link highlights the quoted sentence on the page.
    expect(html).toContain(
      'data-href="https://fixture.edu/md-phd/faq#:~:text=You%20will%20typically%20follow,Your%20preclinical%20medical%20education"',
    );
    expect(html).not.toContain('Only what the page states');
  });

  it('a verified partial timeline: equal widths, the range from the label, "Length not stated", the stated total', () => {
    const html = render({ program: program(), timeline: partial, mstp: listed });
    expect(html).toContain('data-proportional="false"');
    expect(html).toContain('3.5–4.5 years');
    expect(html).toContain('Length not stated');
    expect(html).toContain('7–8 years in all');
    expect(html).toContain('Only what the page states');
    expect(html).not.toContain('Typical layout');
  });

  it('a timeline with no lengths at all says so once, not under every segment (Mount Sinai)', () => {
    const html = render({
      program: program(),
      timeline: {
        ...partial,
        phases: [
          { phase: 'preclinical', years: null, label: 'pre-clerkship' },
          { phase: 'clinical', years: null, label: 'core clerkships before the PhD' },
          { phase: 'research', years: null, label: 'full-time PhD phase' },
          { phase: 'clinical', years: null, label: 'post-clerkship clinical phase' },
        ],
      },
      mstp: listed,
    });
    expect(count(html, 'Length not stated')).toBe(0);
    expect(count(html, 'The page gives the order of the phases, not their lengths.')).toBe(1);
    expect(html).toContain('aria-label="Preclinical length not stated, then clinical length not stated');
  });

  it('no published layout: the typical 2-4-2, dashed and labelled, never the school’s statement', () => {
    const html = render({ program: program(), timeline: null, mstp: listed });
    expect(html).toContain('Typical layout; the program does not publish its own');
    expect(html).toContain('medapp-phasebar is-typical');
    expect(html).toContain('medapp-mdphd__pattern is-typical');
    expect(html).toContain(
      'aria-label="Typical layout: Preclinical 2 years, then PhD research 4 years, then clinical 2 years"',
    );
    expect(html).toMatch(/minmax\(3\.5rem, 25fr\) minmax\(3\.5rem, 50fr\) minmax\(3\.5rem, 25fr\)/);
    // The timeline has no source of its own: only the program and MSTP rows carry one.
    expect(count(html, 'data-slot="med-source-ref"')).toBe(2);
  });

  it('a stated length with no layout: the typical bar, and the school’s length on its own sourced row', () => {
    const html = render({
      program: program(),
      timeline: { ...partial, phases: [], totalYears: 8.2, evidence: 'Average time to complete program: 8.2 years' },
      mstp: null,
    });
    expect(html).toContain('Typical layout');
    expect(text(html)).toContain('Length 8.2 years');
    expect(html).not.toContain('in all');
  });

  it('MSTP funded: the grant, the fiscal year and the RePORTER link as its source', () => {
    const html = render({ program: program(), timeline: null, mstp: listed });
    expect(text(html)).toContain('NIH MSTP (T32)');
    expect(text(html)).toContain('Funded · T32GM145408 · FY 2026');
    expect(html).toContain('data-href="https://reporter.nih.gov/project-details/11362501"');
    expect(html).toContain('Source: NIH RePORTER, checked November 24, 2026');
  });

  it('MSTP not listed: never a bare "No", and the day RePORTER was read', () => {
    const html = render({ program: program(), timeline: null, mstp: notListed });
    expect(text(html)).toContain('Not listed as an NIH MSTP checked November 24, 2026');
    expect(text(html)).not.toMatch(/\bNo\b/);
  });

  it('a program known only from its grant: no program row, the MSTP row first', () => {
    const html = render({
      program: program({ name: null, source: 'NIH_REPORTER', sourceUrl: listed.sourceUrl }),
      timeline: null,
      mstp: listed,
    });
    expect(text(html)).not.toContain('Program M');
    expect(html.indexOf('NIH MSTP (T32)')).toBeLessThan(html.indexOf('Timeline'));
  });

  it('no program: one quiet row with its source, no heading, bar or MSTP status', () => {
    const html = render({
      program: program({ exists: false, name: null }),
      timeline: null,
      mstp: null,
    });
    expect(text(html)).toContain('MD-PhD No combined program');
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('medapp-phasebar');
    expect(html).not.toContain('MSTP');
    expect(count(html, 'data-slot="med-source-ref"')).toBe(1);
    expect(
      text(render({ program: program({ exists: false, name: null }), timeline: null, mstp: null }, 'DO')),
    ).toContain('DO-PhD No combined program');
  });

  it('a DO school: the heading says DO-PhD', () => {
    expect(render({ program: program(), timeline: null, mstp: notListed }, 'DO')).toContain('>DO-PhD program<');
  });

  it('repeats no text: the program name, pattern and length each print once', () => {
    const html = render({ program: program(), timeline: verified, mstp: listed });
    expect(count(text(html), 'M.D./Ph.D. Program')).toBe(1);
    expect(count(html, '>1.5-4-2.5<')).toBe(1);
  });
});

/* ---------------------------------------- contrast of the phase tokens ---------------------------------------- */

const css = readCss('features/medschools/ui/medschools.css').replace(/\/\*[\s\S]*?\*\//g, '');
function block(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const light = block('.app-theme.medapp-theme,\n:root:has(.medapp-theme)');
const MODES = { light, dark: { ...light, ...block(":root[data-app-dark='1'] .app-theme.medapp-theme") } };
const resolve = (t: Record<string, string>, name: string): string => {
  let v = t[name] ?? '';
  for (let i = 0; i < 5 && v.startsWith('var('); i += 1) v = t[v.slice(6, -1)] ?? '';
  return v;
};
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('phase tokens, from the stylesheet', () => {
  for (const [mode, t] of Object.entries(MODES)) {
    for (const phase of ['preclinical', 'research', 'clinical']) {
      it(`${mode} ${phase}: the fill is a status pastel and its edge holds 3:1 on paper and on its fill`, () => {
        const fill = resolve(t, `app-med-phase-${phase}`);
        const edge = resolve(t, `app-med-phase-${phase}-edge`);
        expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
        expect(edge).toMatch(/^#[0-9a-f]{6}$/i);
        expect(contrast(edge, resolve(t, 'app-surface'))).toBeGreaterThanOrEqual(3);
        expect(contrast(edge, fill)).toBeGreaterThanOrEqual(3);
      });
    }
    it(`${mode}: the words under the bar hold 4.5:1 on paper`, () => {
      expect(contrast(resolve(t, 'app-text'), resolve(t, 'app-surface'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(resolve(t, 'app-text-muted'), resolve(t, 'app-surface'))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('the bar and its labels are styled in the stylesheet', () => {
    for (const cls of [
      '.medapp-phasebar {',
      '.medapp-phase--preclinical {',
      '.medapp-phase--research {',
      '.medapp-phase--clinical {',
    ])
      expect(css).toContain(cls);
    expect(css).toMatch(/\.medapp-phasebar\.is-typical \.medapp-phasebar__seg \{[^}]*border-style: dashed/);
  });
});
