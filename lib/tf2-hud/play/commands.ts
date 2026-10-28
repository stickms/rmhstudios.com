/**
 * What clicking a HUD button does in Play mode. A button's `command` is a console command the game would
 * run; most of the ones in the default HUD close a dialog or open another screen, which this maps to the
 * editor's pages. Anything else is reported, not guessed at.
 */

import type { Team, Tf2Class } from '../fixtures';

export type PlayAction =
  | { type: 'back' }
  | { type: 'page'; page: string }
  | { type: 'team'; team: Team | null; then: string }
  | { type: 'class'; cls: Tf2Class }
  | { type: 'unknown'; raw: string };

/** Commands that dismiss whatever is open. */
const BACK = new Set([
  'close',
  'cancel',
  'vguicancel',
  'cancelmenu',
  'back',
  'done',
  'okay',
  'ok',
  'continue',
  'accept',
  'confirm',
  'user_close',
  'dismiss_joining_result',
  'doneselectingitems',
]);

/** Commands that open another screen. */
const PAGE: Record<string, string> = {
  openloadout: 'loadout',
  open_charinfo: 'loadout',
  characterloadout: 'loadout',
  tauntloadout: 'loadout',
  openachievementsdialog: 'achievements',
  open_store: 'store',
  intro: 'intro',
  showteammenu: 'teammenu',
  changeteam: 'teammenu',
  changeclass: 'classselect',
  open_backpack: 'backpack',
  show_preview: 'inspect',
  preview_item: 'inspect',
};

/** `select N` on the class screen. */
export const CLASS_BY_SELECT: Record<number, Tf2Class> = {
  1: 'scout',
  2: 'sniper',
  3: 'soldier',
  4: 'demoman',
  5: 'medic',
  6: 'heavy',
  7: 'pyro',
  8: 'spy',
  9: 'engineer',
};

export function interpretCommand(raw: string | undefined): PlayAction {
  const text = (raw ?? '').trim().toLowerCase();
  // `engine foo` runs `foo` in the game console.
  const [cmd = '', ...args] = text.replace(/^engine\s+/, '').split(/\s+/);
  if (!cmd) return { type: 'unknown', raw: raw ?? '' };
  if (BACK.has(cmd)) return { type: 'back' };
  if (cmd === 'jointeam') {
    const team = args[0];
    if (team === 'spectate') return { type: 'page', page: 'spectator' };
    return {
      type: 'team',
      team: team === 'red' || team === 'blue' ? team : null,
      then: 'classselect',
    };
  }
  if (cmd === 'select') {
    const cls = CLASS_BY_SELECT[Number(args[0])];
    if (cls) return { type: 'class', cls };
  }
  const page = PAGE[cmd];
  if (page) return { type: 'page', page };
  return { type: 'unknown', raw: raw ?? '' };
}
