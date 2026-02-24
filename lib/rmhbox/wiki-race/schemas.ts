/**
 * Wiki-Race — Zod Validation Schemas
 *
 * Input validation for navigation and back-navigation actions.
 */

import { z } from 'zod';
import { WR_MIN_PATH, WR_MAX_PATH } from '../constants';

/** Schema for navigating to a new article via a wiki link. */
export const NavigateSchema = z.object({
  targetTitle: z.string().min(1).max(300).transform((s) => s.trim()),
});

/** Schema for navigating back to a previous article in the path. */
export const GoBackSchema = z.object({
  targetTitle: z.string().min(1).max(300),
  pathIndex: z.number().int().min(0),
});

/** Schema for validating article references in data files. */
export const WikiArticleRefSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string(),
  thumbnail: z.string().optional(),
});

/** Schema for validating article pair data entries. */
export const ArticlePairSchema = z.object({
  id: z.string(),
  startArticle: WikiArticleRefSchema,
  targetArticle: WikiArticleRefSchema,
  optimalPathLength: z.number().int().min(WR_MIN_PATH).max(WR_MAX_PATH),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()),
});
