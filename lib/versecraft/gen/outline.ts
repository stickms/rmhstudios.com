// ─── Arc Outline builders ─────────────────────────────────────────────────────
// Deterministic Tier-1 (skeleton) and Tier-2 (detailed) outlines derived from the
// world's route plan. The AI generator (generate.server.ts) may replace the
// detailed version, but these fallbacks guarantee a coherent arc with no network.

import type { GeneratedWorld, ArcOutline, ActPlan, ChapterBeat, StoryBeat } from './world-types';

/** The act a 0-based chapter index belongs to, mirroring fallback.beatForIndex. */
function actForIndex(world: GeneratedWorld, index: number): { beat: StoryBeat; act: number } {
  const beats = world.routePlan.beats;
  const ratio = index / Math.max(1, world.routePlan.totalChapters);
  const beat = beats[Math.min(beats.length - 1, Math.floor(ratio * beats.length))];
  return { beat, act: beat.act };
}

/** Tier-1: one ActPlan per act + a coarse per-chapter beat (no plant/payoff). */
export function buildSkeletonOutline(world: GeneratedWorld): ArcOutline {
  const { actCount, beats } = world.routePlan;
  const acts: ActPlan[] = [];
  for (let act = 1; act <= actCount; act++) {
    const actBeats = beats.filter((b) => b.act === act);
    const goal = actBeats.map((b) => b.title).join(' → ') || `act ${act}`;
    const endpoint = actBeats[actBeats.length - 1]?.emotionalGoal ?? 'a turning point';
    const focusArc = actBeats[0]?.focus[0] ?? world.characters[0]?.id ?? 'the cast';
    acts.push({ act, goal, endpoint, focusArc });
  }
  const chapters: ChapterBeat[] = [];
  for (let index = 0; index < world.routePlan.totalChapters; index++) {
    const { beat, act } = actForIndex(world, index);
    chapters.push({
      index,
      act,
      dramaticQuestion: `Will this chapter land "${beat.emotionalGoal}"?`,
      plant: [],
      payoff: [],
      intent: beat.emotionalGoal,
    });
  }
  return { acts, chapters, source: 'fallback' };
}

/** Tier-2: deterministic plant/payoff/intent woven from the beat and cast, so a
 *  no-AI playthrough still has setups that recur and pay off. */
export function buildDetailedOutline(world: GeneratedWorld): ArcOutline {
  const skeleton = buildSkeletonOutline(world);
  const motifs = world.motifs.length ? world.motifs : ['what remains'];
  const chapters = skeleton.chapters.map((beat) => {
    const { beat: storyBeat } = actForIndex(world, beat.index);
    const focusId = storyBeat.focus[0] ?? world.characters[0]?.id ?? 'the cast';
    const focus = world.characters.find((c) => c.id === focusId);
    const motif = motifs[beat.index % motifs.length];
    const plant = beat.act <= 3
      ? [`A small detail about ${focus?.name ?? 'the focus character'} tied to ${motif}.`]
      : [];
    const payoff = beat.act >= 3 && focus
      ? [`Pay off ${focus.name}'s ${focus.secret.replace(/^Secretly /, '').replace(/\.$/, '')}.`]
      : [];
    return {
      ...beat,
      dramaticQuestion: `What does ${focus?.name ?? 'the cast'} risk to reach "${storyBeat.emotionalGoal}"?`,
      plant,
      payoff,
      intent: `${storyBeat.emotionalGoal} — centered on ${focus?.name ?? 'the cast'}, returning to ${motif}.`,
    };
  });
  return { acts: skeleton.acts, chapters, source: 'fallback' };
}

/** The beat for a 0-based chapter index, clamped to the outline's range. */
export function beatForChapter(outline: ArcOutline, index: number): ChapterBeat {
  const clamped = Math.max(0, Math.min(outline.chapters.length - 1, index));
  return outline.chapters[clamped];
}
