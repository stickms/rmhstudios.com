import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type LadderAiProviderName = 'deepseek' | 'openai' | 'anthropic';

export interface LadderAiProvider {
  name: LadderAiProviderName;
  model: string;
  completeJson(input: { system: string; prompt: string; maxTokens?: number }): Promise<unknown>;
}

export class LadderAiConfigurationError extends Error {
  constructor(readonly provider: LadderAiProviderName) {
    super(`${provider} is not configured for RMH Ladder`);
    this.name = 'LadderAiConfigurationError';
  }
}

function jsonFromModelText(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('AI provider returned no JSON object');
  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

function openAiCompatibleProvider(args: {
  name: 'deepseek' | 'openai';
  apiKey: string | undefined;
  baseURL?: string;
  model: string;
}): LadderAiProvider {
  if (!args.apiKey) throw new LadderAiConfigurationError(args.name);
  const client = new OpenAI({ apiKey: args.apiKey, baseURL: args.baseURL, maxRetries: 1, timeout: 45_000 });
  return {
    name: args.name,
    model: args.model,
    async completeJson({ system, prompt, maxTokens = 2600 }) {
      const response = await client.chat.completions.create({
        model: args.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.1,
        stream: false,
        response_format: { type: 'json_object' },
      });
      return jsonFromModelText(response.choices[0]?.message?.content ?? '');
    },
  };
}

function anthropicProvider(): LadderAiProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LadderAiConfigurationError('anthropic');
  const model = process.env.LADDER_ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });
  return {
    name: 'anthropic',
    model,
    async completeJson({ system, prompt, maxTokens = 2600 }) {
      const response = await client.messages.create({
        model,
        system,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1,
      });
      const text = response.content.find((block) => block.type === 'text');
      return jsonFromModelText(text?.type === 'text' ? text.text : '');
    },
  };
}

export function configuredLadderAiProvider(
  requested: LadderAiProviderName = (process.env.LADDER_AI_PROVIDER as LadderAiProviderName | undefined) ?? 'deepseek',
): LadderAiProvider {
  if (requested === 'deepseek') {
    return openAiCompatibleProvider({
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
      model: process.env.LADDER_DEEPSEEK_MODEL ?? 'deepseek-chat',
    });
  }
  if (requested === 'openai') {
    return openAiCompatibleProvider({
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.LADDER_OPENAI_MODEL ?? 'gpt-4.1-mini',
    });
  }
  if (requested === 'anthropic') return anthropicProvider();
  throw new LadderAiConfigurationError(requested);
}

export function ladderAiProviderConfigured(provider: LadderAiProviderName): boolean {
  if (provider === 'deepseek') return Boolean(process.env.DEEPSEEK_API_KEY);
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

