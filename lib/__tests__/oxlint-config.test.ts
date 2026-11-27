/**
 * The oxlint configs are generated, and the generator is the contract.
 *
 * `.oxlintrc.json` (what `pnpm lint` runs) and `.oxlintrc.boundaries.json` (what the architecture ratchet runs) are
 * written by `scripts/gen-oxlintrc.mjs` from `eslint-local-rules/design-scope.js`, the one site-tier exemption list.
 * A hand edit, or an edit to design-scope.js without regenerating, would make the linter and the vitest gates
 * disagree about which files are the full-screen tier. This fails until `node scripts/gen-oxlintrc.mjs` is run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTPUTS } from '../../scripts/gen-oxlintrc.mjs';
import plugin from '../../eslint-local-rules/index.js';

const ROOT = resolve(__dirname, '../..');

describe('oxlint configuration', () => {
  for (const [file, config] of Object.entries(OUTPUTS as Record<string, unknown>)) {
    it(`${file} is what scripts/gen-oxlintrc.mjs writes`, () => {
      expect(readFileSync(resolve(ROOT, file), 'utf8'), `run: node scripts/gen-oxlintrc.mjs`).toBe(
        JSON.stringify(config, null, 2) + '\n',
      );
    });
  }

  it('only names local/ rules the plugin defines', () => {
    const named = new Set<string>();
    const walk = (value: unknown) => {
      if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          if (key.startsWith('local/')) named.add(key.slice('local/'.length));
          walk(inner);
        }
      }
    };
    walk(OUTPUTS['.oxlintrc.json']);
    const defined = new Set(Object.keys((plugin as { rules: Record<string, unknown> }).rules));
    expect([...named].filter((rule) => !defined.has(rule))).toEqual([]);
  });
});
