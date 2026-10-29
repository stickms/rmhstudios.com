/**
 * `nav.bin`: the compact binary form of a NavMesh (the map package's `nav`
 * file; lib/tf2-game/assets/map-manifest.ts). Little-endian:
 *
 *   magic "TFNV" · u16 version · u16 cellSize
 *   u32 areas · u32 connections · u32 sectors · u16 pois · u16 blockers
 *   areas:       i16 gx0 gy0 gx1 gy1 · f32 cz dzdx dzdy · u32 attrs · i16 blocker · u16 sector   (32 B)
 *   connections: u16 per area (count), then per connection u32 to · u8 type · i16 ax ay bx by z (15 B)
 *   vis:         sectors × ⌈sectors / 8⌉ bytes
 *   blockers:    u16 model · u8 kind · u8 triggerControlled · u8 ownerTeam
 *   pois:        u8 kind · u8 team · i16 index · i32 area · f32 x y z · u8 nameLength · name (UTF-8)
 *
 * Portal coordinates are rounded to whole units (they lie on the half-cell
 * grid; a unit is well inside the path follower's tolerance).
 */

import { NavMesh, type NavBlocker, type NavPoi } from './nav-mesh';

export const NAV_MAGIC = 0x564e4654; // "TFNV"
export const NAV_VERSION = 1;

export function encodeNavMesh(m: NavMesh): Uint8Array {
  const n = m.areaCount;
  const c = m.connectionCount;
  const names = m.pois.map((p) => new TextEncoder().encode(p.name.slice(0, 64)));
  const size =
    24 +
    n * 32 +
    n * 2 +
    c * 15 +
    m.vis.length +
    m.blockers.length * 5 +
    m.pois.reduce((s, _p, i) => s + 21 + names[i].length, 0);
  const buf = new Uint8Array(size);
  const v = new DataView(buf.buffer);
  let o = 0;
  v.setUint32(o, NAV_MAGIC, true);
  v.setUint16(o + 4, NAV_VERSION, true);
  v.setUint16(o + 6, m.cellSize, true);
  v.setUint32(o + 8, n, true);
  v.setUint32(o + 12, c, true);
  v.setUint32(o + 16, m.sectorCount, true);
  v.setUint16(o + 20, m.pois.length, true);
  v.setUint16(o + 22, m.blockers.length, true);
  o = 24;
  for (let a = 0; a < n; a++) {
    v.setInt16(o, m.gx0[a], true);
    v.setInt16(o + 2, m.gy0[a], true);
    v.setInt16(o + 4, m.gx1[a], true);
    v.setInt16(o + 6, m.gy1[a], true);
    v.setFloat32(o + 8, m.cz[a], true);
    v.setFloat32(o + 12, m.dzdx[a], true);
    v.setFloat32(o + 16, m.dzdy[a], true);
    v.setUint32(o + 20, m.attrs[a], true);
    v.setInt16(o + 24, m.blocker[a], true);
    v.setUint16(o + 26, m.sector[a], true);
    o += 32;
  }
  for (let a = 0; a < n; a++) {
    v.setUint16(o, m.connStart[a + 1] - m.connStart[a], true);
    o += 2;
  }
  for (let i = 0; i < c; i++) {
    v.setUint32(o, m.connTo[i], true);
    v.setUint8(o + 4, m.connType[i]);
    for (let k = 0; k < 5; k++) v.setInt16(o + 5 + k * 2, clampI16(m.portal[i * 5 + k]), true);
    o += 15;
  }
  buf.set(m.vis, o);
  o += m.vis.length;
  for (const b of m.blockers) {
    v.setUint16(o, b.model, true);
    v.setUint8(o + 2, b.kind);
    v.setUint8(o + 3, b.triggerControlled ? 1 : 0);
    v.setUint8(o + 4, b.ownerTeam);
    o += 5;
  }
  m.pois.forEach((p, i) => {
    v.setUint8(o, p.kind);
    v.setUint8(o + 1, p.team);
    v.setInt16(o + 2, p.index, true);
    v.setInt32(o + 4, p.area, true);
    v.setFloat32(o + 8, p.pos.x, true);
    v.setFloat32(o + 12, p.pos.y, true);
    v.setFloat32(o + 16, p.pos.z, true);
    v.setUint8(o + 20, names[i].length);
    buf.set(names[i], o + 21);
    o += 21 + names[i].length;
  });
  return buf;
}

function clampI16(x: number): number {
  const r = Math.round(x);
  return r < -32768 ? -32768 : r > 32767 ? 32767 : r;
}

/** Parses nav.bin; throws on a bad magic, version or truncation. */
export function decodeNavMesh(bytes: Uint8Array): NavMesh {
  if (bytes.byteLength < 24) throw new Error('nav.bin: truncated');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== NAV_MAGIC) throw new Error('nav.bin: bad magic');
  const version = v.getUint16(4, true);
  if (version !== NAV_VERSION) throw new Error(`nav.bin: unsupported version ${version}`);
  const cellSize = v.getUint16(6, true);
  const n = v.getUint32(8, true);
  const c = v.getUint32(12, true);
  const sectorCount = v.getUint32(16, true);
  const poiCount = v.getUint16(20, true);
  const blockerCount = v.getUint16(22, true);
  const need = (o: number, k: number): void => {
    if (o + k > bytes.byteLength) throw new Error('nav.bin: truncated');
  };
  let o = 24;
  need(o, n * 34);
  const gx0 = new Int16Array(n);
  const gy0 = new Int16Array(n);
  const gx1 = new Int16Array(n);
  const gy1 = new Int16Array(n);
  const cz = new Float32Array(n);
  const dzdx = new Float32Array(n);
  const dzdy = new Float32Array(n);
  const attrs = new Uint32Array(n);
  const blocker = new Int16Array(n);
  const sector = new Uint16Array(n);
  for (let a = 0; a < n; a++) {
    gx0[a] = v.getInt16(o, true);
    gy0[a] = v.getInt16(o + 2, true);
    gx1[a] = v.getInt16(o + 4, true);
    gy1[a] = v.getInt16(o + 6, true);
    cz[a] = v.getFloat32(o + 8, true);
    dzdx[a] = v.getFloat32(o + 12, true);
    dzdy[a] = v.getFloat32(o + 16, true);
    attrs[a] = v.getUint32(o + 20, true);
    blocker[a] = v.getInt16(o + 24, true);
    sector[a] = v.getUint16(o + 26, true);
    o += 32;
  }
  const connStart = new Uint32Array(n + 1);
  for (let a = 0; a < n; a++) {
    connStart[a + 1] = connStart[a] + v.getUint16(o, true);
    o += 2;
  }
  if (connStart[n] !== c) throw new Error('nav.bin: connection count mismatch');
  need(o, c * 15);
  const connTo = new Uint32Array(c);
  const connType = new Uint8Array(c);
  const portal = new Float32Array(c * 5);
  for (let i = 0; i < c; i++) {
    connTo[i] = v.getUint32(o, true);
    if (connTo[i] >= n) throw new Error('nav.bin: bad connection');
    connType[i] = v.getUint8(o + 4);
    for (let k = 0; k < 5; k++) portal[i * 5 + k] = v.getInt16(o + 5 + k * 2, true);
    o += 15;
  }
  const visBytes = sectorCount * ((sectorCount + 7) >> 3);
  need(o, visBytes);
  const vis = bytes.slice(o, o + visBytes);
  o += visBytes;
  const blockers: NavBlocker[] = [];
  need(o, blockerCount * 5);
  for (let i = 0; i < blockerCount; i++) {
    blockers.push({
      model: v.getUint16(o, true),
      kind: v.getUint8(o + 2),
      triggerControlled: v.getUint8(o + 3) !== 0,
      ownerTeam: v.getUint8(o + 4),
    });
    o += 5;
  }
  const pois: NavPoi[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < poiCount; i++) {
    need(o, 21);
    const len = v.getUint8(o + 20);
    need(o, 21 + len);
    pois.push({
      kind: v.getUint8(o),
      team: v.getUint8(o + 1),
      index: v.getInt16(o + 2, true),
      area: v.getInt32(o + 4, true),
      pos: {
        x: v.getFloat32(o + 8, true),
        y: v.getFloat32(o + 12, true),
        z: v.getFloat32(o + 16, true),
      },
      name: dec.decode(bytes.subarray(o + 21, o + 21 + len)),
    });
    o += 21 + len;
  }
  return new NavMesh({
    cellSize,
    areaCount: n,
    gx0,
    gy0,
    gx1,
    gy1,
    cz,
    dzdx,
    dzdy,
    attrs,
    blocker,
    sector,
    connStart,
    connTo,
    connType,
    portal,
    sectorCount,
    vis,
    pois,
    blockers,
  });
}
