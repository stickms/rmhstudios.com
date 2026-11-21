/**
 * The DeepSeek models the site calls, in one place. Every DeepSeek request in
 * the codebase takes its model id (and thinking switch) from here.
 *
 * DeepSeek's API (api-docs.deepseek.com, checked 2026-11-20) lists two models:
 * `deepseek-flash` (served by DeepSeek-V4.1-Flash) and `deepseek-v4-pro`.
 * `deepseek-chat` / `deepseek-reasoner` are retired names, and `deepseek-v4-flash`
 * is still accepted but served by V4.1-Flash. Reasoning is no longer a separate
 * model: it is the request field `thinking: { type: 'enabled' | 'disabled' }`,
 * and it is ON by default. A call that does not switch it off pays for hidden
 * chain-of-thought tokens and has its temperature ignored, which is why every
 * call spreads one of the two profiles below rather than naming a model.
 *
 *   DEEPSEEK_FLASH      thinking off: chat, bots, moderation, summaries, JSON.
 *   DEEPSEEK_REASONING  thinking on: the calculator's Reasoner mode, the email
 *                       designer's detailed mode, anything that shows its work.
 *
 * Env: `DEEPSEEK_FLASH_MODEL` and `DEEPSEEK_REASONING_MODEL` retarget them
 * without a deploy (e.g. reasoning on `deepseek-v4-pro`). They are the only
 * DeepSeek model knobs; the old per-feature ones are gone.
 *
 * Usage with the OpenAI SDK: `create({ ...DEEPSEEK_FLASH, messages, ... })`.
 * The SDK sends unknown fields through in the body, which is how DeepSeek
 * documents passing `thinking`.
 *
 * Plain module (not `.server`): the Discord bot and the scripts import it by
 * relative path. It only reads the environment, guarded for a browser.
 */

export interface DeepseekProfile {
  readonly model: string;
  readonly thinking: {
    readonly type: 'enabled' | 'disabled';
  };
}

function env(name: string): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env?.[name];
  return value?.trim() || undefined;
}

/** DeepSeek's fast model, as the API names it today. */
export const DEEPSEEK_FLASH_DEFAULT = 'deepseek-flash';
/** DeepSeek's larger model (RMHVibe's "DeepSeek Pro" choice only). */
export const DEEPSEEK_PRO_MODEL = 'deepseek-v4-pro';

/** Thinking off. The default for everything. */
export const DEEPSEEK_FLASH: DeepseekProfile = {
  model: env('DEEPSEEK_FLASH_MODEL') ?? DEEPSEEK_FLASH_DEFAULT,
  thinking: {
    type: 'disabled',
  },
};

/** Thinking on, for work whose quality depends on reasoning first. */
export const DEEPSEEK_REASONING: DeepseekProfile = {
  model: env('DEEPSEEK_REASONING_MODEL') ?? DEEPSEEK_FLASH_DEFAULT,
  thinking: {
    type: 'enabled',
  },
};

/**
 * Just the `thinking` field of a profile, for a request that names its model
 * another way. Spread it (`...deepseekThinking(DEEPSEEK_FLASH)`): the OpenAI SDK
 * types do not declare the field, and a spread is not excess-property checked.
 */
export function deepseekThinking(profile: DeepseekProfile): Pick<DeepseekProfile, 'thinking'> {
  return {
    thinking: profile.thinking,
  };
}
