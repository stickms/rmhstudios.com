// ─── Scriptwriting Craft Module ───────────────────────────────────────────────
// The "scriptwriting skill" for DeepSeek: a reusable block of screenwriting craft
// injected on chapter generation so prose is dramatically shaped, not just
// continuous. Pairs with the bible (constraints) and outline (structure).

export const CRAFT_SYSTEM =
  'CRAFT RULES — write like a master visual-novel dramatist:\n' +
  '- Every scene has a GOAL, a CONFLICT, and a TURN; nothing is filler.\n' +
  '- Convey feeling through SUBTEXT, action, and specific sensory detail — never on-the-nose exposition.\n' +
  '- Keep each character in their established VOICE from the bible; let their secret/fear quietly drive them.\n' +
  '- PLANT and PAY OFF: honor the setups and payoffs the outline assigns this chapter; call back to earlier moments.\n' +
  '- The player\'s recent CHOICES must visibly echo — characters remember and react to what the player did.\n' +
  '- Earn every emotional beat; avoid melodrama, clichés, and tidy resolutions that the story has not paid for.';

export const VN_FORMAT =
  'VISUAL-NOVEL FORMAT & PACING:\n' +
  '- Keep scenes tight and moving — every scene earns its place; cut anything that wanders.\n' +
  '- Balance the registers: narration (speaker=null), the player\'s inner thoughts (speaker=null), and spoken lines (cast ids, or "mc" for the player aloud). Never stack many narration nodes in a row.\n' +
  '- End every scene — and the chapter — on a hook, a turn, or an unresolved beat that pulls the reader onward.\n' +
  '- Let emotion shift line to line and LAND on beats; do not hold one flat emotion across a scene.\n' +
  '- Vary which characters are present and who speaks; avoid long two-character talking-heads stretches.\n' +
  '- Reveal through scene, not summary — no info-dumps; trust the reader.';

export const PROSE_CRAFT =
  'PROSE:\n' +
  '- Prefer concrete, sensory verbs and nouns over adjectives and abstraction.\n' +
  '- Ban stock/clichéd phrasing (e.g. "a single tear", "little did they know", "time seemed to stop", "a breath they didn\'t know they were holding").\n' +
  '- Give each character a DISTINCT diction, rhythm, and vocabulary per their bible voice — two characters must never phrase things the same way.\n' +
  '- Restraint over melodrama; understate the biggest moments. No purple prose.\n' +
  '- Vary imagery and sentence shapes — do not keep reaching for the same words, images, or constructions.';

export const SETTING_CRAFT =
  'SETTING & WORLDBUILDING:\n' +
  '- Build a coherent, lived-in sense of place: specific textures, routines, sounds, and small details that imply a world beyond the frame.\n' +
  '- Give the world an internal logic and honor it consistently.\n' +
  '- Ground emotion in sensory specificity tied to THIS place, not a generic backdrop.\n' +
  '- Choose motifs that belong to this world and let them recur meaningfully.\n' +
  '- Keep tone and genre consistent, flexing to the player\'s prompt without breaking the emotional, character-driven romance/drama frame.';

export const CHOICE_CRAFT =
  'CHOICES:\n' +
  '- The 2–3 options must be genuinely different MOVES — distinct content AND consequence, never reworded versions of one another.\n' +
  '- Each option\'s "direction" must be materially distinct (a different thing the player actually does).\n' +
  '- Include occasional bad or costly options that damage a bond — not every choice is safe.';

export const ANTI_REPETITION =
  'NO REPETITION:\n' +
  '- Never restate a line, image, or sentiment already used earlier in THIS chapter; every node must advance, not echo.\n' +
  '- Never reuse a line, exchange, image, or beat from the STORY SO FAR (the ledger and earlier chapters).\n' +
  '- Once you have made a point, move on — do not have characters circle back to re-say it.';

export function craftDirectives(): string {
  return (
    'Honor this chapter\'s outline beat: plant its setups, deliver its payoffs, and answer/raise its dramatic question. ' +
    'Make the player\'s recent choices echo in how characters treat the MC.'
  );
}
