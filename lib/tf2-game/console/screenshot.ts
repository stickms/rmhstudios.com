/**
 * `screenshot` / `jpeg`: the game view WITH its HUD, as one PNG — what
 * Source's screenshot saves. Three layers, composited in the order the
 * player sees them:
 *
 *   1. the 3D canvas (read right after it rendered: the console takes the
 *      shot from the client's frame);
 *   2. the HUD's own canvases (a custom HUD's panel canvas) — drawn where
 *      they sit;
 *   3. the DOM HUD — health, ammo, the kill feed, chat, menus — serialized
 *      into an SVG `foreignObject` with every element's computed style
 *      inlined, its canvases as images and the fonts it uses embedded, then
 *      drawn as an image. No library: the browser renders its own HTML.
 *
 * The console's own panel is left out (as in Source). A layer that cannot be
 * drawn (a browser that refuses the SVG, a cross-origin font) is skipped, not
 * fatal: the shot still has the game view.
 *
 * Browser only (guarded: does nothing without a DOM).
 */

/** Elements never in a screenshot (the console itself, its cfg editor). */
const SKIP_SELECTOR = '.tf2g-console, .tf2g-cfg-editor, [data-screenshot="skip"]';

/** Computed properties copied onto each cloned element (enough to lay out and paint the HUD). */
function styleText(cs: CSSStyleDeclaration): string {
  let out = '';
  for (let i = 0; i < cs.length; i++) {
    const name = cs[i];
    // Transitions and animations would only replay; the snapshot is the current frame.
    if (name.startsWith('transition') || name.startsWith('animation')) continue;
    out += `${name}:${cs.getPropertyValue(name)};`;
  }
  return out;
}

/** Clones `el` with inline computed styles; canvases become images of their pixels. */
function cloneStyled(el: Element): Node | null {
  if (el.matches(SKIP_SELECTOR)) return null;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  if (el instanceof HTMLCanvasElement) {
    const img = document.createElement('img');
    try {
      img.setAttribute('src', el.toDataURL('image/png'));
    } catch {
      return null;
    }
    img.setAttribute('style', styleText(cs));
    return img;
  }
  const copy = el.cloneNode(false) as Element;
  copy.removeAttribute('id');
  copy.setAttribute('style', styleText(cs));
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) copy.appendChild(child.cloneNode());
    else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = cloneStyled(child as Element);
      if (c) copy.appendChild(c);
    }
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) copy.setAttribute('value', el.value);
  return copy;
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** `@font-face` rules (readable stylesheets) for the families the HUD uses, with their files embedded. */
async function embeddedFonts(families: Set<string>): Promise<string> {
  const rules: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue; // cross-origin: its fonts stay out
    }
    for (const r of Array.from(list)) {
      if (r instanceof CSSFontFaceRule) {
        const fam = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        if (families.has(fam)) rules.push(r);
      }
    }
  }
  const out: string[] = [];
  for (const r of rules.slice(0, 16)) {
    let text = r.cssText;
    const urls = [...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
    for (const u of urls) {
      if (u.startsWith('data:')) continue;
      const data = await toDataUrl(new URL(u, document.baseURI).href);
      if (data) text = text.split(u).join(data);
    }
    out.push(text);
  }
  return out.join('\n');
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The DOM HUD drawn as an image of `w`×`h` CSS pixels, or null when the browser will not. */
async function hudImage(hud: HTMLElement, w: number, h: number): Promise<HTMLImageElement | null> {
  const clone = cloneStyled(hud) as HTMLElement | null;
  if (!clone) return null;
  // The clone sits at the HUD's own box (the root's position is the stage's, not the page's).
  clone.style.position = 'absolute';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = `${w}px`;
  clone.style.height = `${h}px`;
  const families = new Set<string>();
  for (const el of [hud, ...Array.from(hud.querySelectorAll('*'))]) {
    for (const f of getComputedStyle(el).fontFamily.split(',')) families.add(f.replace(/["']/g, '').trim());
  }
  const fonts = await embeddedFonts(families);
  const wrapper = document.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.setAttribute('style', `position:relative;width:${w}px;height:${h}px;overflow:hidden;`);
  wrapper.appendChild(clone);
  const xhtml = new XMLSerializer().serializeToString(wrapper);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<style>${fonts.replace(/</g, '\\3c ')}</style>` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`;
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

/**
 * The composited screenshot: the game canvas, then the HUD over it at the canvas's resolution.
 * Resolves to a PNG blob (null when even the game view cannot be read).
 */
export async function captureGameScreenshot(canvas: HTMLCanvasElement, hud: HTMLElement | null): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  // At the size the player sees it (CSS pixels × the device pixel ratio), not the 3D canvas's backing
  // store (the quality governor may render it smaller and scale it up).
  const base = canvas.getBoundingClientRect();
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? Math.min(devicePixelRatio, 3) : 1;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round((base.width || canvas.width) * dpr));
  out.height = Math.max(1, Math.round((base.height || canvas.height) * dpr));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  // The game view first, while this frame's pixels are still in the drawing buffer.
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  if (hud && base.width > 0 && base.height > 0) {
    const sx = out.width / base.width;
    const sy = out.height / base.height;
    const r = hud.getBoundingClientRect();
    try {
      const img = await hudImage(hud, Math.round(r.width), Math.round(r.height));
      if (img) ctx.drawImage(img, (r.left - base.left) * sx, (r.top - base.top) * sy, r.width * sx, r.height * sy);
    } catch {
      /* the HUD layer is best effort */
    }
  }
  return new Promise((resolve) => {
    try {
      out.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
