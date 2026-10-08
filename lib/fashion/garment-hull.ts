/**
 * Turning coverage into surface.
 *
 * A garment piece names a segment and a span of it. This walks that span of the
 * figure's spine, builds a frame at each station, and hands the shared loft a
 * cross-section that is the BODY's cross-section plus the garment's thickness.
 * That is the entire mechanism behind "built around the user": there is no
 * garment geometry anywhere, only body geometry with an offset.
 *
 * The figure's own segments are lofted by the same function with a zero offset,
 * so a body and a coat are the same code path and cannot drift apart.
 *
 * ## One wave, many surfaces
 *
 * Every loft here is given the SAME `rayOrigin` — the figure's chest. The ripple
 * measures its arc distance from that one point, so a poke sends a single wave
 * across the body and everything worn on it, instead of each garment ringing
 * independently like a rack of separate objects.
 */

import { frameFor, loft, type LoftGrid, type LoftStation } from '@/lib/loft/grid';
import type { Garment, GarmentPiece, Trinket } from './garments';
import { findSegment, sampler, type Segment, type SegmentId, type Side } from './figure';

/** Stations along the shortest piece; long pieces get proportionally more. */
const MIN_STATIONS = 8;
const MAX_STATIONS = 26;
/** Ring samples. Fewer than the cars': a sleeve is 8 cm across, not 2 m. */
const SAMPLES = 20;

/**
 * Segment ends that are genuine extremities, where a garment closes over the
 * body rather than opening onto more body.
 *
 * A hat closes over the crown, a shoe over the toe, a glove over the fingers.
 * A t-shirt reaching the top of the torso does NOT close — that end is the neck
 * hole, and sealing it would put the collar over the wearer's head.
 */
const EXTREMITY_END: ReadonlySet<SegmentId> = new Set<SegmentId>(['head', 'hand', 'foot']);

export interface GarmentPart {
  /** Which piece and side this came from, so a renderer can key on it. */
  segment: SegmentId;
  side: Side;
  grid: LoftGrid;
}

/** A wire primitive: line-segment vertex pairs, already expanded. */
export interface WirePart {
  positions: Float32Array;
}

type Vec3 = [number, number, number];

/* ── Lofting one piece ────────────────────────────────────────────────────── */

function stationCount(from: number, to: number): number {
  const span = Math.abs(to - from);
  return Math.max(MIN_STATIONS, Math.min(MAX_STATIONS, Math.round(MIN_STATIONS + span * 18)));
}

/**
 * Loft one piece over one segment.
 *
 * `offset` is the garment's thickness; pass 0 to get the body itself, which is
 * exactly how the figure is drawn.
 */
function loftPiece(
  segment: Segment,
  piece: GarmentPiece,
  offset: number,
  round: number,
  rayOrigin: Vec3,
): LoftGrid {
  const at = sampler(segment);
  const count = stationCount(piece.from, piece.to);
  const scale = piece.scale ?? 1;
  const bias = piece.bias ?? [0, 0, 0];
  // A limb defined on the +x side is mirrored to make the other one, so anything
  // pushed sideways has to be mirrored with it or the bag swaps shoulders.
  const flip = segment.side === 'right' ? -1 : 1;

  const stations: LoftStation[] = [];
  const capFrom = piece.from <= 0.001 && segment.capStart;
  const capTo = piece.to >= 0.999 && EXTREMITY_END.has(segment.id);

  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const t = piece.from + (piece.to - piece.from) * u;
    const sample = at(t);
    // The tangent by central difference along the spine, clamped at the ends.
    const eps = 0.004;
    const a = at(Math.max(0, t - eps)).p;
    const b = at(Math.min(1, t + eps)).p;
    const { right, up } = frameFor([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);

    const flare = (piece.flareFrom ?? 0) * (1 - u) + (piece.flareTo ?? 0) * u;
    const pole = (capFrom && i === 0) || (capTo && i === count - 1);

    stations.push({
      centre: [sample.p[0] + bias[0] * flip, sample.p[1] + bias[1], sample.p[2] + bias[2]],
      right,
      up,
      halfRight: pole ? 0 : Math.max(0, sample.rx * scale + offset + flare),
      halfUp: pole ? 0 : Math.max(0, sample.rz * scale + offset + flare),
      round,
      crown: 0,
    });
  }

  return loft(stations, { samples: SAMPLES, ringEvery: 2, meridianEvery: 2, rayOrigin });
}

/**
 * Where a ripple's angles are measured from: the middle of the chest.
 *
 * Shared by the body and by every garment, so one poke is one wave over the
 * whole outfit rather than a separate ring per layer.
 */
export function rippleOrigin(segments: Segment[]): Vec3 {
  const torso = findSegment(segments, 'torso', 'centre');
  if (!torso) return [0, 1, 0];
  const p = sampler(torso)(0.62).p;
  return [p[0], p[1], p[2]];
}

/** Loft the figure itself — the same code path a garment takes, with no offset. */
export function buildBody(segments: Segment[], origin: Vec3): GarmentPart[] {
  return segments.map((segment) => ({
    segment: segment.id,
    side: segment.side,
    grid: loftPiece(segment, { segment: segment.id, from: 0, to: 1 }, 0, segment.round, origin),
  }));
}

/**
 * Loft one garment onto the figure.
 *
 * A piece naming a paired segment produces two parts, one per side — so "covers
 * the upper arm" means both arms without the catalogue ever saying so.
 */
export function buildGarment(garment: Garment, segments: Segment[], origin: Vec3): GarmentPart[] {
  const parts: GarmentPart[] = [];
  for (const piece of garment.pieces) {
    for (const side of ['centre', 'left', 'right'] as const) {
      const segment = findSegment(segments, piece.segment, side);
      if (!segment) continue;
      parts.push({
        segment: piece.segment,
        side,
        grid: loftPiece(segment, piece, garment.offset, garment.round ?? segment.round, origin),
      });
    }
  }
  return parts;
}

/* ── Trinkets ─────────────────────────────────────────────────────────────
   The handful of things not worth a lofted tube: a pair of lenses is two rings
   and a bridge, a ring is a ring. They are drawn in the cage's own ink as line
   segments, which is also why they stay legible at the size they are. */

function ringAt(
  out: number[],
  centre: Vec3,
  right: Vec3,
  up: Vec3,
  radius: number,
  samples = 18,
): void {
  for (let i = 0; i < samples; i++) {
    const a0 = (i / samples) * Math.PI * 2;
    const a1 = ((i + 1) / samples) * Math.PI * 2;
    for (const a of [a0, a1]) {
      out.push(
        centre[0] + (Math.cos(a) * right[0] + Math.sin(a) * up[0]) * radius,
        centre[1] + (Math.cos(a) * right[1] + Math.sin(a) * up[1]) * radius,
        centre[2] + (Math.cos(a) * right[2] + Math.sin(a) * up[2]) * radius,
      );
    }
  }
}

function line(out: number[], a: Vec3, b: Vec3): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
}

/** Build a wire accessory, positioned from the figure it is worn on. */
export function buildTrinket(kind: Trinket, segments: Segment[]): WirePart {
  const pts: number[] = [];
  const head = findSegment(segments, 'head', 'centre');
  const X: Vec3 = [1, 0, 0];
  const Y: Vec3 = [0, 1, 0];

  if (head && (kind === 'glasses' || kind === 'sunglasses')) {
    const at = sampler(head);
    const brow = at(0.44);
    const lens = brow.rx * 0.44;
    const z = brow.p[2] + brow.rz * 0.94;
    const y = brow.p[1];
    for (const side of [-1, 1]) {
      const c: Vec3 = [side * brow.rx * 0.46, y, z];
      ringAt(pts, c, X, Y, lens, 16);
      if (kind === 'sunglasses') ringAt(pts, c, X, Y, lens * 0.62, 16);
      // The temple arm, back along the side of the head.
      line(
        pts,
        [side * brow.rx * 0.9, y, z - lens * 0.4],
        [side * brow.rx * 0.98, y, brow.p[2] - brow.rz * 0.5],
      );
    }
    line(pts, [-brow.rx * 0.08, y, z], [brow.rx * 0.08, y, z]);
  }

  if (head && kind === 'earrings') {
    const at = sampler(head);
    const ear = at(0.46);
    for (const side of [-1, 1]) {
      const c: Vec3 = [side * ear.rx * 1.0, ear.p[1] - ear.rz * 0.16, ear.p[2] - ear.rz * 0.1];
      ringAt(pts, c, [0, 0, 1], Y, ear.rx * 0.16, 12);
    }
  }

  if (kind === 'necklace' || kind === 'chain') {
    const torso = findSegment(segments, 'torso', 'centre');
    if (torso) {
      const at = sampler(torso);
      const drop = kind === 'necklace' ? 0.86 : 0.8;
      const s = at(drop);
      ringAt(pts, [s.p[0], s.p[1], s.p[2]], X, [0, 0, 1], Math.max(s.rx, s.rz) * 0.78, 26);
      if (kind === 'necklace') {
        const pendant = at(drop - 0.06);
        ringAt(pts, [0, pendant.p[1], pendant.p[2] + pendant.rz], X, Y, s.rx * 0.09, 10);
      }
    }
  }

  if (kind === 'ring') {
    const hand = findSegment(segments, 'hand', 'left');
    if (hand) {
      const s = sampler(hand)(0.72);
      ringAt(pts, [s.p[0] + s.rx * 0.5, s.p[1], s.p[2]], [0, 1, 0], [0, 0, 1], s.rx * 0.3, 12);
    }
  }

  return { positions: Float32Array.from(pts) };
}
