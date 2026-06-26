// ─── Story Bible ──────────────────────────────────────────────────────────────
// The authoritative, immutable fact sheet for a world, rendered as hard
// constraints injected at the top of every generation prompt. This is what stops
// the model renaming characters, drifting their voice, or contradicting facts.

import type { GeneratedWorld } from './world-types';

export function renderBible(world: GeneratedWorld): string {
  const cast = world.characters.map((c) =>
    `- id=${c.id} | NAME=${c.name} (${c.fullName}) | ${c.pronouns} | age ${c.age} | ` +
    `${c.archetype}, ${c.role}. Voice: ${c.speechStyle} Personality: ${c.personality} ` +
    `Secret: ${c.secret} Fear: ${c.fear} Dream: ${c.dream}`,
  ).join('\n');
  return (
    `STORY BIBLE (authoritative — these facts are FIXED):\n` +
    `TITLE: "${world.title}". PREMISE: ${world.premise}\n` +
    `SETTING: ${world.setting}\n` +
    `TONE: ${world.toneTags.join(', ')}. MOTIFS: ${world.motifs.join(', ')}.\n` +
    `PLAYER (the MC, written in second person): ${world.mc.premise}\n` +
    `CAST (refer to characters ONLY by these exact names and ids):\n${cast}\n` +
    `ALLOWED environments: ${world.environments.join(', ')}.\n` +
    `RULES: Never rename a character. Never change a character's pronouns, age, or ` +
    `established secret/fear. Keep each character flawlessly in their established voice. ` +
    `Never contradict an established fact from the bible or the story-so-far. ` +
    `Never assume the player's name or gender — address them by the literal token {mc} ` +
    `and use {they}/{them}/{their} for their pronouns.`
  );
}
