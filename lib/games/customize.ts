/**
 * Profile customization as pure rules: what crafting a badge unlocks (a background
 * and emoticons for its title, frames at badge levels 3 and 5), validating a member's
 * choice against what they own, and turning `:title-motif:` tokens into emoticons.
 * Everything is drawn from the title's hue, so there is no art to author. Client-safe.
 */

export const EMOTE_MOTIFS = ['circle', 'triangle', 'diamond', 'hex', 'star', 'ring'] as const;
export type EmoteMotif = (typeof EMOTE_MOTIFS)[number];

export const FRAME_LEVELS = [3, 5] as const;

export type Unlocks = { backgrounds: string[]; frames: string[]; emoteTitles: string[] };

export function unlocksFromBadges(badges: readonly { gameId: string; foil: boolean; level: number }[]): Unlocks {
  const backgrounds = new Set<string>();
  const frames = new Set<string>();
  const titles = new Set<string>();
  for (const b of badges) {
    titles.add(b.gameId);
    backgrounds.add(`bg:${b.gameId}`);
    if (b.foil) backgrounds.add(`bg:${b.gameId}:foil`);
    for (const lv of FRAME_LEVELS) if (!b.foil && b.level >= lv) frames.add(`frame:${b.gameId}:${lv}`);
  }
  const order = (s: Set<string>) => [...s].sort();
  return { backgrounds: order(backgrounds), frames: order(frames), emoteTitles: order(titles) };
}

export function parseBackground(key: string): { gameId: string; foil: boolean } | null {
  if (!key.startsWith('bg:')) return null;
  const rest = key.slice(3);
  const foil = rest.endsWith(':foil');
  const gameId = foil ? rest.slice(0, -5) : rest;
  return gameId ? { gameId, foil } : null;
}

export function parseFrame(key: string): { gameId: string; level: 3 | 5 } | null {
  const m = /^frame:(.+):(3|5)$/.exec(key);
  return m ? { gameId: m[1], level: Number(m[2]) as 3 | 5 } : null;
}

/** The member's choice, with anything they do not own turned into "none". */
export function cleanLook(
  input: { background: unknown; frame: unknown },
  owned: Unlocks,
): { background: string | null; frame: string | null } {
  const bg = typeof input.background === 'string' && owned.backgrounds.includes(input.background) ? input.background : null;
  const fr = typeof input.frame === 'string' && owned.frames.includes(input.frame) ? input.frame : null;
  return { background: bg, frame: fr };
}

export const emoteToken = (gameId: string, motif: EmoteMotif) => `:${gameId}-${motif}:`;

export type EmoteSegment = { type: 'text'; text: string } | { type: 'emote'; gameId: string; motif: EmoteMotif };

const TOKEN = new RegExp(`:([a-z0-9][a-z0-9-]*)-(${EMOTE_MOTIFS.join('|')}):`, 'g');

/** Split text into text and emotes; a token is an emote only for a title the author owns. */
export function splitEmotes(text: string, ownedTitles: ReadonlySet<string>): EmoteSegment[] {
  const out: EmoteSegment[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev?.type === 'text') prev.text += t;
    else out.push({ type: 'text', text: t });
  };
  for (const m of text.matchAll(TOKEN)) {
    const index = m.index ?? 0;
    if (!ownedTitles.has(m[1])) continue; // not theirs: stays as typed
    push(text.slice(last, index));
    out.push({ type: 'emote', gameId: m[1], motif: m[2] as EmoteMotif });
    last = index + m[0].length;
  }
  push(text.slice(last));
  return out;
}
