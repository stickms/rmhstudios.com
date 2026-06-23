/**
 * RMHark AI — server-side text generation via DeepSeek.
 *
 * Powers two things:
 *  1. The "✨ generate" buttons real users tap in the composer / reply boxes
 *     (app/routes/api/rmharks/ai-generate.ts).
 *  2. The bot-worker, which invents synthetic users and posts as them
 *     (server/bot-worker/index.ts).
 *
 * Reuses the same server-only DEEPSEEK_API_KEY already configured for RMHVibe
 * and the Discord bot — the key never reaches the client. Server-only
 * (`.server.ts`); reads process.env.
 */

import OpenAI from 'openai';
import {
  MAX_POST_CHARS,
  MAX_REPLY_CHARS,
  POST_SHAPES,
  cleanGeneratedText,
  randomItem,
  type BotPersonaSpec,
} from './persona';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 2,
});

// Cheap, fast chat model. Override only if DeepSeek's id changes.
const RMHARK_AI_MODEL = process.env.RMHARK_AI_MODEL || 'deepseek-chat';

export class RmharkAIError extends Error {}

/** True when a DeepSeek key is configured — callers can skip gracefully. */
export function isRmharkAIConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

async function chat(
  messages: { role: 'system' | 'user'; content: string }[],
  opts: { maxTokens: number; temperature?: number },
): Promise<string> {
  if (!isRmharkAIConfigured()) {
    throw new RmharkAIError('DEEPSEEK_API_KEY is not configured');
  }
  const res = await deepseek.chat.completions.create({
    model: RMHARK_AI_MODEL,
    messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 1.0,
    stream: false,
  });
  const text = res.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new RmharkAIError('Empty response from model');
  return text;
}

/* ------------------------------------------------------------------ */
/*  Posts                                                              */
/* ------------------------------------------------------------------ */

const FEED_NAME = 'RMHark';

const BASE_POST_RULES = [
  `This is a short social-media post for a feed called ${FEED_NAME} (like a tweet).`,
  `Hard limit: ${MAX_POST_CHARS} characters. Aim for one or two sentences.`,
  'Sound like a real person, not an ad or a corporation. No hashtags spam (one at most, only if natural).',
  'Do NOT use markdown, do NOT wrap the post in quotes, do NOT add a label. Output ONLY the post text.',
].join(' ');

/**
 * Generate a standalone post.
 * - With `persona` (bot-worker): stays fully in character/voice.
 * - Without (a logged-in human tapping the ✨ button): a fresh, engaging post.
 *   If the user has already started typing, their `draft` is built upon rather
 *   than ignored — same intent, specifics, and voice, just finished.
 */
export async function generatePost(opts: {
  persona?: string;
  draft?: string;
} = {}): Promise<string> {
  const shape = randomItem(POST_SHAPES);
  const draft = opts.draft?.trim();

  const system = opts.persona
    ? [
        'You are roleplaying as a specific person posting on social media. Stay completely in character.',
        'Never reveal or hint that you are an AI, a bot, or generated. You are just a person.',
        'Follow this persona exactly, including the VOICE rules (formality, quirks, and any typos):',
        '',
        opts.persona,
        '',
        BASE_POST_RULES,
      ].join('\n')
    : [
        'You help a user draft a post for their social feed.',
        draft
          ? "The user has already started writing. Build on their draft: keep their intent, topic, specifics, and tone, and finish/refine it into a complete post. Do not change the subject."
          : 'Write something authentic, specific, and a little interesting — the kind of thing that sparks replies.',
        BASE_POST_RULES,
      ].join('\n');

  let userMsg: string;
  if (opts.persona) {
    userMsg = `Write your next post. Make it ${shape}. Keep it natural and in your voice.`;
  } else if (draft) {
    userMsg = `Here is what I have so far:\n"""${draft}"""\n\nFinish or improve it into a single post.`;
  } else {
    userMsg = `Draft an engaging post. Make it ${shape}.`;
  }

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
    { maxTokens: 200, temperature: 1.05 },
  );
  return cleanGeneratedText(raw, MAX_POST_CHARS);
}

/* ------------------------------------------------------------------ */
/*  Image prompts                                                      */
/* ------------------------------------------------------------------ */

/**
 * Turn a finished post into a concise, literal text-to-image prompt for the
 * image model. Kept deliberately safe and brand/person-free to minimize
 * provider refusals. Used by lib/rmhark-ai/image.server.ts.
 */
export async function generateImagePrompt(postText: string): Promise<string> {
  const text = postText.trim().slice(0, 600);

  const system = [
    'You turn a short social-media post into a prompt for a text-to-image model.',
    'Output ONE vivid, literal visual description of a single image that fits the post.',
    'Rules: under 40 words. Describe the subject, setting, style, and mood.',
    'Do NOT put any text or words in the image. Do NOT depict real, named people, celebrities, brands, or logos.',
    'Keep it safe-for-work and non-violent.',
    'Output ONLY the image prompt — no quotes, no labels, no markdown.',
  ].join('\n');

  const user = text
    ? `Post:\n"""${text}"""\n\nWrite the image prompt.`
    : 'Write a tasteful, interesting image prompt for a generic lifestyle social post.';

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 120, temperature: 0.9 },
  );
  return cleanGeneratedText(raw, 300);
}

/**
 * Turn an AI persona's identity (name / tagline / system prompt) into a concise
 * text-to-image prompt for a square avatar portrait. Used by
 * lib/personas/avatar.server.ts. Same safety rails as generateImagePrompt.
 */
export async function generatePersonaAvatarPrompt(persona: {
  name: string;
  tagline?: string | null;
  systemPrompt: string;
}): Promise<string> {
  const system = [
    'You write prompts for a text-to-image model that will produce a single SQUARE avatar portrait of a character.',
    'Given a chatbot persona (its name, tagline, and instructions), describe ONE vivid avatar image that captures who it is.',
    'Rules: under 40 words. Describe the subject, art style, palette, and mood. Favor a centered head-and-shoulders portrait on a simple background.',
    'Do NOT put any text, letters, or words in the image. Do NOT depict real, named people, celebrities, brands, or logos.',
    'Keep it safe-for-work and non-violent.',
    'Output ONLY the image prompt — no quotes, no labels, no markdown.',
  ].join('\n');

  const details = [
    `Name: ${persona.name}`,
    persona.tagline ? `Tagline: ${persona.tagline}` : '',
    `Personality / instructions: ${persona.systemPrompt.slice(0, 600)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: `Persona:\n"""${details}"""\n\nWrite the avatar image prompt.` },
    ],
    { maxTokens: 120, temperature: 0.9 },
  );
  return cleanGeneratedText(raw, 300);
}

/* ------------------------------------------------------------------ */
/*  Replies                                                            */
/* ------------------------------------------------------------------ */

const BASE_REPLY_RULES = [
  `This is a reply on a social feed called ${FEED_NAME}.`,
  `Hard limit: ${MAX_REPLY_CHARS} characters, but most good replies are one or two sentences.`,
  'Be relevant and add something — agree, riff, ask, or gently push back. Sound human.',
  'Do NOT use markdown, do NOT wrap the reply in quotes, do NOT add a label. Output ONLY the reply text.',
].join(' ');

/**
 * Generate a reply to a post (and optionally to a specific comment within it).
 * - With `persona` (bot-worker): in character.
 * - Without (human tapping ✨ on a reply box): a helpful, on-topic reply draft.
 *
 * `thread` is the chain of ancestor comments (top → the one being replied to)
 * so the reply lands in the actual conversation. `draft` is the user's own
 * in-progress text, which is refined rather than discarded.
 */
export async function generateReply(opts: {
  postContent: string;
  /** If the post is a quote-repost, the content of the original it quotes. */
  quotedPostContent?: string;
  thread?: string[];
  persona?: string;
  draft?: string;
}): Promise<string> {
  const draft = opts.draft?.trim();
  const quoted = opts.quotedPostContent?.trim();

  const system = opts.persona
    ? [
        'You are roleplaying as a specific person replying on social media. Stay completely in character.',
        'Never reveal or hint that you are an AI, a bot, or generated. You are just a person.',
        'Follow this persona exactly, including the VOICE rules (formality, quirks, and any typos):',
        '',
        opts.persona,
        '',
        BASE_REPLY_RULES,
      ].join('\n')
    : [
        'You help a user draft a reply on their social feed.',
        draft
          ? 'The user has started writing a reply. Build on their draft: keep their point and tone, and finish/refine it into a natural response that fits the conversation.'
          : 'Read the conversation and write a natural, relevant response that adds something.',
        BASE_REPLY_RULES,
      ].join('\n');

  const thread = (opts.thread ?? []).map((c) => c.trim()).filter(Boolean);
  const context = [
    `The original post says:\n"""${opts.postContent.trim()}"""`,
    quoted ? `\nThat post is quoting this earlier post:\n"""${quoted}"""` : '',
    thread.length
      ? `\nThe reply thread so far (oldest first), and you are replying to the LAST one:\n${thread
          .map((c, i) => `${i + 1}. "${c}"`)
          .join('\n')}`
      : '',
    draft ? `\nThe reply I've started writing:\n"""${draft}"""` : '',
    '\nWrite the reply.',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: context },
    ],
    { maxTokens: 300, temperature: 1.0 },
  );
  return cleanGeneratedText(raw, MAX_REPLY_CHARS);
}

/* ------------------------------------------------------------------ */
/*  Feed announcements (admin)                                         */
/* ------------------------------------------------------------------ */

// Mirror the limits enforced by the announcement API/form.
const ANNOUNCEMENT_TITLE_MAX = 120;
const ANNOUNCEMENT_BODY_MAX = 1000;

/**
 * Draft a short headline for a pinned feed announcement banner. Both the
 * current title draft and the message body are passed as context so the
 * headline reflects whatever the admin is actually announcing — if they've
 * started a title, it's refined rather than replaced.
 */
export async function generateAnnouncementTitle(opts: {
  title?: string;
  body?: string;
}): Promise<string> {
  const title = opts.title?.trim();
  const body = opts.body?.trim();

  const system = [
    `You write short, punchy titles for pinned announcement banners on a community site called ${FEED_NAME}.`,
    `Hard limit: ${ANNOUNCEMENT_TITLE_MAX} characters. Aim for a few words — a clear, attention-grabbing headline.`,
    title
      ? 'The admin has started a title. Build on it: keep their intent and topic, just sharpen it.'
      : 'Write a clear, inviting headline that captures the announcement.',
    'Do NOT use markdown, do NOT wrap the title in quotes, do NOT add a label. Output ONLY the title text.',
  ].join('\n');

  const context = [
    title ? `The current title draft is:\n"""${title}"""` : '',
    body ? `The announcement message is:\n"""${body}"""` : '',
    !title && !body ? 'Write a friendly, generic announcement headline.' : '',
    '\nWrite the title.',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: context },
    ],
    { maxTokens: 60, temperature: 0.9 },
  );
  return cleanGeneratedText(raw, ANNOUNCEMENT_TITLE_MAX);
}

/**
 * Draft the message body for a pinned feed announcement. The current title and
 * any in-progress body are folded in so the message stays on-topic; an existing
 * body draft is refined rather than discarded.
 */
export async function generateAnnouncementBody(opts: {
  title?: string;
  body?: string;
}): Promise<string> {
  const title = opts.title?.trim();
  const body = opts.body?.trim();

  const system = [
    `You write the message for a pinned announcement banner on a community site called ${FEED_NAME}.`,
    `Hard limit: ${ANNOUNCEMENT_BODY_MAX} characters, but keep it tight — one short paragraph (a sentence or three).`,
    body
      ? 'The admin has started writing. Build on their draft: keep the intent, specifics, and tone, and finish/refine it.'
      : 'Write a clear, friendly message that tells the community what is happening.',
    'Sound like a real person announcing something, not a corporate notice.',
    'Do NOT use markdown, do NOT wrap the message in quotes, do NOT add a label. Output ONLY the message text.',
  ].join('\n');

  const context = [
    title ? `The announcement title is:\n"""${title}"""` : '',
    body ? `The message I've started writing:\n"""${body}"""` : '',
    !title && !body ? 'Write a friendly, generic announcement message.' : '',
    '\nWrite the message.',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: context },
    ],
    { maxTokens: 400, temperature: 0.95 },
  );
  return cleanGeneratedText(raw, ANNOUNCEMENT_BODY_MAX);
}

/* ------------------------------------------------------------------ */
/*  Bot profiles                                                       */
/* ------------------------------------------------------------------ */

export interface GeneratedBotProfile {
  name: string;
  handle: string;
  bio: string;
}

const NAME_FALLBACKS = ['alex', 'sam', 'jordan', 'riley', 'casey', 'morgan', 'taylor', 'jamie'];

function sanitizeHandle(raw: string): string {
  const cleaned = (raw || '')
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18);
  return cleaned || randomItem(NAME_FALLBACKS);
}

/**
 * Invent a believable display name, handle, and bio for a bot, consistent with
 * its rolled persona. Returns sanitized fields; the worker still guarantees
 * handle uniqueness against the DB.
 */
export async function generateBotProfile(spec: BotPersonaSpec): Promise<GeneratedBotProfile> {
  const system = [
    'You invent realistic social-media account identities. Output STRICT JSON only — no prose, no markdown fences.',
    'The person must NOT look like a bot or brand. No "official", no "AI", no "bot" in any field.',
    'Schema: {"name": string, "handle": string, "bio": string}',
    '- name: a plausible human display name (1-3 words). May include a tasteful emoji at most once.',
    '- handle: lowercase, letters/numbers/underscores only, 3-18 chars, no leading @.',
    `- bio: <= 150 chars, reflects the theme + temperament, written in the persona's voice. This is what makes their "theme" obvious from their profile.`,
  ].join('\n');

  const user = [
    'Create an identity for this persona:',
    '',
    composePersonaForProfile(spec),
    '',
    'Return only the JSON object.',
  ].join('\n');

  let parsed: Partial<GeneratedBotProfile> = {};
  try {
    const raw = await chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 200, temperature: 1.1 },
    );
    parsed = JSON.parse(stripJson(raw));
  } catch {
    // Fall through to deterministic fallbacks below.
  }

  const name =
    typeof parsed.name === 'string' && parsed.name.trim()
      ? parsed.name.trim().slice(0, 40)
      : randomItem(NAME_FALLBACKS);
  const handle = sanitizeHandle(typeof parsed.handle === 'string' ? parsed.handle : name);
  const bio =
    typeof parsed.bio === 'string' && parsed.bio.trim()
      ? parsed.bio.trim().slice(0, 150)
      : spec.theme;

  return { name, handle, bio };
}

/** A compact persona brief for the profile generator (kept inline to avoid a circular import). */
function composePersonaForProfile(spec: BotPersonaSpec): string {
  return [
    `THEME: ${spec.theme}.`,
    `TEMPERAMENT: ${spec.temperament}.`,
    `QUIRK: ${spec.quirk}.`,
    `VOICE: ${spec.voice.label} — ${spec.voice.rules}`,
  ].join('\n');
}

/** Pull a JSON object out of a possibly fenced/explained model response. */
function stripJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start !== -1 && end !== -1 ? body.slice(start, end + 1) : body;
}

/* ------------------------------------------------------------------ */
/*  Direct messages                                                    */
/* ------------------------------------------------------------------ */

const BASE_DM_RULES = [
  'This is a private one-to-one direct message (DM), not a public post.',
  `Hard limit: ${MAX_REPLY_CHARS} characters; most DMs are a sentence or two.`,
  'Write like a real person messaging privately: warm, specific, conversational. You may ask a question back.',
  'Do NOT use markdown, do NOT wrap the message in quotes, do NOT add a label. Output ONLY the message text.',
].join(' ');

/** Shared in-character system prompt for DMs (persona + never-reveal + rules). */
function dmPersonaSystem(persona: string): string {
  return [
    'You are roleplaying as a specific person chatting in private DMs. Stay completely in character.',
    'Never reveal or hint that you are an AI, a bot, or generated. You are just a person.',
    'Follow this persona exactly, including the VOICE rules (formality, quirks, and any typos):',
    '',
    persona,
    '',
    BASE_DM_RULES,
  ].join('\n');
}

/**
 * Generate an in-character reply to a private DM conversation. `history` is the
 * recent message chain labeled from the bot's perspective (them = the other
 * person, you = the bot), oldest first.
 */
export async function generateDirectMessageReply(opts: {
  persona: string;
  history: { from: 'them' | 'you'; text: string }[];
}): Promise<string> {
  const transcript = opts.history
    .map((t) => `${t.from === 'you' ? 'You' : 'Them'}: ${t.text}`)
    .join('\n');
  const user = [
    'Here is your DM conversation so far (oldest first):',
    transcript || '(no messages yet)',
    '',
    'Write your next message as the most recent reply. Output only the message.',
  ].join('\n');

  const raw = await chat(
    [
      { role: 'system', content: dmPersonaSystem(opts.persona) },
      { role: 'user', content: user },
    ],
    { maxTokens: 300, temperature: 1.0 },
  );
  return cleanGeneratedText(raw, MAX_REPLY_CHARS);
}

/** Generate a short, natural opening DM in the bot's voice (no prior context). */
export async function generateDirectMessageOpener(opts: { persona: string }): Promise<string> {
  const user = [
    'Start a new private conversation with someone on the same social platform.',
    'Open naturally and briefly — a friendly hello, a small question, or a light comment in your voice.',
    'Output only the message.',
  ].join('\n');

  const raw = await chat(
    [
      { role: 'system', content: dmPersonaSystem(opts.persona) },
      { role: 'user', content: user },
    ],
    { maxTokens: 200, temperature: 1.1 },
  );
  return cleanGeneratedText(raw, MAX_REPLY_CHARS);
}
