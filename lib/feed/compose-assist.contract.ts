/**
 * Contracts for the feed's AI helpers and composer posts (redesign audit C1,
 * batch 8): ask the feed, AI search, hashtag/bio/reply suggestions, the
 * "rewrite" actions, AI drafts and images, threads, and the post edit.
 * Client-safe: types only, by `import type`.
 *
 * Not here on purpose: the streamed (`stream: true`) half of /api/ai/transform.
 * The multipart image upload is `lib/media/upload.contract.ts`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedItem } from '@/lib/feed-types';
import type { CreateRMHarkInput } from '@/lib/rmhark-schema';
import type { SearchResponse, SearchTab } from '@/lib/search/types';

/** An answer grounded in recent public posts. 503 when AI is not configured. */
export const askFeedApi = endpoint<{
  body: { question: string };
  res: { answer: string; sourceCount?: number };
}>()({ method: 'POST', path: '/api/ai/ask-feed' });

/** A natural-language answer over the search results. */
export const aiSearchApi = endpoint<{
  body: { q: string };
  res: { answer: string; sourceCount: number };
}>()({ method: 'POST', path: '/api/ai/search' });

/** Up to four hashtags for a draft. Fail-soft: an unconfigured model answers `[]`. */
export const suggestTagsApi = endpoint<{
  body: { text: string };
  res: { tags: string[] };
}>()({ method: 'POST', path: '/api/ai/suggest-tags' });

export type BioTone = 'friendly' | 'professional' | 'funny';

/** A drafted profile bio; `bio` is '' when there is nothing to write from. */
export const draftBioApi = endpoint<{
  body: { tone: BioTone; maxChars: number };
  res: { bio: string };
}>()({ method: 'POST', path: '/api/ai/bio' });

export type ComposeTransformAction = 'improve' | 'expand' | 'shorten' | 'casual' | 'formal' | 'fix';

/** The blocking half of the rewrite endpoint (no `stream`). */
export const transformTextApi = endpoint<{
  body: { text: string; action: ComposeTransformAction };
  res: { text: string };
}>()({ method: 'POST', path: '/api/ai/transform' });

/** Three one-tap replies for a DM conversation. */
export const smartRepliesApi = endpoint<{
  body: { conversationId: string };
  res: { replies: string[] };
}>()({ method: 'POST', path: '/api/ai/smart-replies' });

/** Draft a post, a reply, or an announcement title/body. The draft is optional context. */
export type AiGenerateRequest =
  | { mode: 'post'; draft?: string | undefined }
  | { mode: 'reply'; rmharkId: string; parentId?: string | undefined; draft?: string | undefined }
  | { mode: 'announcement-title'; title?: string | undefined; body?: string | undefined }
  | { mode: 'announcement-body'; title?: string | undefined; body?: string | undefined };

export const aiGeneratePostApi = endpoint<{
  body: AiGenerateRequest;
  res: { content: string };
}>()({ method: 'POST', path: '/api/rmharks/ai-generate' });

/** HARD-R and above. Returns a re-hosted feed image URL. */
export const aiGenerateImageApi = endpoint<{
  body: { draft?: string | undefined };
  res: { url: string };
}>()({ method: 'POST', path: '/api/rmharks/ai-image' });

/**
 * Publish a post. Answers 201 with the new FeedItem (the route may also hold a post
 * for review, 202). Safe to replay: the route is idempotency-keyed for the offline outbox.
 */
export const createRMHarkApi = endpoint<{ body: CreateRMHarkInput; res: FeedItem }>()({
  method: 'POST',
  path: '/api/rmharks',
});

/** Create an authored thread (2-25 segments); answers 201 with the root as a FeedItem. */
export const createThreadApi = endpoint<{
  body: { segments: string[] };
  res: FeedItem;
}>()({ method: 'POST', path: '/api/rmharks/thread' });

/** Edit a post's text and GIF. */
export const editPostApi = endpoint<{
  body: { content: string; gifUrl: string | null };
  res: { success: true; content: string; gifUrl?: string; editedAt: string | null };
}>()({ method: 'PATCH', path: '/api/rmharks/$id' });

/** Universal search; `tab` defaults to `top` on the route; `assist: '1'` permits the model-assisted retry. */
export const universalSearchApi = endpoint<{
  query: { q: string; tab?: SearchTab | undefined; assist?: '1' | undefined };
  res: SearchResponse;
}>()({ method: 'GET', path: '/api/search' });
