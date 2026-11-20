// A `fetch` for model clients that both times (timedAiFetch) and meters every
// chat completion into the `AiUsage` ledger.
//
// `runTask`/`streamTask` (provider.server.ts) and RMHVibe meter their own calls,
// but roughly twenty feature modules (the RMHark bots, auto-moderation, the
// Discord bot, the assistant, the calculator, the tutor, …) build their own
// OpenAI-compatible client and were invisible to the ledger: the DeepSeek bill
// could not be broken down by feature. Metering at the fetch layer covers them
// all with a one-line change per client, and counts what was actually billed:
// every attempt, retries included.
//
// Rows are platform rows (`userId` null), so nothing here moves a member's
// monthly AI budget (`lib/ai/budget.server.ts`); the `task` column carries the
// feature label. Labels must not start with `vibe` (that prefix is the vibe
// budget's, `VIBE_TASK_LIKE`).
//
// Never throws into the caller and never delays the response: usage is read
// from a clone (or a tee of a stream) after the response has been handed back.

import {
  aiCallLabel,
  timedAiFetch,
} from './timed-fetch.server';

/** A ledger label for a feature that calls a model outside `runTask`. Max 40 chars. */
export type MeteredFeature =
  | 'rmhark-bot'
  | 'automod'
  | 'discord-bot'
  | 'assistant'
  | 'calculator'
  | 'tutor'
  | 'persona-chat'
  | 'recap'
  | 'summarize-legacy'
  | 'text-assist'
  | 'versecraft'
  | 'daily-puzzle'
  | 'predictions'
  | 'email-ai'
  | 'ladder'
  | 'ladder-legacy';

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  /** DeepSeek's context-cache extension to the usage block. */
  prompt_cache_hit_tokens?: number;
}

interface RequestFacts {
  model: string;
  stream: boolean;
  promptChars: number;
}

/** Model, stream flag and prompt size from a chat-completions JSON body. */
export function requestFacts(
  body: unknown,
): RequestFacts {
  if (
    typeof body !==
    'string'
  )
    return {
      model:
        'unknown',
      stream: false,
      promptChars: 0,
    };
  try {
    const parsed =
      JSON.parse(
        body,
      ) as {
        model?: unknown;
        stream?: unknown;
        messages?: Array<{
          content?: unknown;
        }>;
      };
    const promptChars =
      Array.isArray(
        parsed.messages,
      )
        ? parsed.messages.reduce(
            (
              n,
              m,
            ) =>
              n +
              (typeof m?.content ===
              'string'
                ? m
                    .content
                    .length
                : 0),
            0,
          )
        : 0;
    return {
      model:
        typeof parsed.model ===
        'string'
          ? parsed.model.slice(
              0,
              60,
            )
          : 'unknown',
      stream:
        parsed.stream ===
        true,
      promptChars,
    };
  } catch {
    return {
      model:
        'unknown',
      stream: false,
      promptChars: 0,
    };
  }
}

/**
 * Usage from a buffered SSE stream: the last `usage` block a provider sent, or
 * an estimate (~4 characters per token) from the streamed content when none was.
 */
export function usageFromStream(
  sse: string,
  promptChars: number,
): Required<Usage> {
  let usage: Usage | null =
    null;
  let outChars = 0;
  for (const line of sse.split(
    '\n',
  )) {
    if (
      !line.startsWith(
        'data:',
      )
    )
      continue;
    const data =
      line
        .slice(
          5,
        )
        .trim();
    if (
      !data ||
      data ===
        '[DONE]'
    )
      continue;
    try {
      const chunk =
        JSON.parse(
          data,
        ) as {
          usage?: Usage | null;
          choices?: Array<{
            delta?: {
              content?:
                | string
                | null;
              reasoning_content?:
                | string
                | null;
            };
          }>;
        };
      if (
        chunk.usage
      )
        usage =
          chunk.usage;
      const delta =
        chunk
          .choices?.[0]
          ?.delta;
      outChars +=
        (delta
          ?.content
          ?.length ??
          0) +
        (delta
          ?.reasoning_content
          ?.length ??
          0);
    } catch {
      /* a partial line from an aborted stream */
    }
  }
  return {
    prompt_tokens:
      usage?.prompt_tokens ??
      Math.ceil(
        promptChars /
          4,
      ),
    completion_tokens:
      usage?.completion_tokens ??
      Math.ceil(
        outChars /
          4,
      ),
    prompt_cache_hit_tokens:
      usage?.prompt_cache_hit_tokens ??
      0,
  };
}

async function record(
  feature: MeteredFeature,
  provider: string,
  model: string,
  usage: Usage,
  ok: boolean,
): Promise<void> {
  try {
    // Imported lazily so a client module (and its tests) does not pull Prisma in
    // at import time.
    const {
      recordAiUsage,
    } =
      await import('./provider.server');
    await recordAiUsage(
      {
        userId:
          null,
        task: feature,
        provider,
        model,
        inTokens:
          usage.prompt_tokens ??
          0,
        outTokens:
          usage.completion_tokens ??
          0,
        cacheHitTokens:
          usage.prompt_cache_hit_tokens ??
          0,
        ok,
      },
    );
  } catch (err) {
    console.error(
      '[ai] metered fetch failed to record:',
      (
        err as Error
      )
        ?.message,
    );
  }
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader =
    stream.getReader();
  const decoder =
    new TextDecoder();
  let out =
    '';
  try {
    for (;;) {
      const {
        done,
        value,
      } =
        await reader.read();
      if (
        done
      )
        break;
      out +=
        decoder.decode(
          value,
          {
            stream: true,
          },
        );
    }
  } catch {
    /* aborted mid-stream: meter what arrived */
  }
  return (
    out +
    decoder.decode()
  );
}

/** `timedAiFetch` plus a ledger row per chat completion, labelled `feature`. */
export function meteredAiFetch(
  feature: MeteredFeature,
): typeof fetch {
  return async (
    input,
    init,
  ) => {
    const res =
      await timedAiFetch(
        input,
        init,
      );
    const label =
      aiCallLabel(
        input,
      );
    if (
      !label.endsWith(
        ':chat',
      )
    )
      return res;
    const provider =
      label.split(
        ':',
      )[0] ??
      'other';
    const facts =
      requestFacts(
        init?.body,
      );

    if (
      !res.ok
    ) {
      void record(
        feature,
        provider,
        facts.model,
        {},
        false,
      );
      return res;
    }

    if (
      facts.stream &&
      res.body
    ) {
      const [
        forCaller,
        forMeter,
      ] =
        res.body.tee();
      void readStream(
        forMeter,
      ).then(
        (
          sse,
        ) =>
          record(
            feature,
            provider,
            facts.model,
            usageFromStream(
              sse,
              facts.promptChars,
            ),
            true,
          ),
      );
      return new Response(
        forCaller,
        {
          status:
            res.status,
          statusText:
            res.statusText,
          headers:
            res.headers,
        },
      );
    }

    void res
      .clone()
      .json()
      .then(
        (body: {
          usage?: Usage;
        }) =>
          record(
            feature,
            provider,
            facts.model,
            body?.usage ??
              {},
            true,
          ),
        () =>
          record(
            feature,
            provider,
            facts.model,
            {},
            true,
          ),
      );
    return res;
  };
}
