/**
 * RMH Studios — Library, EPUB → 3D-book raster engine (client-only).
 *
 * Renders an EPUB into the SAME 3D page-curl book as PDFs. epub.js is the engine:
 * it opens the archive, paginates by character "locations" (a stable page model
 * independent of font size), exposes the table of contents, and lays each page out
 * in a hidden, fixed-size rendition. We snapshot that rendition to a canvas with
 * html2canvas, turn it into a GPU texture, and hand it to BookCanvas exactly like a
 * rasterised PDF page.
 *
 * Because a single epub.js rendition is shared, page rasterisation is serialised
 * (one navigation + snapshot at a time), nearest-the-current-page first, with the
 * same bounded LRU + deferred-dispose discipline as the PDF PageStore so GPU memory
 * stays bounded.
 *
 * Heavy DOM/Canvas/WebGL work — import from the browser only.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as THREE from 'three';

export type EpubToc = { title: string; page: number; depth: number };
export type EpubInit = {
  store: EpubRasterStore;
  numPages: number;
  aspect: number;
  title: string;
  toc: EpubToc[];
};
export type EpubTheme = 'light' | 'sepia' | 'dark';

const THEME_COLORS: Record<EpubTheme, { bg: string; fg: string }> = {
  light: { bg: '#ffffff', fg: '#1a1a1a' },
  sepia: { bg: '#f4ecd8', fg: '#3a2f23' },
  dark: { bg: '#15151a', fg: '#d7d7db' },
};

// Page geometry: a paperback-ish ratio. Height in CSS px sets the layout box; the
// snapshot scale lifts it to a crisp bitmap.
const PAGE_H = 1180;
const PAGE_ASPECT = 0.64;
const PAGE_W = Math.round(PAGE_H * PAGE_ASPECT);
const SNAP_SCALE = 1.6;
const CACHE_CAP = 10;
const PRUNE_WINDOW = 12;
const LOCATION_CHARS = 1200;

function configureTexture(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 4;
  tex.flipY = false;
  tex.needsUpdate = true;
}

type Rec = { texture: THREE.Texture; bitmap: ImageBitmap };

export class EpubRasterStore {
  private book: any;
  private rendition: any;
  private host: HTMLDivElement;
  private html2canvas: (el: HTMLElement, opts: any) => Promise<HTMLCanvasElement>;
  readonly numPages: number;
  readonly aspect = PAGE_ASPECT;

  private cache = new Map<number, Rec>(); // 1-based page → texture
  private inflight = new Set<number>();
  private queue: number[] = [];
  private busy = false;
  private focus = 1;
  private destroyed = false;
  private theme: EpubTheme = 'dark';

  private trash: Rec[] = [];
  private trashTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyScheduled = false;
  private onChange: () => void = () => {};

  private constructor(book: any, rendition: any, host: HTMLDivElement, h2c: any, numPages: number) {
    this.book = book;
    this.rendition = rendition;
    this.host = host;
    this.html2canvas = h2c;
    this.numPages = numPages;
  }

  /** Open an EPUB and prepare it for rasterised 3D rendering. */
  static async open(data: ArrayBuffer, opts: { theme?: EpubTheme; onChange?: () => void } = {}): Promise<EpubInit> {
    const ePub = (await import('epubjs')).default as any;
    const h2c = (await import('html2canvas')).default as any;

    const host = document.createElement('div');
    Object.assign(host.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${PAGE_W}px`,
      height: `${PAGE_H}px`,
      overflow: 'hidden',
      background: '#ffffff',
      zIndex: '-1',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    document.body.appendChild(host);

    const book = ePub(data);
    await book.ready;
    const rendition = book.renderTo(host, {
      width: PAGE_W,
      height: PAGE_H,
      flow: 'paginated',
      spread: 'none',
      allowScriptedContent: false,
    });
    await rendition.display();
    // Character-based locations give a stable page count + random access by page.
    await book.locations.generate(LOCATION_CHARS);
    const numPages = Math.max(1, book.locations.length());

    const store = new EpubRasterStore(book, rendition, host, h2c, numPages);
    store.onChange = opts.onChange ?? (() => {});
    store.applyTheme(opts.theme ?? 'dark');

    const title = (book.packaging?.metadata?.title as string) || '';
    const toc = await store.buildToc();

    return { store, numPages, aspect: PAGE_ASPECT, title, toc };
  }

  /** Map the EPUB navigation to 1-based page numbers (best-effort, capped). */
  private async buildToc(): Promise<EpubToc[]> {
    const nav = this.book.navigation?.toc as any[] | undefined;
    if (!nav?.length) return [];
    const flat: { title: string; href: string; depth: number }[] = [];
    const walk = (items: any[], depth: number) => {
      for (const it of items) {
        if (it.label?.trim() && it.href) flat.push({ title: it.label.trim(), href: it.href, depth });
        if (it.subitems?.length) walk(it.subitems, depth + 1);
      }
    };
    walk(nav, 0);

    const out: EpubToc[] = [];
    for (const entry of flat.slice(0, 80)) {
      try {
        // Resolve href → page via locations: get the section's start CFI, then the
        // location index that contains it.
        const section = this.book.spine.get(entry.href);
        let page = 1;
        if (section) {
          const startCfi = `epubcfi(${section.cfiBase}!/4/2)`;
          const loc = this.book.locations.locationFromCfi(startCfi);
          if (typeof loc === 'number' && loc >= 0) page = loc + 1;
        }
        out.push({ title: entry.title, page, depth: entry.depth });
      } catch {
        out.push({ title: entry.title, page: 1, depth: entry.depth });
      }
    }
    return out;
  }

  setFocus(page: number): void {
    this.focus = page;
  }

  getTexture(n: number): THREE.Texture | undefined {
    const rec = this.cache.get(n);
    if (rec) {
      this.cache.delete(n);
      this.cache.set(n, rec);
      return rec.texture;
    }
    return undefined;
  }

  ensure(n: number): void {
    if (this.destroyed || n < 1 || n > this.numPages) return;
    if (this.cache.has(n) || this.inflight.has(n)) return;
    if (this.queue.includes(n)) return;
    this.inflight.add(n);
    this.queue.push(n);
    void this.pump();
  }

  /** Re-theme: drop all cached pages so they re-rasterise with the new colours. */
  setTheme(theme: EpubTheme): void {
    if (theme === this.theme) return;
    this.applyTheme(theme);
    for (const rec of this.cache.values()) this.trash.push(rec);
    this.cache.clear();
    this.scheduleTrash();
    this.notify();
  }

  private applyTheme(theme: EpubTheme): void {
    this.theme = theme;
    const { bg, fg } = THEME_COLORS[theme];
    this.host.style.background = bg;
    try {
      this.rendition.themes.override('color', fg, true);
      this.rendition.themes.override('background', bg, true);
      this.rendition.themes.override('background-color', bg, true);
    } catch {
      /* themes API best-effort */
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.queue = [];
    this.inflight.clear();
    for (const rec of this.cache.values()) this.trash.push(rec);
    this.cache.clear();
    if (this.trashTimer) clearTimeout(this.trashTimer);
    this.flushTrash();
    try {
      this.rendition?.destroy();
      this.book?.destroy();
    } catch {
      /* ignore */
    }
    this.host.remove();
  }

  // ─── rasterisation loop (single rendition → strictly serial) ─────────────────
  private async pump(): Promise<void> {
    if (this.busy || this.destroyed || this.queue.length === 0) return;
    // Prune pages the reader has scrolled far past.
    this.queue = this.queue.filter((n) => {
      const near = Math.abs(n - this.focus) <= PRUNE_WINDOW;
      if (!near) this.inflight.delete(n);
      return near;
    });
    if (this.queue.length === 0) return;
    // Nearest the focus first.
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i < this.queue.length; i++) {
      const d = Math.abs(this.queue[i] - this.focus);
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    const n = this.queue.splice(bi, 1)[0];
    this.busy = true;
    try {
      await this.rasterize(n);
    } catch {
      /* leave page absent; a later ensure() can retry */
    } finally {
      this.inflight.delete(n);
      this.busy = false;
      if (!this.destroyed && this.queue.length) void this.pump();
    }
  }

  private async rasterize(n: number): Promise<void> {
    const cfi = this.book.locations.cfiFromLocation(n - 1);
    if (cfi) await this.rendition.display(cfi);
    else await this.rendition.display();
    if (this.destroyed) return;
    // Let the iframe lay out + fonts settle before snapshotting.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (this.destroyed) return;

    const canvas = await this.html2canvas(this.host, {
      backgroundColor: THEME_COLORS[this.theme].bg,
      width: PAGE_W,
      height: PAGE_H,
      windowWidth: PAGE_W,
      windowHeight: PAGE_H,
      scale: SNAP_SCALE,
      useCORS: true,
      logging: false,
    });
    if (this.destroyed) return;

    const bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY' });
    if (this.destroyed) {
      bitmap.close();
      return;
    }
    const texture = new THREE.Texture(bitmap);
    configureTexture(texture);
    const prev = this.cache.get(n);
    if (prev) this.trash.push(prev);
    this.cache.set(n, { texture, bitmap });
    while (this.cache.size > CACHE_CAP) {
      const oldest = this.cache.keys().next().value as number | undefined;
      if (oldest === undefined || oldest === n) break;
      const rec = this.cache.get(oldest)!;
      this.cache.delete(oldest);
      this.trash.push(rec);
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
