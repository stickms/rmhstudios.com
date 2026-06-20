/**
 * Generate library metadata (title + description + first-page cover) for every PDF
 * in public/library.
 *
 * For each PDF we extract a sample of its text (first few pages) and ask DeepSeek
 * to produce a clean, human-readable title and a one-sentence description, render
 * its first page to a JPEG cover (public/library/covers/<name>.jpg), and record the
 * page count. Everything is cached to data/library-metadata.json, keyed by the PDF
 * filename, so the /library route can render rich, illustrated cards without
 * re-parsing the PDFs or hitting the LLM at request time.
 *
 * Idempotent: existing entries (and existing cover files) are kept unless --force is
 * passed, so re-running only fills in what's new. Run with:
 *   pnpm run library:metadata          # only new/missing PDFs + covers
 *   pnpm run library:metadata --force  # regenerate everything
 *
 * Requires DEEPSEEK_API_KEY for titles/descriptions. If a PDF can't be parsed, the
 * API fails, or a cover can't be rendered, we fall back gracefully so the library
 * never breaks.
 */

import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { createCanvas, type Canvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
// Legacy build runs in Node without a DOM.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// pdfjs touches these browser globals while rendering; @napi-rs/canvas provides
// node-native implementations.
const g = globalThis as Record<string, unknown>;
g.DOMMatrix ??= DOMMatrix;
g.ImageData ??= ImageData;
g.Path2D ??= Path2D;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIBRARY_DIR = path.join(ROOT, 'public', 'library');
const COVERS_DIR = path.join(LIBRARY_DIR, 'covers');
const OUT_FILE = path.join(ROOT, 'data', 'library-metadata.json');

const FORCE = process.argv.includes('--force');
const COVER_WIDTH = 720; // rendered cover width in px

export type LibraryMeta = {
  /** Clean, human-readable title. */
  title: string;
  /** One-sentence description for the card. */
  description: string;
  /** Total page count of the PDF. */
  pages: number;
  /** Cover image filename within public/library/covers (or null if none). */
  cover: string | null;
};

/** A pdfjs canvas factory backed by @napi-rs/canvas (no DOM needed). */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(cc: { canvas: Canvas }, width: number, height: number) {
    cc.canvas.width = Math.ceil(width);
    cc.canvas.height = Math.ceil(height);
  }
  destroy(cc: { canvas: Canvas | null; context: unknown }) {
    if (cc.canvas) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    }
    cc.canvas = null;
    cc.context = null;
  }
}

/** "everything_platform_minute_vol1.pdf" → "Everything Platform Minute Vol1". */
function humanize(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type Processed = { text: string; pages: number; coverOk: boolean };

/**
 * Open a PDF once and pull out: sample text (first pages), the page count, and —
 * when requested — a JPEG of the first page written to `coverAbs`. Tolerant of
 * partial failures: a render error still returns whatever text/pages we got.
 */
async function processPdf(buf: Buffer, opts: { coverAbs: string; renderCover: boolean }): Promise<Processed> {
  const data = new Uint8Array(buf);
  const task = getDocument({
    data,
    useSystemFonts: true,
    canvasFactory: new NodeCanvasFactory(),
  });
  const doc = await task.promise;
  let text = '';
  let pages = 0;
  let coverOk = false;
  try {
    pages = doc.numPages;

    // Sample text from the first few pages for the LLM.
    const sampleCount = Math.min(pages, 4);
    for (let i = 1; i <= sampleCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      text += pageText + '\n';
      if (text.length > 6000) break;
    }

    // Render the first page as the cover.
    if (opts.renderCover && pages > 0) {
      try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = COVER_WIDTH / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        // PDFs can be transparent; paint white so the cover isn't black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // pdfjs types expect a DOM 2D context; the napi context is compatible.
        await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
        const jpg = await canvas.encode('jpeg', 82);
        await writeFile(opts.coverAbs, jpg);
        coverOk = true;
      } catch (err) {
        console.warn(`  ⚠ Cover render failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await task.destroy().catch(() => {});
  }
  return { text: text.slice(0, 6000).trim(), pages, coverOk };
}

/** Ask DeepSeek for a title + description from the sampled text. */
async function describe(filename: string, sample: string): Promise<{ title: string; description: string }> {
  const fallbackTitle = humanize(filename);
  if (!process.env.DEEPSEEK_API_KEY) {
    return { title: fallbackTitle, description: '' };
  }
  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  });

  const prompt = `You are cataloguing a digital library. Below is the filename and a text excerpt from a PDF document. Produce a clean, compelling catalogue entry.

Filename: ${filename}
Excerpt:
"""
${sample || '(no extractable text)'}
"""

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{"title": "<a clear, human-readable title, max 70 chars, Title Case, no file extension>", "description": "<one enticing sentence describing what this document is, max 180 chars>"}`;

  // DeepSeek occasionally returns an empty/partial body under rapid calls, so we
  // retry a few times and pull the JSON object out of whatever text comes back.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await deepseek.chat.completions.create({
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.4,
      });
      const raw = res.choices[0]?.message?.content?.trim() ?? '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no JSON object in response');
      const parsed = JSON.parse(match[0]) as { title?: string; description?: string };
      if (!parsed.description) throw new Error('missing description');
      return {
        title: (parsed.title || fallbackTitle).slice(0, 70),
        description: parsed.description.slice(0, 180),
      };
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  ⚠ DeepSeek failed for ${filename}: ${(err as Error).message}. Using fallback.`);
        return { title: fallbackTitle, description: '' };
      }
      await sleep(1200 * attempt);
    }
  }
  return { title: fallbackTitle, description: '' };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!existsSync(LIBRARY_DIR)) {
    console.error(`Library dir not found: ${LIBRARY_DIR}`);
    process.exit(1);
  }
  await mkdir(COVERS_DIR, { recursive: true });

  const existing: Record<string, LibraryMeta> = existsSync(OUT_FILE)
    ? JSON.parse(await readFile(OUT_FILE, 'utf8'))
    : {};

  const files = (await readdir(LIBRARY_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log(`Found ${files.length} PDF(s) in public/library.`);

  const out: Record<string, LibraryMeta> = {};
  for (const file of files) {
    const coverName = `${file.replace(/\.pdf$/i, '')}.jpg`;
    const coverAbs = path.join(COVERS_DIR, coverName);
    const prev = existing[file];

    const haveMeta = !FORCE && prev?.title && prev?.description;
    const haveCover = !FORCE && existsSync(coverAbs);
    if (haveMeta && haveCover) {
      out[file] = { ...prev, cover: coverName };
      console.log(`• ${file} — cached`);
      continue;
    }

    console.log(`• ${file} — processing…`);
    let pages = prev?.pages ?? 0;
    let sample = '';
    let coverOk = haveCover;
    try {
      const buf = await readFile(path.join(LIBRARY_DIR, file));
      const r = await processPdf(buf, { coverAbs, renderCover: FORCE || !haveCover });
      pages = r.pages;
      sample = r.text;
      coverOk = coverOk || r.coverOk;
    } catch (err) {
      console.warn(`  ⚠ Could not parse ${file}: ${(err as Error).message}`);
    }

    const meta = haveMeta
      ? { title: prev.title, description: prev.description }
      : await describe(file, sample);
    out[file] = { ...meta, pages, cover: coverOk ? coverName : null };
    console.log(`  → "${meta.title}" (${pages} pages)${coverOk ? ' +cover' : ''}`);
    if (!haveMeta) await sleep(400); // gentle pacing to avoid rate-limit empties
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${Object.keys(out).length} entries to ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
