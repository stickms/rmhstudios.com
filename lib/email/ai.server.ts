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
import { runTask } from '@/lib/ai/provider.server';
import {
  EMAIL_BODY,
  EMAIL_REWRITE,
  EMAIL_SUBJECT,
  asData,
  systemFor,
} from '@/lib/ai/prompts';
import { generatePostImage, isImageGenConfigured } from '@/lib/rmhark-ai/image.server';
import type { CampaignCategory } from '@/lib/email/preferences';
import type { EmailRewriteAction } from '@/lib/email/campaign-schema';
import { MAX_BODY, MAX_SUBJECT } from '@/lib/email/campaign-schema';

const CATEGORY_NAMES: Record<CampaignCategory, string> = {
  announcements: 'an announcement',
  product: 'product news',
  service: 'a required notice',
};

const REWRITE_INSTRUCTIONS: Record<EmailRewriteAction, string> = {
  improve: 'Make it clearer and easier to read, at about the same length.',
  fix: 'Fix spelling, grammar and punctuation only. Change nothing else.',
  shorten: 'Make it shorter. Keep every fact and the main point.',
  expand: 'Add a little more explanation where it helps the reader, in the same voice. Do not invent facts.',
  casual: 'Make the tone warmer and more relaxed, still clear and respectful.',
  formal: 'Make the tone more formal and precise.',
};

/** Trim what models wrap output in: surrounding quotes, a "Subject:" label, stray whitespace. */
function clean(raw: string, max: number): string {
  return raw
    .replace(/^\s*(subject|body|email)\s*:\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function material(input: { subject?: string; body?: string; category: CampaignCategory }): string {
  return [
    `Type of email: ${CATEGORY_NAMES[input.category]}.`,
    'Subject draft:',
    asData(input.subject?.trim() ?? ''),
    'Body draft:',
    asData(input.body?.trim() ?? ''),
  ].join('\n');
}

export async function draftEmailSubject(input: {
  subject?: string;
  body?: string;
  category: CampaignCategory;
}): Promise<string> {
  const raw = await runTask(
    EMAIL_SUBJECT.task,
    systemFor(EMAIL_SUBJECT),
    `${material(input)}\n\nWrite the subject line.`,
    { userId: null, promptId: EMAIL_SUBJECT.id, promptVer: EMAIL_SUBJECT.version, maxTokens: 80 },
  );
  return clean(raw.split('\n')[0] ?? '', MAX_SUBJECT);
}

export async function draftEmailBody(input: {
  subject?: string;
  body?: string;
  category: CampaignCategory;
}): Promise<string> {
  const raw = await runTask(
    EMAIL_BODY.task,
    systemFor(EMAIL_BODY),
    `${material(input)}\n\nWrite the email body.`,
    { userId: null, promptId: EMAIL_BODY.id, promptVer: EMAIL_BODY.version, maxTokens: 1_500 },
  );
  return clean(raw, Math.min(EMAIL_BODY.maxChars, MAX_BODY));
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
  const maxTokens = Math.min(4_000, Math.ceil(input.text.length / 2) + 300);
  const raw = await runTask(
    EMAIL_REWRITE.task,
    systemFor(EMAIL_REWRITE),
    [
      `Edit to make: ${REWRITE_INSTRUCTIONS[input.action]}`,
      input.subject?.trim() ? `The email's subject, for context only:\n${asData(input.subject.trim())}` : '',
      'The passage to edit:',
      asData(input.text),
    ]
      .filter(Boolean)
      .join('\n'),
    { userId: null, promptId: EMAIL_REWRITE.id, promptVer: EMAIL_REWRITE.version, maxTokens },
  );
  // Keep the passage's own leading and trailing whitespace so it drops back into the body seamlessly.
  const lead = /^\s*/.exec(input.text)?.[0] ?? '';
  const trail = /\s*$/.exec(input.text)?.[0] ?? '';
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
}): Promise<string | null> {
  const text = [input.subject?.trim(), input.body?.trim()].filter(Boolean).join('\n\n').slice(0, 1_000);
  return generatePostImage({ text, userId: input.adminId });
}
