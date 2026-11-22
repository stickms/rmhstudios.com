import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
  }),
}));

// The Radix select draws no options until it opens, so the tests read a native stand-in for its children.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, children, ...rest }: { value: string; children: ReactNode; 'aria-label'?: string }) => (
    <select aria-label={rest['aria-label']} defaultValue={value} data-value={value}>
      {children}
    </select>
  ),
}));

import { CategoryToggles, toggleCategory } from './CategoryToggles';
import {
  DegreeProgramSelect,
  ProgramSelect,
  degreeProgramFromValue,
  degreeProgramOptions,
  degreeProgramToValue,
  programOptions,
} from './ProgramSelect';
import { ReportedNote } from './ReportedNote';
import { CATEGORY_STYLE } from './charts/CategoryLines';

const noop = () => undefined;

describe('toggleCategory', () => {
  it('adds in canonical order and removes', () => {
    expect(toggleCategory(['INTERVIEW'], 'SECONDARY')).toEqual(['SECONDARY', 'INTERVIEW']);
    expect(toggleCategory(['SECONDARY', 'INTERVIEW'], 'SECONDARY')).toEqual(['INTERVIEW']);
  });
  it('never turns the last one off', () => {
    expect(toggleCategory(['WAITLIST'], 'WAITLIST')).toEqual(['WAITLIST']);
  });
});

describe('CategoryToggles', () => {
  const html = renderToString(<CategoryToggles value={['INTERVIEW']} onChange={noop} />);
  it('is a labelled group of five aria-pressed buttons, not a tab strip', () => {
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Show categories"');
    expect(html).not.toContain('role="tab');
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
  });
  it('draws a line sample per button from CATEGORY_STYLE', () => {
    expect(html.match(/<svg/g)).toHaveLength(5);
    expect(html).toContain(`stroke-dasharray="${CATEGORY_STYLE.REJECTION.dash}"`);
    expect(html).toContain(`stroke-width="${CATEGORY_STYLE.INTERVIEW.width}"`);
  });
  it('marks only the last pressed button as not turn-off-able', () => {
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(1);
    const two = renderToString(<CategoryToggles value={['INTERVIEW', 'WAITLIST']} onChange={noop} />);
    expect(two).not.toContain('aria-disabled="true"');
  });
});

describe('ProgramSelect (school page, O5)', () => {
  it('offers All and the school degree only', () => {
    expect(programOptions('MD')).toEqual(['ALL', 'REG', 'PHD']);
    const md = renderToString(<ProgramSelect degree="MD" value="PHD" onChange={noop} />);
    expect(md.match(/<option/g)).toHaveLength(3);
    expect(md).toContain('>MD-PhD<');
    expect(md).toContain('data-value="PHD"');
    expect(md).not.toContain('DO');
  });
  it('a DO school renders no MD option', () => {
    const doHtml = renderToString(<ProgramSelect degree="DO" value="REG" onChange={noop} />);
    expect(doHtml).toContain('>DO<');
    expect(doHtml).toContain('>DO-PhD<');
    expect(doHtml).not.toContain('MD');
  });
  it('defaults to All when asked for ALL', () => {
    expect(renderToString(<ProgramSelect degree="MD" value="ALL" onChange={noop} />)).toContain('>All programs<');
  });
});

describe('DegreeProgramSelect (index and live)', () => {
  it('lists All, MD, MD-PhD, DO, DO-PhD, and None only when allowed', () => {
    expect(degreeProgramOptions({})).toEqual(['ALL', 'MD', 'MD-PHD', 'DO', 'DO-PHD']);
    expect(degreeProgramOptions({ allowNone: true })).toEqual(['ALL', 'MD', 'MD-PHD', 'DO', 'DO-PHD', 'NONE']);
  });
  it('shows only the school degree options when given one', () => {
    expect(degreeProgramOptions({ schoolDegree: 'MD', allowNone: true })).toEqual(['ALL', 'MD', 'MD-PHD', 'NONE']);
    expect(degreeProgramOptions({ schoolDegree: 'DO' })).toEqual(['ALL', 'DO', 'DO-PHD']);
  });
  it('maps value to degree and program together', () => {
    expect(degreeProgramFromValue('MD-PHD')).toEqual({ degree: 'MD', program: 'PHD' });
    expect(degreeProgramFromValue('DO')).toEqual({ degree: 'DO', program: 'REG' });
    expect(degreeProgramFromValue('ALL')).toEqual({ program: 'ALL' });
    expect(degreeProgramFromValue('NONE')).toEqual({ program: 'NONE' });
    expect(degreeProgramToValue({ degree: 'DO', program: 'PHD' })).toBe('DO-PHD');
    expect(degreeProgramToValue({ program: 'NONE' })).toBe('NONE');
    expect(degreeProgramToValue({ program: 'ALL' })).toBe('ALL');
    expect(degreeProgramToValue({ degree: 'MD', program: 'ALL' })).toBe('ALL');
  });
  it('renders the selected label, and falls back to All for a contradicting degree', () => {
    expect(renderToString(<DegreeProgramSelect value={{ degree: 'DO', program: 'PHD' }} onChange={noop} />)).toContain(
      'DO-PhD',
    );
    const html = renderToString(
      <DegreeProgramSelect value={{ degree: 'DO', program: 'REG' }} schoolDegree="MD" onChange={noop} />,
    );
    expect(html).toContain('data-value="ALL"');
    expect(html).not.toContain('DO');
  });
  it('labels the ALL option "All programs", not a bare "All"', () => {
    const html = renderToString(<DegreeProgramSelect value={{ program: 'ALL' }} onChange={noop} />);
    expect(html).toContain('>All programs<');
    expect(html).not.toContain('>All<');
  });
  it('shows Program not reported when selected', () => {
    const html = renderToString(<DegreeProgramSelect value={{ program: 'NONE' }} allowNone onChange={noop} />);
    expect(html).toContain('data-value="NONE"');
    expect(html).toContain('>Program not reported<');
  });
});

describe('ReportedNote', () => {
  it('says reported events, not applicants', () => {
    const html = renderToString(<ReportedNote />);
    expect(html).toContain('Reported events, not applicants.');
    expect(html).toContain('never added together');
  });
});
