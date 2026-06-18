/**
 * Shared event types for the RMHVibe generation stream (server → client SSE).
 * Client-safe (no server-only imports).
 */

/** Provider behind a model. Each maps to an OpenAI-compatible API (see vibe.server.ts). */
export type VibeProvider = 'kimi' | 'deepseek';

/**
 * A selectable generation model. Each key spans a provider + model tier; the
 * server maps it to a concrete model ID and the right API client (see
 * vibe.server.ts). Kimi (Moonshot) is the default provider; DeepSeek is kept as
 * an option.
 */
export type VibeModel = 'kimi-k2' | 'kimi-k2-turbo' | 'deepseek-flash' | 'deepseek-pro';

export type VibeModelMeta = {
  label: string;
  hint: string;
  provider: VibeProvider;
};

/** Display metadata for each model, used by the model dropdown. */
export const VIBE_MODEL_META: Record<VibeModel, VibeModelMeta> = {
  'kimi-k2': { label: 'Kimi K2 Code', hint: 'Higher quality', provider: 'kimi' },
  'kimi-k2-turbo': { label: 'Kimi K2 Code Turbo', hint: 'Faster', provider: 'kimi' },
  'deepseek-flash': { label: 'DeepSeek Flash', hint: 'Faster', provider: 'deepseek' },
  'deepseek-pro': { label: 'DeepSeek Pro', hint: 'Higher quality', provider: 'deepseek' },
};

export const VIBE_MODELS = Object.keys(VIBE_MODEL_META) as VibeModel[];

/** Human-friendly provider names + the order they appear in the dropdown. */
export const VIBE_PROVIDER_LABELS: Record<VibeProvider, string> = {
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
};
export const VIBE_PROVIDER_ORDER: readonly VibeProvider[] = ['kimi', 'deepseek'];

export const DEFAULT_VIBE_MODEL: VibeModel = 'kimi-k2-turbo';

/** Narrow an untrusted value to a VibeModel, falling back to the default. */
export function asVibeModel(value: unknown): VibeModel {
  return typeof value === 'string' && value in VIBE_MODEL_META
    ? (value as VibeModel)
    : DEFAULT_VIBE_MODEL;
}

export type VibeStreamEvent =
  | { type: 'thinking'; text: string } // reasoning_content delta from the model
  | { type: 'content'; text: string } // answer (HTML) delta — used for progress
  | { type: 'done'; slug: string; versionId: string; html: string; title: string; description: string } // persisted result
  | { type: 'error'; message: string };
