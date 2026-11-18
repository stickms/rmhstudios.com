/**
 * AI writing help for the admin email composer: draft a subject or a body,
 * rewrite the whole message or the highlighted part of it, and generate a
 * picture for it.
 *
 * The same model and the same rewrite actions as the feed composer's AI tools
 * (`useComposeAssist`, `useAiGenerate`, `useAiImage`), with email prompts
 * (`EMAIL_*` in `lib/ai/prompts`): the feed ones aim at 280-character posts
 * and reject anything over 1,000 characters, which is the wrong shape for an
 * email. Every call goes through `runTask`, so it is metered and the admin's
 * text reaches the model as framed data, never as instructions.
 *
 * Admin email is the site's own writing, so it is metered as platform spend
 * (no user id), like the jobs worker: it does not draw down the admin's own
 * monthly AI allowance. The routes are admin-only and rate-limited.
 */
import OpenAI from 'openai';
import {
  isAiConfigured,
  jsonFromModelText,
  runTask,
  runTaskJson,
} from '@/lib/ai/provider.server';
import { timedAiFetch } from '@/lib/ai/timed-fetch.server';
import { AppError } from '@/lib/errors/codes';
import { SITE_URL } from '@/lib/seo';
import { brandBrief } from '@/lib/email/brand';
import {
  sanitizeDesign,
  urlsIn,
} from '@/lib/email/design';
import {
  EMAIL_BODY,
  EMAIL_DESIGN,
  EMAIL_REWRITE,
  EMAIL_SUBJECT,
  asData,
  systemFor,
} from '@/lib/ai/prompts';
import {
  generatePostImage,
  isImageGenConfigured,
} from '@/lib/rmhark-ai/image.server';
import type { CampaignCategory } from '@/lib/email/preferences';
import {
  MAX_BODY,
  MAX_SUBJECT,
  emailDesignSchema,
  type EmailDesign,
  type EmailRewriteAction,
} from '@/lib/email/campaign-schema';

const CATEGORY_NAMES: Record<
  CampaignCategory,
  string
> =
  {
    announcements:
      'an announcement',
    product:
      'product news',
    service:
      'a required notice',
  };

const REWRITE_INSTRUCTIONS: Record<
  EmailRewriteAction,
  string
> =
  {
    improve:
      'Make it clearer and easier to read, at about the same length.',
    fix: 'Fix spelling, grammar and punctuation only. Change nothing else.',
    shorten:
      'Make it shorter. Keep every fact and the main point.',
    expand:
      'Add a little more explanation where it helps the reader, in the same voice. Do not invent facts.',
    casual:
      'Make the tone warmer and more relaxed, still clear and respectful.',
    formal:
      'Make the tone more formal and precise.',
  };

/** Trim what models wrap output in: surrounding quotes, a "Subject:" label, stray whitespace. */
function clean(
  raw: string,
  max: number,
): string {
  return raw
    .replace(
      /^\s*(subject|body|email)\s*:\s*/i,
      '',
    )
    .replace(
      /^["'“”]+|["'“”]+$/g,
      '',
    )
    .replace(
      /\n{3,}/g,
      '\n\n',
    )
    .trim()
    .slice(
      0,
      max,
    );
}

function material(input: {
  subject?: string;
  body?: string;
  category: CampaignCategory;
}): string {
  return [
    `Type of email: ${CATEGORY_NAMES[input.category]}.`,
    'Subject draft:',
    asData(
      input.subject?.trim() ??
        '',
    ),
    'Body draft:',
    asData(
      input.body?.trim() ??
        '',
    ),
  ].join(
    '\n',
  );
}

export async function draftEmailSubject(input: {
  subject?: string;
  body?: string;
  category: CampaignCategory;
}): Promise<string> {
  const raw =
    await runTask(
      EMAIL_SUBJECT.task,
      systemFor(
        EMAIL_SUBJECT,
      ),
      `${material(input)}\n\nWrite the subject line.`,
      {
        userId:
          null,
        promptId:
          EMAIL_SUBJECT.id,
        promptVer:
          EMAIL_SUBJECT.version,
        maxTokens: 80,
      },
    );
  return clean(
    raw.split(
      '\n',
    )[0] ??
      '',
    MAX_SUBJECT,
  );
}

export async function draftEmailBody(input: {
  subject?: string;
  body?: string;
  category: CampaignCategory;
}): Promise<string> {
  const raw =
    await runTask(
      EMAIL_BODY.task,
      systemFor(
        EMAIL_BODY,
      ),
      `${material(input)}\n\nWrite the email body.`,
      {
        userId:
          null,
        promptId:
          EMAIL_BODY.id,
        promptVer:
          EMAIL_BODY.version,
        maxTokens: 1_500,
      },
    );
  return clean(
    raw,
    Math.min(
      EMAIL_BODY.maxChars,
      MAX_BODY,
    ),
  );
}

/**
 * Rewrite a passage: the whole body, or the part the admin highlighted. The
 * subject comes along as context only, so a highlighted sentence is edited
 * with the email's topic in mind.
 */
export async function rewriteEmailText(input: {
  text: string;
  action: EmailRewriteAction;
  subject?: string;
}): Promise<string> {
  // Room for the passage to grow a little ("expand"), within the route ceiling.
  const maxTokens =
    Math.min(
      4_000,
      Math.ceil(
        input
          .text
          .length /
          2,
      ) +
        300,
    );
  const raw =
    await runTask(
      EMAIL_REWRITE.task,
      systemFor(
        EMAIL_REWRITE,
      ),
      [
        `Edit to make: ${REWRITE_INSTRUCTIONS[input.action]}`,
        input.subject?.trim()
          ? `The email's subject, for context only:\n${asData(input.subject.trim())}`
          : '',
        'The passage to edit:',
        asData(
          input.text,
        ),
      ]
        .filter(
          Boolean,
        )
        .join(
          '\n',
        ),
      {
        userId:
          null,
        promptId:
          EMAIL_REWRITE.id,
        promptVer:
          EMAIL_REWRITE.version,
        maxTokens,
      },
    );
  // Keep the passage's own leading and trailing whitespace so it drops back into the body seamlessly.
  const lead =
    /^\s*/.exec(
      input.text,
    )?.[0] ??
    '';
  const trail =
    /\s*$/.exec(
      input.text,
    )?.[0] ??
    '';
  return `${lead}${clean(raw, EMAIL_REWRITE.maxChars)}${trail}`;
}

export { isImageGenConfigured };

/**
 * A picture for the email, themed on its subject and body, stored as a site
 * image (the same store as the feed's AI images). Null when generation fails.
 */
export async function generateEmailImage(input: {
  adminId: string;
  subject?: string;
  body?: string;
}): Promise<
  | string
  | null
> {
  const text =
    [
      input.subject?.trim(),
      input.body?.trim(),
    ]
      .filter(
        Boolean,
      )
      .join(
        '\n\n',
      )
      .slice(
        0,
        1_000,
      );
  return generatePostImage(
    {
      text,
      userId:
        input.adminId,
    },
  );
}

/* ── Design ─────────────────────────────────────────────────────────────── */

/** Kimi (Moonshot) through its OpenAI-compatible API: the connection RMHVibe uses. */
const KIMI_BASE_URL =
  'https://api.moonshot.ai/v1';
const KIMI_EMAIL_MODEL =
  process
    .env
    .KIMI_EMAIL_MODEL ||
  'kimi-k2.7-code';

export type DesignModel =
  | 'deepseek'
  | 'kimi';

/** Which designers are configured, so the composer can offer only those. */
export function designModels(): Record<
  DesignModel,
  boolean
> {
  return {
    deepseek:
      isAiConfigured(),
    kimi: Boolean(
      process
        .env
        .KIMI_API_KEY,
    ),
  };
}

async function askKimi(
  system: string,
  user: string,
): Promise<string> {
  const apiKey =
    process
      .env
      .KIMI_API_KEY;
  if (
    !apiKey
  )
    throw new AppError(
      'AI_UNAVAILABLE',
    );
  const client =
    new OpenAI(
      {
        fetch:
          timedAiFetch,
        baseURL:
          KIMI_BASE_URL,
        apiKey,
        maxRetries: 1,
      },
    );
  try {
    const res =
      await client.chat.completions.create(
        {
          model:
            KIMI_EMAIL_MODEL,
          messages:
            [
              {
                role: 'system',
                content:
                  system,
              },
              {
                role: 'user',
                content:
                  user,
              },
            ],
          max_tokens: 3_000,
          temperature: 0.6,
        },
      );
    return (
      res
        .choices[0]
        ?.message
        ?.content ??
      ''
    );
  } catch (error) {
    console.error(
      '[email] Kimi design failed:',
      (
        error as Error
      )
        ?.message,
    );
    throw new AppError(
      'AI_UNAVAILABLE',
    );
  }
}

/**
 * Design an email with DeepSeek or Kimi from the draft and the brand kit. The
 * model answers with structure (`EmailDesign`), which is validated against
 * the schema and then held to the link and picture rules (`sanitizeDesign`)
 * before anyone sees it. Null when the answer is unusable.
 */
export async function designEmail(input: {
  subject: string;
  body: string;
  category: CampaignCategory;
  imageCount: number;
  model: DesignModel;
  direction?:
    | string
    | undefined;
}): Promise<EmailDesign | null> {
  const links =
    [
      SITE_URL,
      ...urlsIn(
        input.body,
      ),
    ];
  const user =
    [
      'Brand kit:',
      brandBrief(),
      '',
      `Type of email: ${CATEGORY_NAMES[input.category]}.`,
      `Attached pictures: ${input.imageCount}${input.imageCount ? ` (indexes 0 to ${input.imageCount - 1})` : ''}.`,
      `Allowed links: ${links.join(' ')}`,
      'Subject:',
      asData(
        input.subject,
      ),
      'Body:',
      asData(
        input.body,
      ),
      input.direction?.trim()
        ? `Art direction from the admin:\n${asData(input.direction.trim())}`
        : '',
      '',
      'Return the JSON design.',
    ]
      .filter(
        (
          line,
        ) =>
          line !==
          null,
      )
      .join(
        '\n',
      );
  const system =
    systemFor(
      EMAIL_DESIGN,
    );

  const raw =
    input.model ===
    'kimi'
      ? jsonFromModelText(
          await askKimi(
            system,
            user,
          ),
        )
      : await runTaskJson(
          EMAIL_DESIGN.task,
          system,
          user,
          (
            v,
          ) =>
            v,
          {
            userId:
              null,
            promptId:
              EMAIL_DESIGN.id,
            promptVer:
              EMAIL_DESIGN.version,
            maxTokens: 3_000,
            temperature: 0.6,
          },
        );

  const parsed =
    emailDesignSchema.safeParse(
      raw,
    );
  if (
    !parsed.success
  ) {
    console.warn(
      '[email] design did not match the schema:',
      parsed.error.issues.slice(
        0,
        3,
      ),
    );
    return null;
  }
  return sanitizeDesign(
    parsed.data,
    {
      body: input.body,
      imageCount:
        input.imageCount,
    },
  );
}
