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

export function craftDirectives(): string {
  return (
    'Honor this chapter\'s outline beat: plant its setups, deliver its payoffs, and answer/raise its dramatic question. ' +
    'Make the player\'s recent choices echo in how characters treat the MC.'
  );
}
