import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLOR_VISION_MODES,
  COLOR_VISION_LABELS,
  COLOR_VISION_HINTS,
  DEFAULT_COLOR_VISION,
  isColorVisionMode,
  appearanceComfortSchema,
} from '@/lib/appearance/prefs';

/**
 * Colour-vision support has three moving parts that must agree, and each one
 * fails silently on its own:
 *
 *   1. The mode list (this module) — the settings UI and the sync schema.
 *   2. The palettes (`app/globals.css`) — a mode with no CSS block is a setting
 *      that appears to work and changes nothing.
 *   3. The pre-paint script (`app/routes/__root.tsx`) — without it the default
 *      palette flashes on every navigation, which for the viewer this feature
 *      exists for means seeing the colours they cannot distinguish, briefly,
 *      every time.
 *
 * Nothing about a missing piece is visible in review, so it is asserted here.
 */

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
const rootTsx = readFileSync(join(ROOT, 'app', 'routes', '__root.tsx'), 'utf8');

/** The modes that actually retint something ('none' is the untouched default). */
const ACTIVE_MODES = COLOR_VISION_MODES.filter((m) => m !== 'none');

describe('colour-vision modes', () => {
  it('defaults to the untouched palette', () => {
    expect(DEFAULT_COLOR_VISION).toBe('none');
  });

  it('validates its own members and rejects anything else', () => {
    for (const mode of COLOR_VISION_MODES) expect(isColorVisionMode(mode)).toBe(true);
    for (const bad of ['', 'DEUTERANOPIA', 'colour-blind', null, 7, {}]) {
      expect(isColorVisionMode(bad)).toBe(false);
    }
  });

  it('is accepted by the appearance sync schema', () => {
    for (const mode of COLOR_VISION_MODES) {
      expect(appearanceComfortSchema.safeParse({ colorVision: mode }).success).toBe(true);
    }
    expect(appearanceComfortSchema.safeParse({ colorVision: 'nope' }).success).toBe(false);
  });

  it('gives every mode a label and a hint for the settings UI', () => {
    for (const mode of COLOR_VISION_MODES) {
      expect(COLOR_VISION_LABELS[mode]?.length, `${mode} needs a label`).toBeGreaterThan(0);
      expect(COLOR_VISION_HINTS[mode]?.length, `${mode} needs a hint`).toBeGreaterThan(0);
    }
  });

  it.each(ACTIVE_MODES)('%s has a palette in globals.css', (mode) => {
    expect(
      css.includes(`data-color-vision='${mode}'`),
      `No CSS block for '${mode}'. Without one the setting is selectable and does nothing.`
    ).toBe(true);
  });

  it.each(ACTIVE_MODES)('%s retints all three semantic tokens', (mode) => {
    // Grab the first rule for this mode and check it overrides every token that
    // carries status meaning. Retinting two of three leaves one colour stranded
    // in the old palette, which is worse than not retinting at all.
    const start = css.indexOf(`html[data-color-vision='${mode}']`);
    const block = css.slice(start, css.indexOf('}', start));
    for (const token of ['--site-success', '--site-danger', '--site-warning']) {
      expect(block, `'${mode}' does not set ${token}`).toContain(token);
    }
  });

  it('has a dark-theme variant for every mode', () => {
    // A hue picked to read on white is usually below the contrast floor on the
    // near-black themes, so each mode needs a second block scoped to them.
    for (const mode of ACTIVE_MODES) {
      const scoped = `html[data-color-vision='${mode}']:is(`;
      expect(css.includes(scoped), `'${mode}' has no dark-theme override`).toBe(true);
    }
  });

  it('is applied by the pre-paint script, not just at runtime', () => {
    expect(
      rootTsx.includes('rmh-color-vision'),
      'The no-flash script must read the cached mode, or the default palette flashes on every load.'
    ).toBe(true);
    for (const mode of ACTIVE_MODES) {
      expect(rootTsx.includes(mode), `Pre-paint script does not handle '${mode}'`).toBe(true);
    }
  });
});

describe('status colour is never the only signal', () => {
  const badge = readFileSync(join(ROOT, 'components', 'ui', 'badge.tsx'), 'utf8');

  it('pairs each semantic badge variant with a glyph', () => {
    // WCAG 1.4.1: colour alone must not convey meaning. The retint helps a
    // viewer who has configured it; the glyph helps everyone, unconditionally.
    for (const variant of ['success', 'warning', 'danger']) {
      expect(
        badge.includes(`${variant}:`),
        `Badge variant '${variant}' has no entry in STATUS_ICONS`
      ).toBe(true);
    }
    expect(badge).toContain('STATUS_ICONS');
  });

  it('marks the glyph decorative so screen readers read the label once', () => {
    expect(badge).toContain('aria-hidden');
  });
});
