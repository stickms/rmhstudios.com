/**
 * Every `features/<id>/feature.ts` is a valid manifest that tells the truth
 * (redesign audit A1): the id is the folder, each declared route file exists,
 * and each namespace is registered in `lib/i18n/config.ts`. A manifest's `catalog`
 * entry (`features/<id>/catalog.ts`) must be composed into the site catalog
 * exactly once (A1 step 7).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FeatureManifestSchema, defineFeature } from '@/lib/core/feature';
import { games, apps } from '@/lib/catalog';

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
    if (manifest.catalog) {
      expect(manifest.catalog, 'catalog lives in the feature folder').toBe(
        `features/${id}/catalog.ts`,
      );
      expect(existsSync(join(ROOT, manifest.catalog)), `catalog ${manifest.catalog}`).toBe(true);
      const entry = ((await import(`@features/${id}/catalog`)) as { default: { id: string } })
        .default;
      const list = manifest.kind === 'game' ? games : apps;
      const other = manifest.kind === 'game' ? apps : games;
      expect(
        list.filter((e) => e.id === entry.id),
        `${entry.id} must appear exactly once in the composed ${manifest.kind} catalog`,
      ).toHaveLength(1);
      expect(
        other.some((e) => e.id === entry.id),
        `${entry.id} must not also be in the other catalog`,
      ).toBe(false);
      expect(list.find((e) => e.id === entry.id)).toBe(entry);
    } else {
      expect(
        existsSync(join(FEATURES, id, 'catalog.ts')),
        `features/${id}/catalog.ts exists but the manifest does not declare it`,
      ).toBe(false);
    }
    for (const ns of manifest.namespaces) {
      expect(
        configSrc.includes(`"${ns}"`) || configSrc.includes(`'${ns}'`),
        `namespace ${ns}`,
      ).toBe(true);
    }
  });
});
