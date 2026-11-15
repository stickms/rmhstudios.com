import { describe, expect, it } from 'vitest';
import catalog from '../catalog';
import { PUBLISHED_IMAGE } from '../engine/image-manifest';

describe('rmhOS publish state', () => {
  it("the catalog says 'Coming soon' if and only if no image is published", () => {
    const expected = PUBLISHED_IMAGE === null ? 'Coming soon' : 'Beta';
    expect(
      catalog.status,
      `features/rmhos/catalog.ts has status '${catalog.status}' but PUBLISHED_IMAGE in ` +
        `features/rmhos/engine/image-manifest.ts is ${PUBLISHED_IMAGE === null ? 'null' : 'set'}: ` +
        `the two switches must agree (expected '${expected}'). Publishing flips both in one commit.`,
    ).toBe(expected);
  });
});
