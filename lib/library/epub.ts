/**
 * RMH Studios — Library, minimal EPUB engine (client-only).
 *
 * A small, dependency-light EPUB reader core built on jszip (already a project
 * dependency) — no new package to fetch. It opens the container, reads the OPF
 * package (manifest + spine + metadata), the nav/NCX table of contents, and
 * renders each spine document to a self-contained HTML string whose resource
 * references (images, stylesheets, fonts) are rewritten to in-memory blob URLs.
 *
 * The reader (EpubReader) paginates each chapter with CSS multicolumn layout in a
 * sandboxed iframe; the upload analyzer reuses the same parse to pull a title,
 * cover and text snippet without any server-side EPUB toolchain.
 *
 * Uses DOMParser / Blob / URL — import from the browser only.
 */

import JSZip from 'jszip';

export type EpubSpineItem = { id: string; href: string };
export type EpubTocEntry = { title: string; href: string; depth: number };

/** A spine document rendered to a standalone HTML string + the cover/TOC metadata. */
export type EpubChapter = { html: string; href: string };

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html',
  xhtml: 'application/xhtml+xml',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function extOf(path: string): string {
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(path);
  return m ? m[1].toLowerCase() : '';
}

/** Resolve `rel` against the directory of `base` (both zip-internal paths). */
function resolvePath(base: string, rel: string): string {
  if (/^[a-z]+:/i.test(rel) || rel.startsWith('data:') || rel.startsWith('#')) return rel;
  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '';
  const stack = baseDir ? baseDir.split('/') : [];
  for (const part of rel.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/** Strip a query/hash and normalise a zip-internal path for lookup. */
function cleanPath(path: string): string {
  return decodeURIComponent(path.replace(/[?#].*$/, ''));
}

export class EpubBook {
  private zip: JSZip;
  private opfPath = '';
  private manifest = new Map<string, { href: string; type: string; props: string }>(); // id → entry
  private hrefToId = new Map<string, string>(); // absolute href → id
  spine: EpubSpineItem[] = [];
  toc: EpubTocEntry[] = [];
  title = '';
  language = '';
  private coverHref: string | null = null;
  private urlCache = new Map<string, string>(); // path → blob URL

  private constructor(zip: JSZip) {
    this.zip = zip;
  }

  static async open(data: ArrayBuffer | Uint8Array): Promise<EpubBook> {
    const zip = await JSZip.loadAsync(data);
    const book = new EpubBook(zip);
    await book.init();
    return book;
  }

  get spineLength(): number {
    return this.spine.length;
  }

  private file(path: string): JSZip.JSZipObject | null {
    return this.zip.file(cleanPath(path)) ?? null;
  }

  private async init(): Promise<void> {
    // 1. container.xml → OPF path
    const containerXml = await this.file('META-INF/container.xml')?.async('string');
    if (!containerXml) throw new Error('Not an EPUB (no container.xml)');
    const container = new DOMParser().parseFromString(containerXml, 'application/xml');
    this.opfPath = container.querySelector('rootfile')?.getAttribute('full-path') ?? '';
    if (!this.opfPath) throw new Error('EPUB has no package document');

    // 2. OPF package: metadata, manifest, spine
    const opfXml = await this.file(this.opfPath)?.async('string');
    if (!opfXml) throw new Error('EPUB package document missing');
    const opf = new DOMParser().parseFromString(opfXml, 'application/xml');
    const opfDir = this.opfPath.includes('/') ? this.opfPath.slice(0, this.opfPath.lastIndexOf('/')) : '';

    this.title =
      opf.querySelector('metadata title, metadata > *|title')?.textContent?.trim() ||
      opf.getElementsByTagName('dc:title')[0]?.textContent?.trim() ||
      '';
    this.language =
      opf.getElementsByTagName('dc:language')[0]?.textContent?.trim() || '';

    let metaCoverId: string | null = null;
    opf.querySelectorAll('metadata meta').forEach((m) => {
      if (m.getAttribute('name') === 'cover') metaCoverId = m.getAttribute('content');
    });

    opf.querySelectorAll('manifest > item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (!id || !href) return;
      const abs = resolvePath(this.opfPath, href);
      const props = item.getAttribute('properties') ?? '';
      this.manifest.set(id, { href: abs, type: item.getAttribute('media-type') ?? '', props });
      this.hrefToId.set(abs, id);
      if (props.split(/\s+/).includes('cover-image')) this.coverHref = abs;
    });
    if (!this.coverHref && metaCoverId && this.manifest.has(metaCoverId)) {
      this.coverHref = this.manifest.get(metaCoverId)!.href;
    }

    opf.querySelectorAll('spine > itemref').forEach((ref) => {
      const idref = ref.getAttribute('idref');
      if (!idref) return;
      const entry = this.manifest.get(idref);
      if (entry) this.spine.push({ id: idref, href: entry.href });
    });

    // 3. Table of contents — EPUB3 nav doc, else EPUB2 NCX.
    await this.loadToc(opf, opfDir);
    void opfDir;
  }

  private async loadToc(opf: Document, opfDir: string): Promise<void> {
    try {
      // EPUB3: manifest item with properties="nav"
      let navEntry: { href: string } | undefined;
      this.manifest.forEach((e) => {
        if (e.props.split(/\s+/).includes('nav')) navEntry = e;
      });
      if (navEntry) {
        const xml = await this.file(navEntry.href)?.async('string');
        if (xml) {
          const doc = new DOMParser().parseFromString(xml, 'application/xhtml+xml');
          const navEl =
            doc.querySelector('nav[*|type="toc"]') ||
            doc.querySelector('nav[epub\\:type="toc"]') ||
            doc.querySelector('nav');
          const walk = (ol: Element, depth: number) => {
            ol.querySelectorAll(':scope > li').forEach((li) => {
              const a = li.querySelector(':scope > a, :scope > span');
              const href = a?.getAttribute('href');
              const title = a?.textContent?.trim();
              if (title && href) {
                this.toc.push({ title, href: resolvePath(navEntry!.href, href), depth });
              }
              const child = li.querySelector(':scope > ol');
              if (child) walk(child, depth + 1);
            });
          };
          const root = navEl?.querySelector('ol');
          if (root) walk(root, 0);
          if (this.toc.length) return;
        }
      }
      // EPUB2: NCX referenced by spine[toc] or a manifest item of type ncx.
      let ncxHref: string | null = null;
      const tocAttr = opf.querySelector('spine')?.getAttribute('toc');
      if (tocAttr && this.manifest.has(tocAttr)) ncxHref = this.manifest.get(tocAttr)!.href;
      if (!ncxHref) {
        this.manifest.forEach((e) => {
          if (e.type === 'application/x-dtbncx+xml') ncxHref = e.href;
        });
      }
      if (ncxHref) {
        const xml = await this.file(ncxHref)?.async('string');
        if (xml) {
          const doc = new DOMParser().parseFromString(xml, 'application/xml');
          const walk = (parent: Element, depth: number) => {
            Array.from(parent.children)
              .filter((c) => c.tagName.toLowerCase().endsWith('navpoint'))
              .forEach((np) => {
                const title = np.querySelector('navLabel > text, navLabel text')?.textContent?.trim();
                const src = np.querySelector('content')?.getAttribute('src');
                if (title && src) this.toc.push({ title, href: resolvePath(ncxHref!, src), depth });
                walk(np, depth + 1);
              });
          };
          const navMap = doc.querySelector('navMap');
          if (navMap) walk(navMap, 0);
        }
      }
    } catch {
      /* TOC is best-effort; a book with none simply hides the chapter menu */
    }
    void opfDir;
  }

  /** Map a (possibly fragment-bearing) href to its spine index, or -1. */
  spineIndexForHref(href: string): number {
    const clean = cleanPath(href);
    return this.spine.findIndex((s) => s.href === clean);
  }

  /** A cached blob URL for a zip resource, with a sensible content type. */
  private async resourceUrl(path: string): Promise<string | null> {
    const key = cleanPath(path);
    const hit = this.urlCache.get(key);
    if (hit) return hit;
    const f = this.file(key);
    if (!f) return null;
    const id = this.hrefToId.get(key);
    const type = (id && this.manifest.get(id)?.type) || MIME_BY_EXT[extOf(key)] || 'application/octet-stream';
    const blob = await f.async('blob');
    const url = URL.createObjectURL(type ? blob.slice(0, blob.size, type) : blob);
    this.urlCache.set(key, url);
    return url;
  }

  /** Rewrite `url(...)` references inside a CSS text to blob URLs (best-effort). */
  private async rewriteCss(css: string, cssPath: string): Promise<string> {
    const refs = new Set<string>();
    css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (_m, u: string) => {
      if (u && !/^(data:|https?:)/i.test(u)) refs.add(u);
      return _m;
    });
    let out = css;
    for (const ref of refs) {
      const url = await this.resourceUrl(resolvePath(cssPath, ref));
      if (url) out = out.split(ref).join(url);
    }
    return out;
  }

  /**
   * Render spine item `index` to a self-contained HTML string: external CSS is
   * inlined (with its own url()s rewritten), images/fonts become blob URLs, and
   * inter-chapter links are tagged with data-epub-href for the reader to intercept.
   */
  async chapter(index: number): Promise<EpubChapter> {
    const item = this.spine[index];
    if (!item) return { html: '', href: '' };
    const raw = (await this.file(item.href)?.async('string')) ?? '';
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
      if (doc.querySelector('parsererror')) throw new Error('xhtml parse error');
    } catch {
      doc = new DOMParser().parseFromString(raw, 'text/html');
    }

    // Inline stylesheets (rewriting their url()s), then drop the <link>.
    const links = Array.from(doc.querySelectorAll('link[rel~="stylesheet"], link[type="text/css"]'));
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const cssText = await this.file(resolvePath(item.href, href))?.async('string');
      if (cssText) {
        const style = doc.createElement('style');
        style.textContent = await this.rewriteCss(cssText, resolvePath(item.href, href));
        link.replaceWith(style);
      } else {
        link.remove();
      }
    }
    // Rewrite any inline <style> url()s too.
    for (const style of Array.from(doc.querySelectorAll('style'))) {
      if (style.textContent) style.textContent = await this.rewriteCss(style.textContent, item.href);
    }

    // Images (incl. SVG <image xlink:href>).
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      const src = img.getAttribute('src');
      if (src && !/^(data:|https?:)/i.test(src)) {
        const url = await this.resourceUrl(resolvePath(item.href, src));
        if (url) img.setAttribute('src', url);
        img.removeAttribute('loading');
      }
    }
    for (const image of Array.from(doc.querySelectorAll('image'))) {
      const href = image.getAttribute('xlink:href') || image.getAttribute('href');
      if (href && !/^(data:|https?:)/i.test(href)) {
        const url = await this.resourceUrl(resolvePath(item.href, href));
        if (url) {
          image.setAttribute('xlink:href', url);
          image.setAttribute('href', url);
        }
      }
    }
    // Tag internal links so the host can intercept and navigate the spine.
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href')!;
      if (!/^(https?:|mailto:|data:)/i.test(href)) {
        a.setAttribute('data-epub-href', resolvePath(item.href, href));
        a.setAttribute('href', 'javascript:void(0)');
      } else {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noreferrer');
      }
    }

    const body = doc.body ? doc.body.innerHTML : doc.documentElement?.innerHTML ?? raw;
    const head = Array.from(doc.querySelectorAll('style'))
      .map((s) => `<style>${s.textContent ?? ''}</style>`)
      .join('\n');
    return { html: `${head}\n${body}`, href: item.href };
  }

  /** Extract the cover image as a Blob, if the EPUB declares one. */
  async coverBlob(): Promise<Blob | null> {
    if (!this.coverHref) return null;
    const f = this.file(this.coverHref);
    if (!f) return null;
    const id = this.hrefToId.get(cleanPath(this.coverHref));
    const type = (id && this.manifest.get(id)?.type) || MIME_BY_EXT[extOf(this.coverHref)] || 'image/jpeg';
    const blob = await f.async('blob');
    return blob.slice(0, blob.size, type);
  }

  /** Concatenated visible text from the opening chapters (for AI metadata). */
  async text(maxChars: number, maxChapters = 6): Promise<string> {
    let out = '';
    const n = Math.min(this.spine.length, maxChapters);
    for (let i = 0; i < n && out.length < maxChars; i++) {
      try {
        const raw = (await this.file(this.spine[i].href)?.async('string')) ?? '';
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        out += (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim() + '\n';
      } catch {
        /* skip */
      }
    }
    return out.slice(0, maxChars).trim();
  }

  /** Release every blob URL created for resources. Call when closing the reader. */
  revoke(): void {
    for (const url of this.urlCache.values()) URL.revokeObjectURL(url);
    this.urlCache.clear();
  }
}
