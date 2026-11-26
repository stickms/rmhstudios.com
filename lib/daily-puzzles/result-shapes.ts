/**
 * Readers for the `resultJson` a daily puzzle stores next to its score.
 *
 * The score route accepts a score with no result (older clients send none), so
 * the stored field can be `null`, `{}` or something a newer build wrote. A
 * board never trusts it: it reads it through the mode's reader, which returns a
 * well-formed result with safe defaults, and asks `has<Mode>Result` whether
 * there was anything to replay at all. A score with nothing to replay opens the
 * "played on another device" result: score and time only.
 */

type Rec = Record<string, unknown>;

function isRec(raw: unknown): raw is Rec {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [];
}

function bool(v: unknown): boolean {
  return v === true;
}

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/* ── Alibi ─────────────────────────────────────────────────────────────────── */

export interface AlibiResult {
  guesses: string[];
  solved: boolean;
  failed: boolean;
}

export function hasAlibiResult(raw: unknown): boolean {
  return isRec(raw) && Array.isArray(raw.guesses);
}

export function readAlibiResult(raw: unknown): AlibiResult {
  const r = isRec(raw) ? raw : {};
  return { guesses: strings(r.guesses), solved: bool(r.solved), failed: bool(r.failed) };
}

/* ── Chainlink ─────────────────────────────────────────────────────────────── */

export interface ChainlinkResult {
  chain: string[];
  completed: boolean;
  gaveUp: boolean;
}

export function hasChainlinkResult(raw: unknown): boolean {
  return isRec(raw) && Array.isArray(raw.chain);
}

export function readChainlinkResult(raw: unknown): ChainlinkResult {
  const r = isRec(raw) ? raw : {};
  const chain = strings(r.chain);
  return { chain: chain.length > 0 ? chain : [''], completed: bool(r.completed), gaveUp: bool(r.gaveUp) };
}

/* ── Outcast ───────────────────────────────────────────────────────────────── */

export interface OutcastResult {
  correctRounds: boolean[];
  selectedNames: string[];
}

export function hasOutcastResult(raw: unknown): boolean {
  return isRec(raw) && Array.isArray(raw.correctRounds);
}

export function readOutcastResult(raw: unknown): OutcastResult {
  const r = isRec(raw) ? raw : {};
  const rounds = Array.isArray(r.correctRounds) ? r.correctRounds.map((x) => x === true) : [];
  return { correctRounds: rounds, selectedNames: strings(r.selectedNames) };
}

/* ── Spectrum ──────────────────────────────────────────────────────────────── */

export interface SpectrumItemScore {
  name: string;
  playerRank: number;
  trueRank: number;
  score: number;
}

export interface SpectrumResult {
  accuracy: number;
  points: number;
  itemScores: SpectrumItemScore[];
}

export function hasSpectrumResult(raw: unknown): boolean {
  return (
    isRec(raw) && Array.isArray(raw.itemScores) && raw.itemScores.some((s) => isRec(s) && typeof s.name === 'string')
  );
}

export function readSpectrumResult(raw: unknown): SpectrumResult {
  const r = isRec(raw) ? raw : {};
  const itemScores: SpectrumItemScore[] = [];
  if (Array.isArray(r.itemScores)) {
    for (const s of r.itemScores) {
      if (!isRec(s) || typeof s.name !== 'string') continue;
      itemScores.push({
        name: s.name,
        playerRank: finite(s.playerRank) ?? 0,
        trueRank: finite(s.trueRank) ?? 0,
        score: finite(s.score) ?? 0,
      });
    }
  }
  return {
    accuracy: finite(r.accuracy) ?? itemScores.reduce((sum, s) => sum + s.score, 0),
    points: finite(r.points) ?? 0,
    itemScores,
  };
}

/* ── Impostor ──────────────────────────────────────────────────────────────── */

export interface ImpostorResult {
  foundFakes: string[];
  guessNumber: 1 | 2;
  confirmedReal: number[];
}

export function hasImpostorResult(raw: unknown): boolean {
  return isRec(raw) && Array.isArray(raw.foundFakes);
}

export function readImpostorResult(raw: unknown): ImpostorResult {
  const r = isRec(raw) ? raw : {};
  return {
    foundFakes: strings(r.foundFakes),
    guessNumber: r.guessNumber === 1 ? 1 : 2,
    confirmedReal: numbers(r.confirmedReal),
  };
}

/* ── Lights Out and GlobeSet (the hub, the stats rows and their own boards) ── */

export interface LightsOutResult {
  moves?: number;
  dnf: boolean;
  hintUsed: boolean;
  optimalMoves?: number;
}

export function readLightsOutResult(raw: unknown): LightsOutResult {
  const r = isRec(raw) ? raw : {};
  return {
    moves: finite(r.moves),
    dnf: bool(r.dnf),
    hintUsed: bool(r.hintUsed),
    optimalMoves: finite(r.optimalMoves),
  };
}

export interface GlobeSetResult {
  sizes?: number[];
  misses: number;
  hints: number;
  solverUsed: boolean;
  solverFrom?: number;
}

export function readGlobeSetResult(raw: unknown): GlobeSetResult {
  const r = isRec(raw) ? raw : {};
  return {
    sizes: Array.isArray(r.sizes) ? numbers(r.sizes) : undefined,
    misses: finite(r.misses) ?? 0,
    hints: finite(r.hints) ?? 0,
    solverUsed: bool(r.solverUsed),
    solverFrom: finite(r.solverFrom),
  };
}
