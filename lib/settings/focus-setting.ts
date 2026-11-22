/**
 * Take someone to one setting and make it obvious which: scroll it into view, then give it a brief, low-contrast tint
 * that fades out (`.setting-target` in app/styles/setting-focus.css). Used when a profile block's "edit" link lands on
 * the settings page with `#<id>` in the URL.
 *
 * The target may not exist yet (lazy sections, data still loading), so this looks for it a few times, 80 ms apart, and
 * gives up quietly after about two seconds. It is a short timeout chain, never a frame loop.
 */
const TRIES = 25;
const STEP_MS = 80;
const HOLD_MS = 450;

/** The element to tint: the setting's own block (the id's parent when the id is on a control), else the element. */
function blockOf(el: HTMLElement): HTMLElement {
  return el.matches('input, textarea, select, button') ? (el.parentElement ?? el) : el;
}

export function focusSetting(id: string): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tries = 0;
  const attempt = () => {
    const el = document.getElementById(id);
    if (!el) {
      if (++tries < TRIES) timer = setTimeout(attempt, STEP_MS);
      return;
    }
    const block = blockOf(el);
    block.classList.add('setting-target');
    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    block.dataset.flash = '';
    // Hold the tint while the scroll settles, then let the CSS transition fade it.
    timer = setTimeout(() => {
      delete block.dataset.flash;
    }, HOLD_MS);
  };
  attempt();
  return () => {
    if (timer) clearTimeout(timer);
  };
}
