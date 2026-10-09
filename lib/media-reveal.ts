/**
 * Images fade in when their bytes arrive, instead of snapping in.
 *
 * On a slow connection the page's text and layout paint long before its images
 * do — the default avatar alone landed ~5s after first paint on a 3G profile —
 * and every image then appeared in a single frame, scattered across a page the
 * reader was already reading. That is the "pop-in" this removes, site-wide and
 * without touching a single `<img>` call site.
 *
 * How, and why this way:
 *
 *  - `MEDIA_REVEAL_SCRIPT` runs in <head>, before any <img> exists, and installs
 *    ONE capture-phase `load`/`error` listener on the document (load events do
 *    not bubble, but they do capture). It marks each image `data-loaded` as it
 *    finishes — server-rendered, hydrated, lazy and client-inserted alike —
 *    and stamps `html.media-reveal` to say the marking is live.
 *  - globals.css keeps an unmarked image at opacity 0 and fades it to 1 when the
 *    mark lands. Opacity only: it never changes layout, so it cannot shift
 *    anything (images reserve their box with width/height or aspect-ratio).
 *
 * Fails open, everywhere: no JavaScript → no `media-reveal` class → images show
 * normally. `error` marks too, so a broken image still shows its alt text.
 * Reduced motion (OS or the site setting) → no hiding at all. The page's LCP
 * image (`fetchpriority="high"`) is never hidden. An image with no `src` (which
 * would never fire `load`) is never hidden. Any image can opt out with
 * `data-no-reveal`.
 */
export const MEDIA_REVEAL_SCRIPT = `(function(){try{var d=document,m=function(e){var t=e.target;if(t&&t.tagName==="IMG"&&!t.hasAttribute("data-loaded"))t.setAttribute("data-loaded","")};d.addEventListener("load",m,true);d.addEventListener("error",m,true);d.documentElement.classList.add("media-reveal")}catch(e){}})()`;
