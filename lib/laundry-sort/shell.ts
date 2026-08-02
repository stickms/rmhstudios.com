/**
 * Laundry Sort — turning a simulated sheet into a garment with volume.
 *
 * The solver works on a **mid-surface**: one lattice of particles, one layer
 * thick, which is the cheapest thing that behaves like cloth and the reason a
 * full arena of laundry fits in a browser frame budget. Rendering that lattice
 * directly is what made the old garments read as flat sheets of fabric — a
 * shirt seen edge-on was literally zero millimetres thick, and no amount of
 * bump mapping hides that.
 *
 * A real garment is not a surface, it is a **sewn shell**: two layers of cloth
 * joined at a seam with air in between. That is exactly what this module
 * builds. From one mid-surface it derives:
 *
 *  - a **front sheet**, pushed out along the surface normal,
 *  - a **back sheet**, pushed the other way with its winding reversed,
 *  - a **seam rim** stitching the two together around every open edge,
 *
 * with the offset tapering from a full-thickness body down to a thin hem at the
 * edges, so a sleeve is slimmer than a torso and a cuff reads as a cuff.
 *
 * The important property is what this does *not* cost. The shell is a pure
 * function of the mid-surface: no extra particles, no extra constraints, no
 * extra substep work. The solver is untouched and simulates exactly the same
 * number of degrees of freedom it did when the cloth was flat — which matters,
 * because the solver is the part with a frame budget.
 *
 * What it does cost is geometry: a shirt goes from 44 vertices and 56
 * triangles to 88 and 172. That sounds like a lot and is not — a full arena of
 * twelve garments is under 2,000 triangles, and because a closed shell can be
 * drawn `FrontSide` (a single sheet could not be), back-face culling throws
 * away about half of them before shading. Per frame, {@link writeShell} walks
 * the triangles twice instead of once, on meshes this size.
 *
 * Physics still has to *know* about the thickness even though it does not
 * simulate it. A garment whose mid-surface rests on the floor would bury half
 * its volume in the concrete, and a heap of them would interpenetrate into one
 * blob. So the shell also publishes the per-particle contact radii the solver
 * uses against the arena and against other cloth — derived from the same loft
 * profile, so the fabric collides at the thickness you can actually see.
 */

/**
 * Half-thickness at a hem, for contacts with the arena, in metres.
 *
 * The old solver-wide `CONTACT_RADIUS`. It is now a floor rather than the whole
 * story: {@link ShellTopology.contactPad} adds the local loft on top, so a
 * plump towel sits on a bin floor at its own thickness instead of sinking to
 * its mid-surface.
 */
const SEAM_CONTACT_RADIUS = 0.02;

/**
 * Half-thickness at a hem for cloth-on-cloth, in metres.
 *
 * The old solver-wide `SELF_RADIUS`, kept as the minimum so a seam-to-seam
 * contact behaves exactly as it did before. Away from the seam the radius grows
 * to the garment's real half-thickness, which is what stops a full bin from
 * rendering as one merged mass now that the cloth has volume.
 */
const SEAM_SELF_RADIUS = 0.032;

/**
 * Loft at the hem as a fraction of the garment's peak thickness.
 *
 * Not zero. Tapering all the way to nothing would let the front and back sheets
 * meet at a knife edge, and any triangle whose three corners all sat on the
 * boundary — a one-cell-wide sleeve tip, for instance — would collapse onto its
 * own mirror image and z-fight. A hem with a little body in it is both the
 * honest shape and the robust one.
 */
const HEM_LOFT = 0.35;

/** The mid-surface a shell is derived from. */
export interface ShellSource {
  count: number;
  cols: number;
  rows: number;
  /** Grid slot → particle index, or -1 where the pattern mask cut it away. */
  slotToParticle: Int32Array;
  particleCol: Int32Array;
  particleRow: Int32Array;
  /** Mid-surface triangles, consistently wound. */
  indices: Uint16Array;
  /** `2 * count` mid-surface UVs. */
  uvs: Float32Array;
  /** Peak half-thickness, in metres. */
  thickness: number;
}

export interface ShellTopology {
  /** Peak half-thickness, in metres. */
  thickness: number;
  /**
   * Per-particle loft, `HEM_LOFT` at the seam rising to 1 at the fattest part
   * of the piece. `count` entries.
   */
  loft: Float32Array;

  /** Vertices in the render mesh — front sheet, then back sheet. */
  vertexCount: number;
  /** Shell vertex → the mid-surface particle it is offset from. `vertexCount`. */
  particle: Int32Array;
  /**
   * Signed displacement of each shell vertex along the mid-surface normal, in
   * metres: positive on the front sheet, negative on the back. `vertexCount`.
   */
  offset: Float32Array;
  /** Front sheet, reversed back sheet, and the rim that stitches them. */
  indices: Uint16Array;
  /** `2 * vertexCount`. Both sheets carry the mid-surface UVs. */
  uvs: Float32Array;

  /** Arena contact half-thickness per particle, metres. `count`. */
  contactPad: Float32Array;
  /** Cloth-on-cloth contact radius per particle, metres. `count`. */
  selfRadius: Float32Array;
  /** Largest entry of `contactPad` — the solver broadphases with this. */
  maxContactPad: number;
  /** Largest entry of `selfRadius` — sets the spatial-hash cell size. */
  maxSelfRadius: number;
}

/**
 * Build the shell for one cut pattern. Called once per garment kind at module
 * load; every instance of that kind shares the result.
 */
export function buildShell(src: ShellSource): ShellTopology {
  const { count, indices, uvs, thickness } = src;

  const seam = boundaryEdges(indices, count);
  const loft = buildLoftProfile(src, seam);

  // ── Vertices ────────────────────────────────────────────────────────────
  // Front sheet occupies [0, count), back sheet [count, 2 * count), so the back
  // copy of particle `p` is always `p + count`. Keeping the mapping arithmetic
  // rather than tabulated is what makes the index arrays below readable.
  const vertexCount = count * 2;
  const particle = new Int32Array(vertexCount);
  const offset = new Float32Array(vertexCount);
  const shellUvs = new Float32Array(vertexCount * 2);

  for (let p = 0; p < count; p++) {
    const lift = thickness * loft[p];
    particle[p] = p;
    particle[p + count] = p;
    offset[p] = lift;
    offset[p + count] = -lift;
    shellUvs[p * 2] = uvs[p * 2];
    shellUvs[p * 2 + 1] = uvs[p * 2 + 1];
    shellUvs[(p + count) * 2] = uvs[p * 2];
    shellUvs[(p + count) * 2 + 1] = uvs[p * 2 + 1];
  }

  // ── Triangles ───────────────────────────────────────────────────────────
  const shellIndices: number[] = [];
  const triangles = indices.length / 3;

  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    // Front keeps the mid-surface winding; back reverses it, so both sheets
    // face outward and the shell is a closed, consistently oriented solid.
    shellIndices.push(a, b, c);
    shellIndices.push(a + count, c + count, b + count);
  }

  // The rim. For a directed boundary edge a→b — the direction it appears in
  // the one triangle that owns it — these two triangles wind outward; see the
  // derivation in the test file.
  for (const [a, b] of seam) {
    shellIndices.push(a, a + count, b + count);
    shellIndices.push(a, b + count, b);
  }

  // ── Collision radii ─────────────────────────────────────────────────────
  const contactPad = new Float32Array(count);
  const selfRadius = new Float32Array(count);
  let maxContactPad = 0;
  let maxSelfRadius = 0;
  for (let p = 0; p < count; p++) {
    const half = thickness * loft[p];
    contactPad[p] = SEAM_CONTACT_RADIUS + half;
    // Not additive: two garments meeting seam-to-seam should behave exactly as
    // they did before the cloth had volume, and away from the seam the real
    // half-thickness is already the right answer.
    selfRadius[p] = Math.max(SEAM_SELF_RADIUS, half);
    if (contactPad[p] > maxContactPad) maxContactPad = contactPad[p];
    if (selfRadius[p] > maxSelfRadius) maxSelfRadius = selfRadius[p];
  }

  return {
    thickness,
    loft,
    vertexCount,
    particle,
    offset,
    indices: Uint16Array.from(shellIndices),
    uvs: shellUvs,
    contactPad,
    selfRadius,
    maxContactPad,
    maxSelfRadius,
  };
}

/**
 * How far each particle sits from the nearest open edge, shaped into a loft
 * curve.
 *
 * Breadth-first over the lattice from every seam particle, so "depth into the
 * fabric" is measured in weave steps rather than in metres — a sleeve three
 * columns wide is shallow no matter what its spacing is, and comes out slimmer
 * than the torso beside it. That per-piece variation is most of what makes the
 * result read as a garment instead of a pillow.
 */
function buildLoftProfile(src: ShellSource, seam: ReadonlyArray<[number, number]>): Float32Array {
  const { count, cols, rows, slotToParticle, particleCol, particleRow, indices } = src;

  const depth = new Int32Array(count).fill(-1);
  // A queue of particle indices, used as a ring-free FIFO via a read cursor —
  // BFS over at most a few dozen nodes, built once at module load.
  const queue = new Int32Array(count);
  let tail = 0;

  const onSeam = new Uint8Array(count);
  for (const [a, b] of seam) {
    onSeam[a] = 1;
    onSeam[b] = 1;
  }
  // A particle no triangle uses renders nothing, but it still needs a finite
  // depth so the loop below terminates with a defined value everywhere.
  const used = new Uint8Array(count);
  for (const index of indices) used[index] = 1;
  for (let p = 0; p < count; p++) if (!used[p]) onSeam[p] = 1;

  for (let p = 0; p < count; p++) {
    if (!onSeam[p]) continue;
    depth[p] = 0;
    queue[tail++] = p;
  }

  let head = 0;
  let deepest = 0;
  while (head < tail) {
    const p = queue[head++];
    const c = particleCol[p];
    const r = particleRow[p];
    const next = depth[p] + 1;
    // Four-connected: the diagonal neighbours are a shear relationship, not a
    // step through the weave, and counting them makes corners read as deep.
    for (let side = 0; side < 4; side++) {
      const nc = c + (side === 0 ? -1 : side === 1 ? 1 : 0);
      const nr = r + (side === 2 ? -1 : side === 3 ? 1 : 0);
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const q = slotToParticle[nr * cols + nc];
      if (q < 0 || depth[q] >= 0) continue;
      depth[q] = next;
      if (next > deepest) deepest = next;
      queue[tail++] = q;
    }
  }

  const span = Math.max(1, deepest);
  const loft = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const t = Math.min(Math.max(depth[p], 0) / span, 1);
    // A sine ramp rather than a linear one: it leaves the seam quickly (so the
    // hem is a rolled edge, not a wedge) and flattens out across the body.
    loft[p] = HEM_LOFT + (1 - HEM_LOFT) * Math.sin(t * (Math.PI / 2));
  }
  return loft;
}

/**
 * Directed edges used by exactly one triangle — the open boundary of the
 * mid-surface, in the winding the surface gives it.
 */
function boundaryEdges(indices: Uint16Array, count: number): Array<[number, number]> {
  // Keyed on the unordered pair; the value keeps the direction of the first
  // sighting and a flag for having seen the pair twice.
  const seen = new Map<number, { a: number; b: number; twice: boolean }>();
  const triangles = indices.length / 3;

  for (let t = 0; t < triangles; t++) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t * 3 + e];
      const b = indices[t * 3 + ((e + 1) % 3)];
      const key = a < b ? a * count + b : b * count + a;
      const hit = seen.get(key);
      if (hit) hit.twice = true;
      else seen.set(key, { a, b, twice: false });
    }
  }

  const out: Array<[number, number]> = [];
  for (const edge of seen.values()) if (!edge.twice) out.push([edge.a, edge.b]);
  return out;
}

// ─── Per-frame ──────────────────────────────────────────────────────────────

/**
 * Scratch for the mid-surface normals, grown to the largest pattern on first
 * use and reused forever after.
 *
 * Module-level rather than per-garment because every cloth writes its shell
 * inside the same synchronous frame callback, one at a time — and because a
 * per-frame allocation at 60 Hz across a dozen garments is a per-frame GC
 * pause, which is the one thing a physics game cannot afford.
 */
let normalScratch = new Float32Array(0);

/**
 * Inflate a simulated mid-surface into its shell, positions and normals both.
 *
 * Normals are recomputed rather than derived from the mid-surface, because the
 * rim is where the volume is legible: a hem lit as if it were part of the front
 * sheet gives the whole illusion away. Doing it here rather than through
 * `BufferGeometry.computeVertexNormals` also keeps the frame allocation-free —
 * three.js allocates a handful of `Vector3`s on every call to that.
 *
 * @param shell        Topology from {@link buildShell}.
 * @param midIndices   The mid-surface triangles the shell was derived from.
 * @param pos          Live particle positions, `3 * count`.
 * @param outPositions Shell position attribute, `3 * shell.vertexCount`.
 * @param outNormals   Shell normal attribute, same length.
 */
export function writeShell(
  shell: ShellTopology,
  midIndices: Uint16Array,
  pos: Float32Array,
  outPositions: Float32Array,
  outNormals: Float32Array,
): void {
  const count = pos.length / 3;
  if (normalScratch.length < count * 3) normalScratch = new Float32Array(count * 3);
  const mid = normalScratch;

  accumulateNormals(midIndices, pos, mid, count);

  const { vertexCount, particle, offset } = shell;
  for (let v = 0; v < vertexCount; v++) {
    const p = particle[v] * 3;
    const lift = offset[v];
    const o = v * 3;
    outPositions[o] = pos[p] + mid[p] * lift;
    outPositions[o + 1] = pos[p + 1] + mid[p + 1] * lift;
    outPositions[o + 2] = pos[p + 2] + mid[p + 2] * lift;
  }

  accumulateNormals(shell.indices, outPositions, outNormals, vertexCount);
}

/** Area-weighted vertex normals: sum the face cross products, then normalise. */
function accumulateNormals(
  indices: Uint16Array,
  positions: Float32Array,
  out: Float32Array,
  vertexCount: number,
): void {
  const n = vertexCount * 3;
  out.fill(0, 0, n);

  const triangles = indices.length / 3;
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;

    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];

    // Left unnormalised on purpose — the magnitude is twice the triangle area,
    // which weights big faces over slivers and is what keeps a crumpled
    // garment's shading smooth.
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;

    out[a] += fx;
    out[a + 1] += fy;
    out[a + 2] += fz;
    out[b] += fx;
    out[b + 1] += fy;
    out[b + 2] += fz;
    out[c] += fx;
    out[c + 1] += fy;
    out[c + 2] += fz;
  }

  for (let i = 0; i < n; i += 3) {
    const x = out[i];
    const y = out[i + 1];
    const z = out[i + 2];
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length < 1e-12) {
      // Degenerate fan — no orientation to recover. Any unit vector will do;
      // picking one keeps the shader from dividing by zero.
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 1;
      continue;
    }
    const inv = 1 / length;
    out[i] = x * inv;
    out[i + 1] = y * inv;
    out[i + 2] = z * inv;
  }
}
