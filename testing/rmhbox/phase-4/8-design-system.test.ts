/**
 * Phase 4 §8 — UI Design System Tests
 *
 * Verifies the CSS design system has all required RMHbox
 * CSS custom properties defined.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const cssPath = resolve(__dirname, '../../../app/globals.css');
const cssContent = readFileSync(cssPath, 'utf-8');

describe('UI Design System (§8)', () => {
  it('should define --rmhbox-bg color variable', () => {
    expect(cssContent).toContain('--rmhbox-bg:');
  });

  it('should define --rmhbox-surface color variable', () => {
    expect(cssContent).toContain('--rmhbox-surface:');
  });

  it('should define --rmhbox-surface-hover color variable', () => {
    expect(cssContent).toContain('--rmhbox-surface-hover:');
  });

  it('should define --rmhbox-border color variable', () => {
    expect(cssContent).toContain('--rmhbox-border:');
  });

  it('should define --rmhbox-text color variable', () => {
    expect(cssContent).toContain('--rmhbox-text:');
  });

  it('should define --rmhbox-text-muted color variable', () => {
    expect(cssContent).toContain('--rmhbox-text-muted:');
  });

  it('should define --rmhbox-accent color variable', () => {
    expect(cssContent).toContain('--rmhbox-accent:');
  });

  it('should define --rmhbox-accent-hover color variable', () => {
    expect(cssContent).toContain('--rmhbox-accent-hover:');
  });

  it('should define success, danger, warning, info colors', () => {
    expect(cssContent).toContain('--rmhbox-success:');
    expect(cssContent).toContain('--rmhbox-danger:');
    expect(cssContent).toContain('--rmhbox-warning:');
    expect(cssContent).toContain('--rmhbox-info:');
  });

  it('should define typography font family variables', () => {
    expect(cssContent).toContain('--rmhbox-font-display:');
    expect(cssContent).toContain('--rmhbox-font-body:');
    expect(cssContent).toContain('--rmhbox-font-mono:');
  });

  it('should use Nunito for display font', () => {
    expect(cssContent).toMatch(/--rmhbox-font-display:.*Nunito/);
  });

  it('should use Inter for body font', () => {
    expect(cssContent).toMatch(/--rmhbox-font-body:.*Inter/);
  });

  it('should use JetBrains Mono for mono font', () => {
    expect(cssContent).toMatch(/--rmhbox-font-mono:.*JetBrains Mono/);
  });

  it('should have correct accent color hex value', () => {
    expect(cssContent).toContain('#7c5cfc');
  });

  it('should have correct bg color hex value', () => {
    expect(cssContent).toContain('#0f0f1a');
  });
});
