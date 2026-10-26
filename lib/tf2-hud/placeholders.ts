/**
 * Plausible stand-ins for the `%variables%` a HUD file names but the preview has
 * no data for. A named fixture (`varsFromState`) always wins; this is the
 * fallback, so a label shows something that reads like the real thing — a time
 * where the name says time, a count where it says count — instead of `%raw_name%`.
 */

const CLASS_NAMES = [
  'Scout',
  'Soldier',
  'Pyro',
  'Demoman',
  'Heavy',
  'Engineer',
  'Medic',
  'Sniper',
  'Spy',
];

const words = (name: string): string =>
  name
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** A stable pseudo-random integer in [lo, hi] derived from the name, so values do not flicker between renders. */
function pick(name: string, lo: number, hi: number): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return lo + (Math.abs(h) % (hi - lo + 1));
}

const withCommas = (n: number) => n.toLocaleString('en-US');

export function placeholderFor(rawName: string): string {
  const name = rawName.toLowerCase();

  let m = /^classrecord(\d+)(value|label)$/.exec(name);
  if (m) {
    const n = Number(m[1]);
    return m[2] === 'label'
      ? CLASS_NAMES[(n - 1) % CLASS_NAMES.length]
      : withCommas(pick(name, 1, 9999));
  }
  m = /^classbarlabel(\d+)/.exec(name);
  if (m) return CLASS_NAMES[(Number(m[1]) - 1) % CLASS_NAMES.length];
  m = /^num(scout|soldier|pyro|demoman|heavy|engineer|medic|sniper|spy)$/.exec(name);
  if (m) return String(pick(name, 0, 3));
  if (name.startsWith('stat_')) return withCommas(pick(name, 100, 4800));

  if (/(^|_)(time|timer|countdown|timeleft|duration)(_|$)|time$/.test(name)) {
    return `${pick(name, 0, 9)}:${String(pick(name + 's', 0, 59)).padStart(2, '0')}`;
  }
  if (/price|cost|credits|currency|money|bonus/.test(name)) return withCommas(pick(name, 50, 1500));
  if (/health/.test(name)) return String(pick(name, 25, 125));
  if (/percent|pct|ratio/.test(name)) return `${pick(name, 5, 95)}%`;
  if (/(^|_)(level|rank|tier)$/.test(name)) return String(pick(name, 1, 100));
  if (
    /(^|_)(page|curpage|slot|index|num|number|count|total|points|score|kills|deaths|wave|quantity|respec|quantity)/.test(
      name,
    ) ||
    /(count|score|points|number|total)$/.test(name)
  ) {
    return String(pick(name, 1, 30));
  }
  if (/(player|user|killer|victim|scorer|nemesis|target)name|^username$|^name$/.test(name))
    return 'Player';
  if (/mapname/.test(name)) return 'cp_dustbowl';
  if (/maptype|gametype|gamemode/.test(name)) return 'Control Points';
  if (/item.*name|itemname|collectionname/.test(name)) return 'Item Name';
  if (/team.*name|redteamname/.test(name)) return name.includes('blue') ? 'BLU' : 'RED';
  if (/ellipses/.test(name)) return '...';
  // Anything else: the name itself, readable ("rank_possibility" → "Rank Possibility").
  return words(rawName);
}
