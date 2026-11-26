/** Contracts for theme suggestions (s15-13). Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';

export interface MySuggestionView {
  id: string;
  text: string;
  createdAt: string;
  /** True only once the vote has opened; never before (it would show the shortlist early). */
  shortlisted: boolean;
}

export interface AdminSuggestionGroup {
  /** The text as first suggested. */
  text: string;
  /** How many members suggested this same text (ignoring case). */
  count: number;
  suggesters: { id: string; name: string }[];
  onShortlist: boolean;
}

export interface JamSuggestionsView {
  /** Suggestions are being taken now. */
  open: boolean;
  limit: number;
  mine: MySuggestionView[];
  /** Admins only; null for everyone else. */
  all: AdminSuggestionGroup[] | null;
}

/** The viewer's own suggestions and, for an admin, every suggestion grouped by text. Never cached. */
export const getJamSuggestionsApi = endpoint<{
  params: { slug: string };
  res: { view: JamSuggestionsView };
}>()({ method: 'GET', path: '/api/jams/$slug/suggestions' });

/** Suggest a theme (up to three per jam, before the vote opens). */
export const suggestJamThemeApi = endpoint<{
  params: { slug: string };
  body: { text: string };
  res: { suggestion: MySuggestionView };
}>()({ method: 'POST', path: '/api/jams/$slug/suggestions' });

/** Withdraw one of your own suggestions while suggestions are open. */
export const withdrawJamSuggestionApi = endpoint<{
  params: { slug: string; id: string };
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/jams/$slug/suggestions/$id' });
