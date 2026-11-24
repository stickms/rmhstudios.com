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
import { ProgramSetToggles } from './ProgramSetToggles';
import { OptionGroup, nextOptionIndex } from './OptionGroup';
import { ProgramToggles, programFromOn, programToOn, toggleProgram } from './ProgramToggles';
import { CATEGORY_STYLE } from './charts/chartColors';

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
  it('is the legend too: a swatch per button in its category colour, dimmed when off', () => {
    expect(html.match(/<svg/g)).toHaveLength(5);
    for (const s of Object.values(CATEGORY_STYLE)) expect(html).toContain(`stroke="${s.color}"`);
    expect(html).toContain(`stroke-dasharray="${CATEGORY_STYLE.REJECTION.dash}"`);
    expect(html.match(/opacity="0.45"/g)).toHaveLength(4);
    expect(html.match(/opacity="1"/g)).toHaveLength(1);
  });
  it('marks only the last pressed button as not turn-off-able', () => {
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(1);
    const two = renderToString(<CategoryToggles value={['INTERVIEW', 'WAITLIST']} onChange={noop} />);
    expect(two).not.toContain('aria-disabled="true"');
  });
});

describe('ProgramSetToggles (index, live, rail, preferences)', () => {
  it('is a labelled group of four aria-pressed buttons, MD, MD-PhD, DO, DO-PhD', () => {
    const html = renderToString(<ProgramSetToggles value={['md', 'md-phd', 'do', 'do-phd']} onChange={noop} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Programs"');
    expect(html).not.toContain('role="tab');
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
    for (const l of ['>MD<', '>MD-PhD<', '>DO<', '>DO-PhD<']) expect(html).toContain(l);
  });
  it('marks pressed by aria-pressed (styled as a filled chip with weight 600), not by colour alone, and marks the last one on', () => {
    const html = renderToString(<ProgramSetToggles value={['do']} onChange={noop} />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(html.match(/class="medapp-chip"/g)).toHaveLength(4);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(1);
  });
});

describe('CategoryToggles pressed state', () => {
  it('draws pressed and unpressed differently, not by colour alone', () => {
    const html = renderToString(<CategoryToggles value={['INTERVIEW']} onChange={noop} />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
    expect(html.match(/class="medapp-chip"/g)).toHaveLength(5);
  });
});

describe('OptionGroup (owner O7: a horizontal single-select button group)', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ] as const;
  const html = renderToString(<OptionGroup label="Pick" value="b" options={options} onChange={noop} />);
  it('is a radiogroup of radios with aria-checked, not a tab strip', () => {
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Pick"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(2);
    expect(html).not.toContain('role="tab');
    expect(html).not.toContain('<select');
  });
  it('has one tab stop (roving tabindex) on the checked option', () => {
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    const beta = /<button[^>]*>(?:(?!<\/button>).)*Beta/.exec(html)![0];
    expect(beta).toContain('tabindex="0"');
  });
  it('wraps on a phone and uses the pill chip (44px on touch)', () => {
    expect(html).toContain('medapp-chips');
    expect(html).toContain('medapp-chip');
  });
  it('arrow keys move and wrap, left and right swap in a right-to-left row', () => {
    expect(nextOptionIndex('ArrowRight', 1, 3, false)).toBe(2);
    expect(nextOptionIndex('ArrowRight', 2, 3, false)).toBe(0);
    expect(nextOptionIndex('ArrowLeft', 0, 3, false)).toBe(2);
    expect(nextOptionIndex('ArrowLeft', 1, 3, true)).toBe(2);
    expect(nextOptionIndex('ArrowRight', 1, 3, true)).toBe(0);
    expect(nextOptionIndex('Home', 2, 3, false)).toBe(0);
    expect(nextOptionIndex('End', 0, 3, false)).toBe(2);
    expect(nextOptionIndex('a', 0, 3, false)).toBeNull();
  });
});

describe('ProgramToggles (school page: MD / MD-PhD multi-select, O7)', () => {
  it('maps the URL value to two toggles and back; both on is All', () => {
    expect(programToOn('ALL')).toEqual({ reg: true, phd: true });
    expect(programToOn('REG')).toEqual({ reg: true, phd: false });
    expect(programToOn('PHD')).toEqual({ reg: false, phd: true });
    expect(programFromOn({ reg: true, phd: true })).toBe('ALL');
    expect(programFromOn({ reg: true, phd: false })).toBe('REG');
    expect(programFromOn({ reg: false, phd: true })).toBe('PHD');
  });
  it('toggles, and the last one that is on stays on', () => {
    expect(toggleProgram('ALL', 'phd')).toBe('REG');
    expect(toggleProgram('ALL', 'reg')).toBe('PHD');
    expect(toggleProgram('REG', 'phd')).toBe('ALL');
    expect(toggleProgram('REG', 'reg')).toBe('REG');
    expect(toggleProgram('PHD', 'phd')).toBe('PHD');
  });
  it('is a labelled group of two aria-pressed buttons for the school degree', () => {
    const md = renderToString(<ProgramToggles degree="MD" value="REG" onChange={noop} />);
    expect(md).toContain('role="group"');
    expect(md.match(/<button/g)).toHaveLength(2);
    expect(md).toContain('>MD<');
    expect(md).toContain('>MD-PhD<');
    expect(md.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(md.match(/aria-disabled="true"/g)).toHaveLength(1);
    const doHtml = renderToString(<ProgramToggles degree="DO" value="ALL" onChange={noop} />);
    expect(doHtml).toContain('>DO<');
    expect(doHtml).toContain('>DO-PhD<');
    expect(doHtml).not.toContain('MD');
    expect(doHtml.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(doHtml).not.toContain('aria-disabled');
  });
});
