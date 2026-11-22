/**
 * Build the sampled instruments RMH Music plays (`INSTRUMENT_IDS`: piano, two guitars, ukulele,
 * organ, violin, cello, flute, clarinet, oboe) from pinned upstream recordings. Run by a developer,
 * never in CI:
 *
 *   pnpm exec tsx scripts/rmhmusic/build-instruments.ts [<id> ...] [--pin]
 *
 * Needs `ffmpeg` with libmp3lame, and `unar` (The Unarchiver) for the archives: the steel guitar's
 * RAR5 and the FreePats 7z banks (nylon guitar, ukulele). Sources come from `sources.json`:
 * commit-pinned raw.githubusercontent.com URLs (Salamander, VSCO 2 CE, VCSL), the steel guitar
 * author's Google Drive RAR and the FreePats archives. Every file is checked
 * against its SHA-256 before use (`--pin` fills in a missing hash once and writes it back; a hash
 * that is present and different always fails). Downloads are cached in `scripts/rmhmusic/.cache/`
 * (gitignored).
 *
 * Per zone: optional pitch restore (the guitar's per-fret samples are stored at the open string's
 * pitch: `asetrate = sourceRate * 2^(fret/12)`, then `aresample=44100`), trim the pre-roll, cut to
 * `durationS` with a `fadeS` fade, mono 44.1 kHz CBR 64 kbps MP3 (bit-exact flags, no metadata).
 * Then the ENCODED file is decoded and measured, so the check is on what ships:
 *   - pitch with the app's own YIN (`lib/rmhmusic/learn/pitch/yin.ts`), median over the sustain;
 *     the build FAILS when it is `pitchToleranceSemitones` or more from `keyCenter` (VSCO wind
 *     file names are an octave low, so a wrong map fails here, never ships);
 *   - tuning: what the zone sounds at its key centre after its `tuneCents` correction must be
 *     within RESIDUAL_CENTS (10) of that key;
 *   - loudness: RMS over the first second and the peak give `gainDb` (target RMS, peak ceiling);
 *   - zero-byte sources or outputs fail.
 * Downloads land in a temp file and are renamed into the cache only once their SHA-256 matches.
 * Every run (and `--credits` alone, which needs no ffmpeg) also writes
 * `public/music/rmhmusic/instruments/CREDITS.txt` from `credits.ts`.
 * Writes `public/music/rmhmusic/instruments/<id>/<midi>.mp3` and the generated
 * `lib/rmhmusic/learn/audio/instruments/zones-data.ts` (zones, durations, SHA-256s). Instruments
 * not named on the command line keep their existing generated entries.
 */
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { CREDITS_FILE, creditsText } from '../../lib/rmhmusic/learn/audio/instruments/credits';
import { INSTRUMENT_IDS, type InstrumentId } from '../../lib/rmhmusic/learn/audio/instruments/types';
import { detectPitch } from '../../lib/rmhmusic/learn/pitch/yin';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const CACHE = join(HERE, '.cache');
const SOURCES = join(HERE, 'sources.json');
const OUT_DIR = join(ROOT, 'public/music/rmhmusic/instruments');
const ZONES_TS = join(ROOT, 'lib/rmhmusic/learn/audio/instruments/zones-data.ts');
const CREDITS_TXT = join(ROOT, 'public', CREDITS_FILE);
/** The most a zone may sound from its key centre after its tuning correction (cents). */
const RESIDUAL_CENTS = 10;
const IDS = INSTRUMENT_IDS;
type Id = InstrumentId;
const RATE = 44100;

interface SourceZone {
  src?: string;
  member?: string;
  sha256: string;
  keyCenter: number;
  tuneCents?: number;
  durationS: number;
  fadeS: number;
  out: string;
  restore?: {
    sourceRate: number;
    fret: number;
  };
}
interface SourceInstrument {
  archive?: {
    url: string;
    file: string;
    sha256: string;
  };
  zones: SourceZone[];
}
interface Sources {
  encode: {
    bitrateKbps: number;
    sampleRate: number;
    channels: number;
    targetRmsDb: number;
    peakCeilingDb: number;
  };
  pitchToleranceSemitones: number;
  instruments: Record<Id, SourceInstrument>;
}
interface BuiltZone {
  file: string;
  keyCenter: number;
  tuneCents: number;
  gainDb: number;
  startOffsetS: number;
  durationS: number;
  sha256: string;
  bytes: number;
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

function fail(msg: string): never {
  console.error(`build-instruments: ${msg}`);
  process.exit(1);
}

/** Progress on stdout (a developer's terminal; this script never runs in a bundle or in CI). */
function report(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * The cached copy of `url` at `to`, checked against its pinned SHA-256 (or, with --pin, recorded).
 * A download (or a developer's local copy, `local`) lands in a temp file first and is renamed into
 * the cache only once its hash matches, so an interrupted or wrong download never poisons the cache.
 * Returns the hash.
 */
async function fetchVerified(
  url: string,
  to: string,
  expected: string,
  label: string,
  pin: boolean,
  local?: string,
): Promise<string> {
  if (existsSync(to) && statSync(to).size > 0) return verify(to, expected, label, pin);
  mkdirSync(dirname(to), {
    recursive: true,
  });
  const part = `${to}.part-${process.pid}`;
  try {
    if (local && existsSync(local)) copyFileSync(local, part);
    else {
      const res = await fetch(url, {
        redirect: 'follow',
      });
      if (!res.ok) fail(`download ${url}: HTTP ${res.status}`);
      writeFileSync(part, Buffer.from(await res.arrayBuffer()));
    }
    const got = verify(part, expected, label, pin);
    renameSync(part, to);
    return got;
  } finally {
    rmSync(part, {
      force: true,
    });
  }
}

/** Check (or with --pin, record) a file's SHA-256. Returns the hash. */
function verify(path: string, expected: string, label: string, pin: boolean): string {
  const buf = readFileSync(path);
  if (buf.length === 0) fail(`${label}: zero-byte file`);
  const got = sha256(buf);
  if (!expected) {
    if (!pin) fail(`${label}: no sha256 pinned in sources.json (run once with --pin)`);
    return got;
  }
  if (got !== expected) fail(`${label}: sha256 ${got} != pinned ${expected}`);
  return got;
}

async function decodeF32(path: string): Promise<Float32Array> {
  return new Promise((ok, bad) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-']);
    const chunks: Buffer[] = [];
    p.stdout.on('data', (c: Buffer) => chunks.push(c));
    p.on('error', bad);
    p.on('close', (code) => {
      if (code !== 0) return bad(new Error(`ffmpeg decode ${path} exited ${code}`));
      const buf = Buffer.concat(chunks);
      ok(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
    });
  });
}

/** Median YIN pitch (fractional MIDI) over the sustain, or null when no frame is clear. */
export function measurePitch(pcm: Float32Array, rate: number): number | null {
  const frame = 4096;
  const midis: number[] = [];
  for (let t = 0.15; t <= 1.0; t += 0.05) {
    const start = Math.floor(t * rate);
    if (start + frame > pcm.length) break;
    const r = detectPitch(pcm.subarray(start, start + frame), rate, {
      minFreq: 50,
      maxFreq: 2600,
      minRms: 0.001,
    });
    if (r && r.clarity >= 0.8) midis.push(69 + 12 * Math.log2(r.freq / 440));
  }
  if (midis.length < 3) return null;
  midis.sort((a, b) => a - b);
  return midis[Math.floor(midis.length / 2)];
}

function levels(
  pcm: Float32Array,
  rate: number,
): {
  rmsDb: number;
  peakDb: number;
} {
  let sum = 0;
  const n = Math.min(pcm.length, rate);
  for (let i = 0; i < n; i++) sum += pcm[i] * pcm[i];
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  return {
    rmsDb: 10 * Math.log10(sum / Math.max(1, n) + 1e-20),
    peakDb: 20 * Math.log10(peak + 1e-20),
  };
}

async function sourceFile(id: Id, inst: SourceInstrument, z: SourceZone, pin: boolean): Promise<string> {
  if (z.src) {
    const name = decodeURIComponent(z.src.split('/').pop() ?? '');
    const path = join(CACHE, id, name);
    z.sha256 = await fetchVerified(z.src, path, z.sha256, `${id} ${name}`, pin);
    return path;
  }
  if (!inst.archive || !z.member) fail(`${id} ${z.out}: neither src nor archive member`);
  const path = join(CACHE, id, 'x', z.member);
  if (!existsSync(path)) fail(`${id}: ${z.member} missing after extraction`);
  z.sha256 = verify(path, z.sha256, `${id} ${z.member}`, pin);
  return path;
}

async function extractArchive(id: Id, inst: SourceInstrument, pin: boolean): Promise<void> {
  const a = inst.archive;
  if (!a) return;
  const path = join(CACHE, id, a.file);
  // A developer may already hold the 241 MB archive; RMHMUSIC_ARCHIVE_DIR points at it.
  const local = process.env.RMHMUSIC_ARCHIVE_DIR && join(process.env.RMHMUSIC_ARCHIVE_DIR, a.file);
  a.sha256 = await fetchVerified(a.url, path, a.sha256, `${id} ${a.file}`, pin, local || undefined);
  const members = inst.zones.map((z) => z.member!).filter((m) => !existsSync(join(CACHE, id, 'x', m)));
  if (members.length === 0) return;
  // unar can fail on entries we do not use (the ukulele bank's chuck.wav fails its CRC); its
  // error is printed here, and the check on each member we use, after this, decides.
  await run('unar', ['-q', '-f', '-D', '-o', join(CACHE, id, 'x'), path, ...members]).catch(
    (
      e: Error & {
        stderr?: string;
      },
    ) => {
      console.error(`build-instruments: unar on ${id} reported: ${(e.stderr || e.message).trim()}`);
    },
  );
}

async function buildZone(
  id: Id,
  inst: SourceInstrument,
  z: SourceZone,
  enc: Sources['encode'],
  tol: number,
  pin: boolean,
): Promise<BuiltZone> {
  const src = await sourceFile(id, inst, z, pin);
  const out = join(OUT_DIR, id, z.out);
  mkdirSync(dirname(out), {
    recursive: true,
  });
  const filters: string[] = [];
  if (z.restore) {
    filters.push(`asetrate=${(z.restore.sourceRate * 2 ** (z.restore.fret / 12)).toFixed(3)}`, `aresample=${RATE}`);
  }
  filters.push(
    'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.002',
    `atrim=0:${z.durationS}`,
    `afade=t=out:st=${(z.durationS - z.fadeS).toFixed(3)}:d=${z.fadeS}`,
  );
  const encode = (extra: string[]) =>
    run('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      src,
      '-af',
      [...filters, ...extra].join(','),
      '-ac',
      String(enc.channels),
      '-ar',
      String(enc.sampleRate),
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${enc.bitrateKbps}k`,
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      out,
    ]);
  // Pass 1 measures; pass 2 bakes the loudness trim into the file, so a quiet recording is not
  // encoded at -50 dBFS and lifted (with its MP3 noise) at play time. `gainDb` keeps the residue.
  await encode([]);
  const first = levels(await decodeF32(out), RATE);
  const bake = Math.round(Math.min(enc.targetRmsDb - first.rmsDb, enc.peakCeilingDb - first.peakDb) * 10) / 10;
  await encode([`volume=${bake}dB`]);
  const bytes = readFileSync(out);
  if (bytes.length === 0) fail(`${id} ${z.out}: encoded file is empty`);
  const pcm = await decodeF32(out);
  const midi = measurePitch(pcm, RATE);
  if (midi === null) fail(`${id} ${z.out}: no clear pitch in the encoded file`);
  let tuneCents: number;
  let dev: number;
  if (typeof z.tuneCents === 'number') {
    // Upstream table: the sample sounds keyCenter - tuneCents/100 and is played tuneCents sharper.
    tuneCents = z.tuneCents;
    dev = midi + tuneCents / 100 - z.keyCenter;
  } else {
    dev = midi - z.keyCenter;
    tuneCents = Math.round(-dev * 100);
  }
  if (Math.abs(dev) >= tol) {
    const octave = Math.abs(Math.round(dev / 12)) >= 1 ? ' (an octave error: check the file name)' : '';
    fail(
      `${id} ${z.out}: measured MIDI ${midi.toFixed(2)}, expected ${z.keyCenter} (off by ${dev.toFixed(2)} st)${octave}`,
    );
  }
  // What the zone sounds when asked for its key centre: the measured pitch plus the playback
  // correction (`playbackRate` adds `tuneCents`). It must land within RESIDUAL_CENTS of the key, or
  // the tuning table (or the measurement) is wrong and lessons would play it out of tune.
  const residualCents = (midi + tuneCents / 100 - z.keyCenter) * 100;
  if (Math.abs(residualCents) > RESIDUAL_CENTS)
    fail(
      `${id} ${z.out}: plays ${residualCents.toFixed(1)} cents from MIDI ${z.keyCenter} after a ${tuneCents}c correction (limit ${RESIDUAL_CENTS})`,
    );
  const { rmsDb, peakDb } = levels(pcm, RATE);
  const gainDb = Math.round(Math.min(enc.targetRmsDb - rmsDb, enc.peakCeilingDb - peakDb) * 10) / 10;
  report(
    `${id.padEnd(6)} ${z.out.padEnd(7)} key ${z.keyCenter} measured ${midi.toFixed(3)} dev ${(dev * 100).toFixed(1)}c ` +
      `tune ${tuneCents}c baked ${bake}dB rms ${rmsDb.toFixed(1)} peak ${peakDb.toFixed(1)} gain ${gainDb} ${bytes.length} B`,
  );
  return {
    file: z.out,
    keyCenter: z.keyCenter,
    tuneCents,
    gainDb,
    startOffsetS: 0,
    durationS: Math.round((pcm.length / RATE) * 1000) / 1000,
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from(
      {
        length: Math.min(n, items.length),
      },
      async () => {
        while (next < items.length) {
          const i = next++;
          out[i] = await fn(items[i]);
        }
      },
    ),
  );
  return out;
}

/** The current generated zones, so a partial build keeps the other instruments. */
async function readExisting(): Promise<Record<Id, Omit<BuiltZone, 'bytes'>[]>> {
  const empty = Object.fromEntries(IDS.map((id) => [id, []])) as unknown as Record<Id, Omit<BuiltZone, 'bytes'>[]>;
  if (!existsSync(ZONES_TS)) return empty;
  const mod = (await import(ZONES_TS)) as {
    ZONES?: Record<Id, Omit<BuiltZone, 'bytes'>[]>;
  };
  return {
    ...empty,
    ...(mod.ZONES ?? {}),
  };
}

function writeZones(all: Record<Id, Omit<BuiltZone, 'bytes'>[]>): void {
  const data = JSON.stringify(all);
  const ts = `/**
 * GENERATED by scripts/rmhmusic/build-instruments.ts — never hand-edit. Zone maps for the sampled
 * instruments: one entry per converted MP3 under public/music/rmhmusic/instruments/<id>/, with the
 * MIDI note it sounds (measured by YIN on the encoded file), its tuning in cents, its loudness trim,
 * its decoded length and the SHA-256 of the committed file.
 * An instrument with no zones has no samples built yet and is not offered.
 */
import type { InstrumentId, ZoneMap } from './types';

export const ZONES: Readonly<Record<InstrumentId, ZoneMap>> = ${data};
`;
  writeFileSync(ZONES_TS, ts);
}

/** CREDITS.txt beside the samples, from `credits.ts`, so the shipped notice cannot drift. */
function writeCredits(): void {
  mkdirSync(dirname(CREDITS_TXT), {
    recursive: true,
  });
  writeFileSync(CREDITS_TXT, creditsText());
  report(`wrote ${CREDITS_TXT}`);
}

async function main() {
  const args = process.argv.slice(2);
  writeCredits();
  // `--credits`: only (re)write CREDITS.txt, no ffmpeg or downloads.
  if (args.includes('--credits')) return;
  const pin = args.includes('--pin');
  const ids = args.filter((a) => !a.startsWith('--')) as Id[];
  for (const id of ids) if (!IDS.includes(id)) fail(`unknown instrument ${id}`);
  const targets = ids.length ? ids : [...IDS];
  const sources = JSON.parse(readFileSync(SOURCES, 'utf8')) as Sources;
  const all = await readExisting();
  for (const id of targets) {
    const inst = sources.instruments[id];
    await extractArchive(id, inst, pin);
    const built = await pool(inst.zones, 4, (z) =>
      buildZone(id, inst, z, sources.encode, sources.pitchToleranceSemitones, pin),
    );
    const total = built.reduce((s, z) => s + z.bytes, 0);
    report(`${id}: ${built.length} zones, ${total} bytes`);
    all[id] = built.map(({ bytes: _bytes, ...z }) => z).sort((a, b) => a.keyCenter - b.keyCenter);
  }
  writeZones(all);
  if (pin) writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + '\n');
  await run('pnpm', ['exec', 'prettier', '--write', ZONES_TS, SOURCES], {
    cwd: ROOT,
  });
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
