import { describe, expect, it } from 'vitest';
import { mdlMaterialPaths, parseMdlHeader } from './mdl-header';
import { parsePhy, phyBounds } from './phy';
import { gameFileSystem } from './tf2-root.test-support';

describe('mdl / phy guards', () => {
  it('rejects non-model data', () => {
    expect(() => parseMdlHeader(new Uint8Array(512))).toThrow();
    expect(() => parsePhy(new Uint8Array(4))).toThrow();
  });
});

describe.skipIf(!process.env.TF2_ROOT)('mdl / phy (TF2_ROOT)', () => {
  it('reads studiohdr_t fields', () => {
    const fs = gameFileSystem();
    const h = parseMdlHeader(fs.read('models/props_gameplay/resupply_locker.mdl')!);
    expect(h.version).toBeGreaterThanOrEqual(44);
    expect(h.name.toLowerCase()).toContain('resupply_locker');
    expect(h.surfaceProp).toBe('metal');
    expect(h.hullMax.z).toBeGreaterThan(100);
    expect(h.numSkinFamilies).toBeGreaterThanOrEqual(1);
    expect(h.textures).toContain('resupply_locker');
    expect(mdlMaterialPaths(h)[0][0]).toBe('materials/models/props_gameplay/resupply_locker.vmt');
  });

  it('PHY convex hulls convert to Source space and match the MDL hull box', () => {
    const fs = gameFileSystem();
    const phys = fs
      .list('models/props_', 'phy')
      .filter((p) => !p.includes('/gibs/'))
      .sort()
      .slice(0, 400);
    expect(phys.length).toBeGreaterThan(100);
    let compared = 0;
    let matched = 0;
    for (const phyPath of phys) {
      const mdlBytes = fs.read(phyPath.replace(/\.phy$/, '.mdl'));
      const phyBytes = fs.read(phyPath);
      if (!mdlBytes || !phyBytes) continue;
      const h = parseMdlHeader(mdlBytes);
      const phy = parsePhy(phyBytes);
      expect(phy.solids.length).toBeGreaterThan(0);
      expect(phy.text).toMatch(/solid/i);
      const b = phyBounds(phy);
      if (!b || phy.solids.length !== 1) continue; // ragdolls are posed differently from the bind hull
      compared++;
      const mins = [h.hullMin.x, h.hullMin.y, h.hullMin.z];
      const maxs = [h.hullMax.x, h.hullMax.y, h.hullMax.z];
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const tol = Math.max(3, (maxs[k] - mins[k]) * 0.15);
        if (Math.abs(b.mins[k] - mins[k]) > tol || Math.abs(b.maxs[k] - maxs[k]) > tol) ok = false;
      }
      if (ok) matched++;
    }
    expect(compared).toBeGreaterThan(80);
    // Collision models are often simplified, but nearly all should hug the hull box.
    expect(matched / compared).toBeGreaterThan(0.85);
  });

  it('reads multi-convex solids', () => {
    const fs = gameFileSystem();
    const phy = parsePhy(fs.read('models/props_vehicles/mining_car_metal.phy')!);
    expect(phy.solids[0].convexes.length).toBeGreaterThan(1);
    for (const c of phy.solids[0].convexes) {
      expect(c.vertices.length % 3).toBe(0);
      expect(c.vertices.length / 3).toBeGreaterThanOrEqual(4);
      expect(Math.max(...c.triangles)).toBeLessThan(c.vertices.length / 3);
    }
    expect(phy.keyValues.get('solid')!.getString('surfaceprop')).toBe('metal');
  });
});
