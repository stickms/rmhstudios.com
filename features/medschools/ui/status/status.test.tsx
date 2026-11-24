import { readFileSync } from 'node:fs';
import { readCss } from '@/lib/__tests__/css-source';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MILESTONE_TYPES } from '../../engine/tracker';
import type { MedEventTypeId } from '../../medschools.contract';
import { StatusIcon } from './StatusIcon';
import { StatusText } from './StatusText';
import { STATUS, STATUS_KEYS, statusOfEvent, statusOfMilestone } from './status';

const css = readCss('features/medschools/ui/medschools.css').replace(/\/\*[\s\S]*?\*\//g, '');
const en = JSON.parse(readFileSync('locales/en/medschools.json', 'utf8')) as Record<string, string>;

/** The `--name: #hex` declarations of the first `{ ... }` after `selector`. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1]!, m[2]!]));
}
const MODES = {
  light: tokens('.app-theme.medapp-theme,\n:root:has(.medapp-theme)'),
  dark: tokens(":root[data-app-dark='1'] .app-theme.medapp-theme"),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('status keys', () => {
  it('maps every event type, and every milestone but the two plain steps', () => {
    const events: MedEventTypeId[] = [
      'SECONDARY',
      'INTERVIEW',
      'WAITLIST',
      'REJECTION',
      'ACCEPTANCE',
      'WITHDRAWN',
      'HOLD',
    ];
    expect(events.map(statusOfEvent)).toEqual([
      'secondary',
      'interview',
      'waitlist',
      'rejection',
      'acceptance',
      'withdrawn',
      'hold',
    ]);
    expect(MILESTONE_TYPES.filter((m) => statusOfMilestone(m) === null)).toEqual(['SUBMITTED', 'COMPLETE']);
    expect(statusOfMilestone('MATRICULATED')).toBe('matriculation');
    expect(statusOfMilestone('SECONDARY_SUBMITTED')).toBe('secondary');
  });

  it('has a label key in the English catalogue and a token trio in both modes, for every key', () => {
    for (const key of STATUS_KEYS) {
      const def = STATUS[key];
      expect(en[def.labelKey], `${key} label`).toBe(def.labelDefault);
      for (const mode of Object.values(MODES)) {
        for (const part of ['swatch', 'ink', 'text'])
          expect(mode[`app-med-${def.stem}-${part}`], `${key} ${part}`).toBeTruthy();
      }
      expect(css, `${key} class`).toContain(`.medapp-status--${def.stem} {`);
    }
  });
});

describe('status contrast, from the stylesheet', () => {
  for (const [mode, t] of Object.entries(MODES)) {
    for (const key of STATUS_KEYS) {
      const { stem } = STATUS[key];
      const swatch = t[`app-med-${stem}-swatch`]!;
      const ink = t[`app-med-${stem}-ink`]!;
      const text = t[`app-med-${stem}-text`]!;
      const paper = t['app-surface']!;
      const ground = t['app-bg']!;
      it(`${mode} ${key}: text 4.5:1 on paper and ground, icon ink 3:1 on its swatch, paper and ground`, () => {
        expect(contrast(text, paper), 'text on paper').toBeGreaterThanOrEqual(4.5);
        expect(contrast(text, ground), 'text on ground').toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, swatch), 'ink on swatch').toBeGreaterThanOrEqual(3);
        expect(contrast(ink, paper), 'ink on paper').toBeGreaterThanOrEqual(3);
        expect(contrast(ink, ground), 'ink on ground').toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('StatusIcon and StatusText', () => {
  it('hides the icon from assistive technology when the words sit beside it', () => {
    const html = renderToString(<StatusIcon status="acceptance" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('medapp-status--accept');
    expect(html).toContain('d="M5 12l5 5 9-10"');
  });
  it('names the icon when it stands alone', () => {
    const html = renderToString(<StatusIcon status="hold" label="Hold" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Hold"');
  });
  it('prints the label in the status class', () => {
    const html = renderToString(<StatusText status="matriculation">Matriculating</StatusText>);
    expect(html).toContain('medapp-status--matric');
    expect(html).toContain('Matriculating');
  });
});
