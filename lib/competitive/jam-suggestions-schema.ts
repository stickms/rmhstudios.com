/** Zod schema for suggesting a theme (s15-13). Server-side only; client code imports types from the contract. */
import { z } from 'zod';
import { SUGGESTION_MAX } from './jam-suggestions';

/** Bounds are re-checked by `normaliseSuggestion` after control characters are stripped. */
export const suggestThemeSchema = z.object({
  text: z.string().max(SUGGESTION_MAX * 3),
});
