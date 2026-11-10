/**
 * Every `features/<id>/feature.ts` is a valid manifest that tells the truth
 * (redesign audit A1): the id is the folder, each declared route file exists,
 * and each namespace is registered in `lib/i18n/config.ts`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FeatureManifestSchema, defineFeature } from '@/lib/core/feature';

const ROOT = resolve(__dirname, '../..');
const FEATURES = join(ROOT, 'features');

const ids = existsSync(FEATURES)
  ? readdirSync(FEATURES, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

const configSrc = readFileSync(join(ROOT, 'lib/i18n/config.ts'), 'utf8');

describe('defineFeature', () => {
  it('defaults listed to true and rejects a malformed manifest', () => {
    const m = defineFeature({
      id: 'x-game',
      kind: 'game',
      basePath: '/x-game',
      delivery: 'shell',
      routes: [],
      namespaces: [],
    });
    expect(m.listed).toBe(true);
    expect(FeatureManifestSchema.safeParse({ id: 'Bad Id' }).success).toBe(false);
  });
});

describe('features/*/feature.ts', () => {
  it('the features/ root exists (the Dockerfile server-builder COPYs it)', () => {
    expect(existsSync(FEATURES)).toBe(true);
  });

  it.each(ids)('%s has a manifest that matches the tree', async (id) => {
    expect(existsSync(join(FEATURES, id, 'feature.ts')), `features/${id}/feature.ts`).toBe(true);
    const mod = (await import(`@features/${id}/feature`)) as { default: unknown };
    const manifest = FeatureManifestSchema.parse(mod.default);
    expect(manifest.id).toBe(id);
    for (const route of manifest.routes) {
      expect(existsSync(join(ROOT, route)), `route ${route}`).toBe(true);
    }
    for (const ns of manifest.namespaces) {
      expect(
        configSrc.includes(`"${ns}"`) || configSrc.includes(`'${ns}'`),
        `namespace ${ns}`,
      ).toBe(true);
    }
  });
});
