/**
 * The sewn shell, checked against the properties that make a garment look like
 * it has volume rather than like a sheet of paper.
 *
 * Three of these are load-bearing in a way that is easy to miss:
 *
 * - **Closed.** Every edge used by exactly two triangles. The material renders
 *   `FrontSide` on the strength of that — a hole anywhere and the player would
 *   see straight through a garment into its own interior.
 * - **Outward-wound.** Checked as a positive signed volume, which is the only
 *   test that catches a rim quad stitched the wrong way round: it renders
 *   perfectly at every angle except the one where it is inside out.
 * - **Never degenerate.** The front and back sheets must be separated
 *   *everywhere*, including at the hem. A one-cell-wide sleeve tip whose
 *   corners all sit on the seam would otherwise collapse onto its own mirror
 *   image and z-fight.
 */

import { describe, it, expect } from 'vitest';
import { PATTERNS, GARMENT_KINDS } from '../patterns';
import { buildShell, writeShell } from '../shell';

/** Inflate a kind's shell over its own flat rest pose. */
function restShell(kind: (typeof GARMENT_KINDS)[number]) {
  const topology = PATTERNS[kind];
  const { shell } = topology;
  const positions = new Float32Array(shell.vertexCount * 3);
  const normals = new Float32Array(shell.vertexCount * 3);
  writeShell(shell, topology.indices, topology.restPositions, positions, normals);
  return { topology, shell, positions, normals };
}

describe('garment shells', () => {
  it('closes: every edge is shared by exactly two triangles', () => {
    for (const kind of GARMENT_KINDS) {
      const { shell } = PATTERNS[kind];
      const uses = new Map<string, number>();
      for (let t = 0; t < shell.indices.length / 3; t++) {
        for (let e = 0; e < 3; e++) {
          const a = shell.indices[t * 3 + e];
          const b = shell.indices[t * 3 + ((e + 1) % 3)];
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          uses.set(key, (uses.get(key) ?? 0) + 1);
        }
      }
      const open = [...uses.values()].filter((count) => count !== 2);
      expect({ kind, open: open.length }).toEqual({ kind, open: 0 });
    }
  });

  it('winds outward — the enclosed volume is positive, not inside out', () => {
    for (const kind of GARMENT_KINDS) {
      const { shell, positions } = restShell(kind);

      // Divergence theorem over the closed surface: a consistently
      // outward-facing mesh integrates to +volume, an inverted one to -volume.
      let six = 0;
      for (let t = 0; t < shell.indices.length / 3; t++) {
        const a = shell.indices[t * 3] * 3;
        const b = shell.indices[t * 3 + 1] * 3;
        const c = shell.indices[t * 3 + 2] * 3;
        six +=
          positions[a] *
            (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) -
          positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) +
          positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
      }
      const volume = six / 6;
      expect({ kind, positive: volume > 0 }).toEqual({ kind, positive: true });
      // Sanity on the magnitude: a garment is roughly its area times its
      // thickness, so a few litres, not a few millilitres and not a bathtub.
      expect(volume).toBeGreaterThan(0.002);
      expect(volume).toBeLessThan(0.2);
    }
  });

  it('separates the two sheets everywhere, hems included', () => {
    for (const kind of GARMENT_KINDS) {
      const { topology, shell, positions } = restShell(kind);
      const { thickness } = shell;

      let thinnest = Infinity;
      let fattest = 0;
      for (let p = 0; p < topology.count; p++) {
        const front = p * 3;
        const back = (p + topology.count) * 3;
        const gap = Math.hypot(
          positions[front] - positions[back],
          positions[front + 1] - positions[back + 1],
          positions[front + 2] - positions[back + 2],
        );
        thinnest = Math.min(thinnest, gap);
        fattest = Math.max(fattest, gap);
      }

      // A hem has body in it; nothing pinches to a knife edge.
      expect(thinnest).toBeGreaterThan(0.15 * 2 * thickness);
      // And the fattest part of the piece is the full stated thickness.
      expect(fattest).toBeCloseTo(2 * thickness, 5);
    }
  });

  it('lofts the deep parts of a piece more than the shallow ones', () => {
    // A shirt's sleeves are three columns wide and its body is five, so the
    // sleeves must come out slimmer — that variation is the difference between
    // a garment and a pillow.
    const shirt = PATTERNS.shirt;
    const sleeve = shirt.slotToParticle[1 * shirt.cols + 1];
    const chest = shirt.slotToParticle[2 * shirt.cols + 4];
    expect(sleeve).toBeGreaterThanOrEqual(0);
    expect(chest).toBeGreaterThanOrEqual(0);
    expect(shirt.shell.loft[sleeve]).toBeLessThan(shirt.shell.loft[chest]);
  });

  it('keeps every loft inside its bounds', () => {
    for (const kind of GARMENT_KINDS) {
      const { loft } = PATTERNS[kind].shell;
      for (const value of loft) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(Math.max(...loft)).toBeCloseTo(1, 5);
    }
  });

  it('adds no particles to the simulation', () => {
    // The whole point: volume is a render-time and contact-time property. If
    // this ever fails, the shell has started costing the solver work and the
    // frame budget assumptions in `constants.ts` are wrong.
    for (const kind of GARMENT_KINDS) {
      const topology = PATTERNS[kind];
      expect(topology.restPositions.length).toBe(topology.count * 3);
      expect(topology.shell.vertexCount).toBe(topology.count * 2);
      expect(topology.shell.contactPad.length).toBe(topology.count);
      expect(topology.shell.selfRadius.length).toBe(topology.count);
    }
  });

  it('gives physics a contact radius that matches what is drawn', () => {
    for (const kind of GARMENT_KINDS) {
      const { shell } = PATTERNS[kind];
      for (let p = 0; p < shell.contactPad.length; p++) {
        const half = shell.thickness * shell.loft[p];
        // Arena contacts sit outside the fabric's own half-thickness, so a
        // garment rests *on* a bin floor rather than half-buried in it.
        expect(shell.contactPad[p]).toBeGreaterThan(half);
        // Cloth-on-cloth never drops below the old flat-sheet radius, so two
        // hems meeting behave exactly as they did before.
        expect(shell.selfRadius[p]).toBeGreaterThanOrEqual(0.032);
        expect(shell.selfRadius[p]).toBeLessThanOrEqual(shell.maxSelfRadius);
      }
      expect(shell.maxContactPad).toBeGreaterThan(0);
    }
  });

  it('writes finite positions and unit normals', () => {
    for (const kind of GARMENT_KINDS) {
      const { positions, normals } = restShell(kind);
      for (const value of positions) expect(Number.isFinite(value)).toBe(true);
      for (let v = 0; v < normals.length; v += 3) {
        const length = Math.hypot(normals[v], normals[v + 1], normals[v + 2]);
        expect(length).toBeCloseTo(1, 5);
      }
    }
  });

  it('is a pure function of the cut pattern', () => {
    // Two clients racing the same seed must agree on collision radii, which are
    // derived here — so this is part of the determinism guarantee, not just
    // tidiness.
    const topology = PATTERNS.pants;
    const source = {
      count: topology.count,
      cols: topology.cols,
      rows: topology.rows,
      slotToParticle: topology.slotToParticle,
      particleCol: topology.particleCol,
      particleRow: topology.particleRow,
      indices: topology.indices,
      uvs: topology.uvs,
      thickness: topology.shell.thickness,
    };
    const a = buildShell(source);
    const b = buildShell(source);
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
    expect(Array.from(a.loft)).toEqual(Array.from(b.loft));
    expect(Array.from(a.selfRadius)).toEqual(Array.from(topology.shell.selfRadius));
  });
});
