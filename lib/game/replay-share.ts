/** Where "Post it" goes for a saved replay: the composer, through `/share`, with the text and the replay page. */

/** The public address of a replay page. */
export const replayPageUrl = (origin: string, id: string) => `${origin.replace(/\/+$/, '')}/replays/${id}`;

/** The `/share` search that opens the composer with `text` and the replay link filled in (no stashed payload, so `pending` is empty). */
export function replayShareSearch(input: { text: string; origin: string; id: string }) {
  return { title: '', text: input.text.trim(), url: replayPageUrl(input.origin, input.id), pending: '' };
}
