/**
 * RMH Studios — Library reader, page raster pipeline.
 *
 * Turns PDF pages into ready-to-draw GPU textures for the 3D book, optimised for a
 * smooth, low-memory read of even a 1000-page file. It is plain (non-React) and owns
 * the full lifecycle of every page bitmap, so the renderer can stay a thin consumer.
 *
 * Why it's fast and light:
 *  - **No JPEG round-trip.** The old path did `canvas.toDataURL('image/jpeg')` then
 *    re-decoded that base64 string through an <img> + TextureLoader — a CPU encode
 *    *and* a CPU decode per page, plus a fat base64 string pinned in the JS heap. Here
 *    a page is rendered once to a canvas and handed straight to `createImageBitmap`,
 *    which decodes off the main thread into a GPU-uploadable bitmap. The renderer gets
 *    a finished `THREE.Texture` — no async decode at draw time, so a page never flashes
 *    blank waiting to decode.
 *  - **Bounded memory.** The previous reader kept every rendered page's data URL in an
 *    unbounded Map (hundreds of MB on a long book). Here textures live in two small
 *    LRU caches and are *disposed* (GPU memory freed) the moment they fall out of the
 *    reading window.
 *  - **Two tiers for instant paint.** A wide ring of cheap low-res previews keeps fast
 *    scrubbing/flipping from ever pausing on a blank page, while a tiny ring of
 *    full-res pages carries the sharpness for the spread you're actually reading. A
 *    page upgrades from preview to full in place.
 *  - **Priority scheduling.** Renders are concurrency-capped and ordered nearest-the-
 *    current-page-first; requests that the reader has already scrolled far past are
 *    pruned before they start, so spamming through pages never builds a backlog.
 *
 * Client-only (uses `createImageBitmap`, `document`, three). Import from components.
 */

import * as THREE from 'three';

/** Minimal pdf.js surface we depend on — avoids a hard type dependency on pdfjs. */
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => {
    promise: Promise<void>;
  };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };

type Tier = 'preview' | 'full';
type Rec = { texture: THREE.Texture; bitmap: ImageBitmap; width: number };
type Job = { n: number; width: number; tier: Tier; key: string };

export type PageStoreOpts = {
  /** Width (px) of the cheap first-paint raster. */
  previewWidth?: number;
  /** Width (px) of the full-quality raster (driven by the quality menu). */
  fullWidth?: number;
  /** How many full-res pages to keep resident (GPU memory ∝ this × fullWidth²). */
  fullCap?: number;
  /** How many low-res previews to keep resident (covers fast scrubbing). */
  previewCap?: number;
  /** Max pages rendering at once. pdf.js is single-worker; 2 keeps the UI live. */
  maxActive?: number;
  /** Called (coalesced to one per frame) whenever a new texture becomes available. */
  onChange?: () => void;
};

/** Queued renders for pages this far past the focused page are dropped, unstarted. */
const PRUNE_WINDOW = 14;

function configureTexture(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  // Rasterised pages are non-power-of-two; mipmaps force a (costly, sometimes broken)
  // chain. Plain linear filtering needs none and stays crisp under the ortho camera.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 4;
  // The bitmap is created already top-left-origin (imageOrientation:'flipY'); GPUs
  // can't flip an ImageBitmap at upload, so we bake the flip in and turn this off.
  tex.flipY = false;
  tex.needsUpdate = true;
}

export class PageStore {
  private doc: PdfDoc;
  readonly numPages: number;
  private previewWidth: number;
  private fullWidth: number;
  private fullCap: number;
  private previewCap: number;
  private maxActive: number;
  private onChange: () => void;

  /** Page → resident texture, most-recently-used last (LRU eviction off the front). */
  private full = new Map<number, Rec>();
  private preview = new Map<number, Rec>();
  private inflight = new Set<string>();
  private queue: Job[] = [];
  private active = 0;
  /** The page the reader is on; renders nearest it run first, far ones get pruned. */
  private focus = 1;
  private destroyed = false;

  // Textures are never disposed in the same frame they might still be bound to a
  // material — that would draw a freed texture (a black flash). Instead they're parked
  // here and disposed a couple of frames later, after React has had a commit to swap
  // them out of the scene.
  private trash: Rec[] = [];
  private trashTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyScheduled = false;

  constructor(doc: PdfDoc, opts: PageStoreOpts = {}) {
    this.doc = doc;
    this.numPages = doc.numPages;
    this.previewWidth = opts.previewWidth ?? 520;
    this.fullWidth = opts.fullWidth ?? 1600;
    this.fullCap = opts.fullCap ?? 6;
    this.previewCap = opts.previewCap ?? 40;
    this.maxActive = opts.maxActive ?? 2;
    this.onChange = opts.onChange ?? (() => {});
  }

  /**
   * Retune the full-quality tier: the raster width every page targets and how many
   * full-res pages stay resident. The reader calls this as the on-screen page size
   * changes (viewport resize, zoom, quality menu) so textures track the display's
   * device-pixel resolution — sharp without over-spending GPU memory. A wider target
   * marks resident pages stale (they re-render on the next `ensure`); a smaller cap
   * evicts the least-recently-used full pages right away instead of on next insert.
   */
  setFull(width: number, cap: number): void {
    this.fullWidth = width;
    this.fullCap = Math.max(1, Math.floor(cap));
    while (this.full.size > this.fullCap) {
      const oldest = this.full.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      const old = this.full.get(oldest)!;
      this.full.delete(oldest);
      this.trash.push(old);
    }
    this.scheduleTrash();
  }

  /** Tell the scheduler which page is in view so it prioritises/prunes correctly. */
  setFocus(page: number): void {
    this.focus = page;
  }

  /** True once a page has a full-res texture at (or above) the current quality. */
  hasFull(n: number): boolean {
    const rec = this.full.get(n);
    return !!rec && rec.width >= this.fullWidth;
  }

  /**
   * The best texture available for page `n` right now (full preferred, else preview,
   * else undefined). Reading a page marks it most-recently-used so it survives eviction.
   */
  getTexture(n: number): THREE.Texture | undefined {
    const full = this.full.get(n);
    if (full) {
      this.touch(this.full, n);
      return full.texture;
    }
    const prev = this.preview.get(n);
    if (prev) {
      this.touch(this.preview, n);
      return prev.texture;
    }
    return undefined;
  }

  /** Schedule whatever rendering page `n` needs to reach the current quality. */
  ensure(n: number): void {
    if (this.destroyed || n < 1 || n > this.numPages) return;
    if (!this.hasFull(n)) {
      // Show *something* immediately on first touch, then sharpen.
      if (this.previewWidth < this.fullWidth && !this.preview.has(n)) {
        this.enqueue(n, this.previewWidth, 'preview');
      }
      this.enqueue(n, this.fullWidth, 'full');
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.queue = [];
    this.inflight.clear();
    for (const rec of this.full.values()) this.trash.push(rec);
    for (const rec of this.preview.values()) this.trash.push(rec);
    this.full.clear();
    this.preview.clear();
    if (this.trashTimer) clearTimeout(this.trashTimer);
    this.flushTrash();
  }

  // ─── internals ──────────────────────────────────────────────────────────────

  private touch(map: Map<number, Rec>, n: number): void {
    const v = map.get(n);
    if (v) {
      map.delete(n);
      map.set(n, v);
    }
  }

  private enqueue(n: number, width: number, tier: Tier): void {
    const key = `${n}@${width}`;
    if (this.inflight.has(key)) return;
    if (this.queue.some((j) => j.key === key)) return;
    this.inflight.add(key);
    this.queue.push({ n, width, tier, key });
    this.pump();
  }

  private pump(): void {
    if (this.destroyed) return;
    // Drop work for pages the reader has already blown past — keeps fast flipping from
    // accumulating a long tail of now-pointless renders behind the current spread.
    if (this.queue.length > 1) {
      this.queue = this.queue.filter((j) => {
        const near = Math.abs(j.n - this.focus) <= PRUNE_WINDOW;
        if (!near) this.inflight.delete(j.key);
        return near;
      });
    }
    while (this.active < this.maxActive && this.queue.length) {
      // Nearest-to-focus first; within a similar distance, a preview before its full so
      // the page paints (low-res) before it sharpens.
      let bi = 0;
      let best = Infinity;
      for (let i = 0; i < this.queue.length; i++) {
        const j = this.queue[i];
        const score = Math.abs(j.n - this.focus) * 10 + (j.tier === 'full' ? 1 : 0);
        if (score < best) {
          best = score;
          bi = i;
        }
      }
      const [job] = this.queue.splice(bi, 1);
      void this.run(job);
    }
  }

  private async run(job: Job): Promise<void> {
    this.active++;
    try {
      const page = await this.doc.getPage(job.n);
      if (this.destroyed) return;
      const base = page.getViewport({ scale: 1 });
      const scale = job.width / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      if (this.destroyed) return;
      const bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY' });
      if (this.destroyed) {
        bitmap.close();
        return;
      }
      const texture = new THREE.Texture(bitmap);
      configureTexture(texture);
      this.store(job, { texture, bitmap, width: job.width });
    } catch {
      /* page render failed/cancelled — leave it absent, ensure() can retry later */
    } finally {
      this.inflight.delete(job.key);
      this.active--;
      this.pump();
    }
  }

  private store(job: Job, rec: Rec): void {
    const map = job.tier === 'full' ? this.full : this.preview;
    const cap = job.tier === 'full' ? this.fullCap : this.previewCap;
    const existing = map.get(job.n);
    if (existing) {
      if (existing.width >= rec.width) {
        // A sharper raster already landed (race) — discard this one.
        this.trash.push(rec);
        this.scheduleTrash();
        return;
      }
      this.trash.push(existing);
    }
    map.delete(job.n);
    map.set(job.n, rec);
    while (map.size > cap) {
      const oldest = map.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      const old = map.get(oldest)!;
      map.delete(oldest);
      this.trash.push(old);
    }
    this.scheduleTrash();
    this.notify();
  }

  private notify(): void {
    if (this.notifyScheduled || this.destroyed) return;
    this.notifyScheduled = true;
    requestAnimationFrame(() => {
      this.notifyScheduled = false;
      if (!this.destroyed) this.onChange();
    });
  }

  private scheduleTrash(): void {
    if (this.trashTimer || this.destroyed) return;
    this.trashTimer = setTimeout(() => {
      this.trashTimer = null;
      this.flushTrash();
    }, 400);
  }

  private flushTrash(): void {
    const items = this.trash;
    this.trash = [];
    for (const rec of items) {
      rec.texture.dispose();
      try {
        rec.bitmap.close();
      } catch {
        /* already closed */
      }
    }
  }
}
