import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../button';
import { Switch } from '../switch';
import { Slider } from '../slider';
import { Badge } from '../badge';
import { Skeleton } from '../skeleton';

const css = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('Steel controls (plan section 6)', () => {
  it('Button has exactly the K1 to K3 variants plus danger, at 36px (44px on touch)', () => {
    const src = css('components/ui/button.tsx');
    const block = src.slice(src.indexOf('variant: {'), src.indexOf('size: {'));
    expect([...block.matchAll(/^\s{8}([a-z]+):/gm)].map((m) => m[1])).toEqual(['default', 'primary', 'ghost', 'danger']);
    const html = renderToStaticMarkup(<Button>Go</Button>);
    expect(html).toContain('h-9');
    expect(html).toContain('pointer-coarse:h-11');
    expect(html).toContain('bg-site-surface'); // K1
    expect(renderToStaticMarkup(<Button variant="primary">Go</Button>)).toContain('bg-site-accent'); // K2
    expect(html).not.toContain('data-fluid-press');
    expect(html).not.toContain('data-jelly');
  });

  it('K6: the switch thumb is a real 22x12 chrome pill the renderer can find, in a host that owns --c', () => {
    const html = renderToStaticMarkup(<Switch checked={false} onCheckedChange={() => {}} aria-label="x" />);
    expect(html).toContain('role="switch"');
    expect(html).toMatch(/<span aria-hidden="true" data-chrome="pill" class="chrome-thumb[^"]*h-3 w-\[22px\] rounded-full/);
    expect(html).toContain('class="chrome-host');
    expect(html).toContain('h-4 w-11'); // track 44 x 16
    expect(html).toContain('translate-x-0');
    const on = renderToStaticMarkup(<Switch checked onCheckedChange={() => {}} aria-label="x" />);
    expect(on).toContain('translate-x-[18px]');
    expect(on).toContain('aria-checked="true"');
  });

  it('K7: the slider track is 2px, the Radix thumb is the chrome pill, the root is the --c host', () => {
    const html = renderToStaticMarkup(<Slider defaultValue={[30]} aria-label="v" />);
    expect(html).toContain('chrome-host');
    expect(html).toContain('h-11'); // 44px hit area
    expect(html).toContain('data-chrome="pill"');
    expect(html).toContain('h-2.5 w-[22px]');
    expect(html).toContain("rounded-full");
    expect(html).toContain('data-[orientation=horizontal]:h-0.5');
    expect(html).not.toContain('slider-range');
  });

  it('K9: a tag is 11px, 500, muted, 1px border, 4px radius, 1px 6px', () => {
    const html = renderToStaticMarkup(<Badge>New</Badge>);
    for (const c of ['text-caption', 'font-medium', 'border-site-border', 'text-site-text-muted', 'rounded-site-sm', 'px-1.5', 'py-px']) {
      expect(html).toContain(c);
    }
  });

  it('M6: a skeleton is a still --site-bg-subtle block', () => {
    const html = renderToStaticMarkup(<Skeleton className="h-4" />);
    expect(html).toContain('bg-site-bg-subtle');
    expect(html).not.toMatch(/animate-|shimmer/);
  });

  it('C2 to C6: the chrome stylesheet follows section 4.1', () => {
    const c = css('app/styles/steel-chrome.css');
    expect(c).toMatch(/@property --c \{\s*syntax: '<number>';\s*inherits: true;\s*initial-value: 0;/);
    expect(c).toMatch(/\.chrome-host::before \{[^}]*inset: -20px/);
    expect(c).toMatch(/transition: --c var\(--m3\) ease/);
    expect(c).toContain('rgba(0, 0, 0, calc(0.45 * var(--c)))');
    expect(c).toContain('rgba(0, 0, 0, calc(0.3 * var(--c)))');
    expect(c).toContain('50.5%');
    // C6: proximity is CSS. C5: hover only on fine pointers.
    expect(c).not.toMatch(/pointermove|addEventListener/);
    expect(c).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{[^@]*\.chrome-host:hover/);
  });
});
