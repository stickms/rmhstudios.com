/**
 * The docked globe hands its ball to the CSS glass while iOS Safari's toolbar moves (LiquidGlobe `onToolbar`), because
 * the CSS glass tracks the ball exactly and the shader coat's refracted picture trails it. Source contract: the state,
 * its CSS and the iOS-only listener must stay together.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('globe toolbar hold', () => {
  const globe = read('LiquidGlobe.tsx');
  const css = read('radial.css');

  it('the coat fades out and the CSS glass takes over in the hold state', () => {
    expect(css).toMatch(/\[data-globe-coat='hold'\] \.radial-globe__jelly \{\s*opacity: 0;/);
    // `on` is what switches the CSS disc off; `hold` must not be one of the selectors that do.
    expect(css).not.toMatch(/\[data-globe-coat='hold'\] \.radial-globe__glass/);
  });

  it('listens to the visual viewport on iOS WebKit only, and removes the listener', () => {
    expect(globe).toContain("root.classList.contains('ios-webkit') ? window.visualViewport : null");
    expect(globe).toContain("toolbarViewport?.addEventListener('resize', onToolbar)");
    expect(globe).toContain("toolbarViewport?.removeEventListener('resize', onToolbar)");
  });

  it('returns through entering, the cross-fade the first arrival uses', () => {
    expect(globe).toMatch(
      /globeCoat !== 'hold'\) return;\s*stage\.dataset\.globeCoat = 'entering'/,
    );
  });
});
