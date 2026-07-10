// ─── Non-Repeating Pack Assignment ────────────────────────────────────────────
// Deterministically hands out distinct sprite packs to a generated cast so no
// two characters in a playthrough share a look. Prefers matching the character's
// presentation, then maximizes visual contrast (distinct hair color, then face).

import type { Rng } from '../gen/rng';
import type { Pronouns } from '../gen/world-types';
import { SPRITE_PACKS, type SpritePack, type Presentation } from './registry';

function presentationFor(pronouns: Pronouns): Presentation {
  if (pronouns === 'she/her') return 'feminine';
  if (pronouns === 'he/him') return 'masculine';
  return 'neutral';
}

export class PackAssigner {
  private usedIds = new Set<string>();
  private usedColors = new Set<string>();
  private faceCount = new Map<string, number>();

  /** Pick the best still-distinct pack for a character. */
  assign(rng: Rng, opts: { pronouns: Pronouns; mature?: boolean }): SpritePack {
    const want = presentationFor(opts.pronouns);

    const score = (p: SpritePack): number => {
      let s = 0;
      if (this.usedIds.has(p.id)) s -= 1000;                 // never reuse a pack if avoidable
      if (p.presentation === want) s += 40;
      else if (p.presentation === 'neutral' || want === 'neutral') s += 12;
      else s -= 30;                                          // wrong presentation
      if (opts.mature && p.age === 'mature') s += 25;
      if (!opts.mature && p.age === 'mature') s -= 15;
      if (!this.usedColors.has(p.hairColor)) s += 18;        // distinct hair color
      s -= (this.faceCount.get(p.face) ?? 0) * 8;            // spread across faces
      return s;
    };

    // Rank, then pick randomly among the top few so seeds vary while staying distinct.
    const ranked = rng.shuffle(SPRITE_PACKS)
      .map((p) => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s);
    const topScore = ranked[0].s;
    const top = ranked.filter((r) => r.s >= topScore - 10).map((r) => r.p);
    const chosen = rng.pick(top);

    this.usedIds.add(chosen.id);
    this.usedColors.add(chosen.hairColor);
    this.faceCount.set(chosen.face, (this.faceCount.get(chosen.face) ?? 0) + 1);
    return chosen;
  }
}
