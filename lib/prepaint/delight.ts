import { FOOLS_FLAG_KEY, FOOLS_OFF_KEY, SEASONS } from '../delight/season';
import type { PrepaintCtx } from './types';

/** Z1 seasonal accent class + Z8 April Fools class, on <html> before first paint. */
export function delightStep({ html }: PrepaintCtx): void {
  const d = new Date();
  const k = (d.getMonth() + 1) * 100 + d.getDate();
  for (let i = 0; i < SEASONS.length; i++) {
    const a = SEASONS[i].from;
    const b = SEASONS[i].to;
    if (a <= b ? k >= a && k <= b : k >= a || k <= b) {
      html.classList.add('season-' + SEASONS[i].name);
      break;
    }
  }
  if (localStorage.getItem(FOOLS_FLAG_KEY) === '1' && localStorage.getItem(FOOLS_OFF_KEY) !== '1')
    html.classList.add('fools');
}
