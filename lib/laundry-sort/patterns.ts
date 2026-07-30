/**
 * Laundry Sort — garment cut patterns.
 *
 * A garment is a **masked grid**: a `cols × rows` lattice of particles with a
 * boolean mask that cuts the silhouette out of it, exactly the way a real
 * pattern piece is cut from a bolt of cloth. Doing it this way buys three
 * things at once:
 *
 * - Constraint generation is mechanical (structural / shear / bending all fall
 *   out of grid adjacency), so a new garment is a mask literal, not new solver
 *   code.
 * - Triangulation is mechanical too: any grid cell whose four corners survived
 *   the mask becomes two triangles.
 * - The resolution is **fixed and identical on every device**, which is what
 *   makes a race fair. Render quality varies by tier; the lattice never does.
 *
 * Topology is precomputed once per kind at module load and shared by every
 * instance — only the particle positions are per-garment.
 */

export type GarmentKind = 'shirt' | 'pants' | 'towel' | 'sock';

export const GARMENT_KINDS: readonly GarmentKind[] = ['shirt', 'pants', 'towel', 'sock'];

/** `1` = fabric, `0` = cut away. Written row-major, top row first. */
interface PatternSource {
  cols: number;
  rows: number;
  /** Rest distance between orthogonally adjacent particles, in metres. */
  spacing: number;
  /**
   * Aerodynamic drag per particle. A towel has more sail than a sock, so it
   * planes and flutters on the way down instead of dropping like a stone.
   */
  drag: number;
  rows_: string[];
}

/**
 * The cut patterns.
 *
 * These are drawn to be recognisable *in flight*, at the size and distance the
 * locked camera puts them at — which is a much harder constraint than looking
 * right laid flat. Three things do the work:
 *
 *  - **Enough lattice to have a silhouette.** A shirt made of a 5-wide body and
 *    two 1-wide stubs reads as a plus sign once it tumbles. Nine columns give
 *    the sleeves a shoulder, a taper and a cuff, so the shape survives rotation.
 *  - **A hole where the garment has one.** The collar gap on the shirt's top
 *    row and the split between the trouser legs are real gaps in the mesh, so
 *    they stay legible from any angle instead of relying on printed detail.
 *  - **Size relative to the bins.** A garment is roughly three-quarters of a bin
 *    opening. Smaller than that and it reads as confetti at this camera.
 */
const SOURCES: Record<GarmentKind, PatternSource> = {
  // T-shirt: collar notch, square shoulders, sleeves that taper to a cuff.
  shirt: {
    cols: 9,
    rows: 7,
    spacing: 0.17,
    drag: 1.15,
    rows_: [
      '..XX.XX..',
      'XXXXXXXXX',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..XXXXX..',
      '..XXXXX..',
      '..XXXXX..',
    ],
  },
  // Trousers: waistband across the top, two legs below a real crotch gap.
  pants: {
    cols: 7,
    rows: 8,
    spacing: 0.15,
    drag: 0.95,
    rows_: ['XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXX.XXX', 'XXX.XXX', 'XXX.XXX', 'XXX.XXX', 'XXX.XXX'],
  },
  // A plain rectangle — the most sail, the most flutter, the easiest to catch.
  towel: {
    cols: 6,
    rows: 7,
    spacing: 0.2,
    drag: 1.45,
    rows_: ['XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX'],
  },
  // Sock: an L — a cuff dropping into a foot. Small, dense, barely catches the
  // air, and the hardest thing in the game to grab out of a crowded frame.
  sock: {
    cols: 5,
    rows: 6,
    spacing: 0.12,
    drag: 0.6,
    rows_: ['XXX..', 'XXX..', 'XXX..', 'XXX..', 'XXXXX', 'XXXXX'],
  },
};

/** One end of a constraint pair, plus the compliance class it belongs to. */
export interface PatternTopology {
  kind: GarmentKind;
  cols: number;
  rows: number;
  spacing: number;
  drag: number;
  /** Number of surviving particles. */
  count: number;
  /** Grid slot → particle index, or -1 where the mask cut it away. */
  slotToParticle: Int32Array;
  /** Particle index → grid column / row (used to skip self-collision on neighbours). */
  particleCol: Int32Array;
  particleRow: Int32Array;
  /** Rest positions in the garment's own frame, centred on the origin. `3 * count`. */
  restPositions: Float32Array;
  /** Interleaved `[a, b, a, b, …]` particle indices. */
  structural: Int32Array;
  shear: Int32Array;
  bending: Int32Array;
  /** Rest lengths, one per pair, aligned with the arrays above. */
  structuralRest: Float32Array;
  shearRest: Float32Array;
  bendingRest: Float32Array;
  /** Triangle indices for the render mesh. */
  indices: Uint16Array;
  /** `2 * count` UVs so the weave texture tiles across the cut piece. */
  uvs: Float32Array;
  /**
   * `cos`/`sin` of each particle's fixed phase in the flutter wave, where the
   * phase is a smooth function of its position in the lattice.
   *
   * Keyed on the grid coordinates rather than the particle index on purpose. An
   * index-keyed phase alternates between neighbours, and the structural
   * constraints — which are rigid — cancel opposing pushes on adjacent
   * particles almost exactly, so the fabric barely moves. A low spatial
   * frequency makes the ripple a travelling wave the cloth can actually follow.
   */
  ripplePhaseCos: Float32Array;
  ripplePhaseSin: Float32Array;
  /** Largest rest dimension — used for spawn spacing and broadphase bounds. */
  extent: number;
}

function buildTopology(kind: GarmentKind, src: PatternSource): PatternTopology {
  const { cols, rows, spacing, drag } = src;

  const active: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    const line = src.rows_[r];
    for (let c = 0; c < cols; c++) active.push(line[c] === 'X');
  }

  const slotToParticle = new Int32Array(cols * rows).fill(-1);
  const cell = (c: number, r: number) => r * cols + c;

  let count = 0;
  for (let i = 0; i < active.length; i++) if (active[i]) slotToParticle[i] = count++;

  const particleCol = new Int32Array(count);
  const particleRow = new Int32Array(count);
  const restPositions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);

  // Centre the piece on its own origin so spawn transforms are about the middle
  // of the garment rather than a corner.
  const halfW = ((cols - 1) * spacing) / 2;
  const halfH = ((rows - 1) * spacing) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = slotToParticle[cell(c, r)];
      if (p < 0) continue;
      particleCol[p] = c;
      particleRow[p] = r;
      restPositions[p * 3] = c * spacing - halfW;
      // Row 0 is the top of the pattern, so it maps to +y.
      restPositions[p * 3 + 1] = halfH - r * spacing;
      restPositions[p * 3 + 2] = 0;
      uvs[p * 2] = cols > 1 ? c / (cols - 1) : 0;
      uvs[p * 2 + 1] = rows > 1 ? 1 - r / (rows - 1) : 0;
    }
  }

  const ripplePhaseCos = new Float32Array(count);
  const ripplePhaseSin = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const phase = particleCol[p] * 0.85 + particleRow[p] * 0.55;
    ripplePhaseCos[p] = Math.cos(phase);
    ripplePhaseSin[p] = Math.sin(phase);
  }

  const structural: number[] = [];
  const shear: number[] = [];
  const bending: number[] = [];

  const pairIfBoth = (into: number[], c0: number, r0: number, c1: number, r1: number) => {
    if (c1 < 0 || c1 >= cols || r1 < 0 || r1 >= rows) return;
    const a = slotToParticle[cell(c0, r0)];
    const b = slotToParticle[cell(c1, r1)];
    if (a < 0 || b < 0) return;
    into.push(a, b);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (slotToParticle[cell(c, r)] < 0) continue;
      // Structural — resists stretch. Effectively inextensible.
      pairIfBoth(structural, c, r, c + 1, r);
      pairIfBoth(structural, c, r, c, r + 1);
      // Shear — resists the diagonal collapse that turns cloth into noodles.
      pairIfBoth(shear, c, r, c + 1, r + 1);
      pairIfBoth(shear, c + 1, r, c, r + 1);
      // Bending — two apart, deliberately soft, so folds and drape happen.
      pairIfBoth(bending, c, r, c + 2, r);
      pairIfBoth(bending, c, r, c, r + 2);
    }
  }

  const restFor = (pairs: number[]): Float32Array => {
    const out = new Float32Array(pairs.length / 2);
    for (let i = 0; i < out.length; i++) {
      const a = pairs[i * 2];
      const b = pairs[i * 2 + 1];
      const dx = restPositions[a * 3] - restPositions[b * 3];
      const dy = restPositions[a * 3 + 1] - restPositions[b * 3 + 1];
      out[i] = Math.hypot(dx, dy);
    }
    return out;
  };

  // A quad becomes two triangles only when all four corners survived the mask.
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = slotToParticle[cell(c, r)];
      const tr = slotToParticle[cell(c + 1, r)];
      const bl = slotToParticle[cell(c, r + 1)];
      const br = slotToParticle[cell(c + 1, r + 1)];
      if (tl < 0 || tr < 0 || bl < 0 || br < 0) continue;
      indices.push(tl, bl, tr, tr, bl, br);
    }
  }

  return {
    kind,
    cols,
    rows,
    spacing,
    drag,
    count,
    slotToParticle,
    particleCol,
    particleRow,
    restPositions,
    structural: Int32Array.from(structural),
    shear: Int32Array.from(shear),
    bending: Int32Array.from(bending),
    structuralRest: restFor(structural),
    shearRest: restFor(shear),
    bendingRest: restFor(bending),
    indices: Uint16Array.from(indices),
    uvs,
    ripplePhaseCos,
    ripplePhaseSin,
    extent: Math.max((cols - 1) * spacing, (rows - 1) * spacing),
  };
}

/** Topology per kind, built once. Instances share it; only positions differ. */
export const PATTERNS: Record<GarmentKind, PatternTopology> = {
  shirt: buildTopology('shirt', SOURCES.shirt),
  pants: buildTopology('pants', SOURCES.pants),
  towel: buildTopology('towel', SOURCES.towel),
  sock: buildTopology('sock', SOURCES.sock),
};

/** Total particles if one of every kind were in the air at once. */
export const PARTICLES_PER_KIND: Record<GarmentKind, number> = {
  shirt: PATTERNS.shirt.count,
  pants: PATTERNS.pants.count,
  towel: PATTERNS.towel.count,
  sock: PATTERNS.sock.count,
};
