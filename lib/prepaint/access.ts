import {
  ACCESS_KEY,
  CAPTION_BG_CSS,
  CAPTION_SCALE,
  QUIET_HOURS_KEY,
  SPACING_VARS,
} from '../access/prefs';
import type { PrepaintCtx } from './types';

const has = (o: object, k: unknown): boolean =>
  Object.prototype.hasOwnProperty.call(o, k as string);

/** Pre-paint text spacing, caption style and bedtime mode (twin of `applyAccessPrefs`, lib/access/prefs). */
export function accessStep({ html: h }: PrepaintCtx): void {
  const r = localStorage.getItem(ACCESS_KEY);
  if (!r) return;
  const p = JSON.parse(r) || {};
  const s = h.style;
  if (has(SPACING_VARS, p.spacing)) {
    const v = SPACING_VARS[p.spacing as keyof typeof SPACING_VARS];
    h.setAttribute('data-text-spacing', p.spacing);
    s.setProperty('--rmh-ts-lh', v.lh);
    s.setProperty('--rmh-ts-ls', v.ls);
    s.setProperty('--rmh-ts-ws', v.ws);
  }
  if (has(CAPTION_SCALE, p.captionSize))
    s.setProperty('--rmh-cue-scale', CAPTION_SCALE[p.captionSize as keyof typeof CAPTION_SCALE]);
  if (has(CAPTION_BG_CSS, p.captionBg))
    s.setProperty('--rmh-cue-bg', CAPTION_BG_CSS[p.captionBg as keyof typeof CAPTION_BG_CSS]);
  if (p.bedtime === true) {
    const q = (localStorage.getItem(QUIET_HOURS_KEY) || '').split(',');
    const a = +q[0];
    const b = +q[1];
    if (q.length === 2 && a !== b) {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      if (a < b ? m >= a && m < b : m >= a || m < b) h.setAttribute('data-bedtime', '1');
    }
  }
}
