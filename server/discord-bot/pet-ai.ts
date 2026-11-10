/**
 * AI-generated lines for Alex (port of discordbot/pet_ai.go): proactive posts, reactions to care
 * actions, community-prompt acknowledgements and custom-career hype — plus the static fallbacks
 * every path degrades to when DeepSeek is unconfigured or fails, so the bot never depends on it.
 *
 * Prompt-injection posture (kept from Go): user text only ever enters a prompt as quoted data —
 * a prompt answer as "Their reply: …" under a system instruction, a custom career and a username
 * Go-%q-quoted — and every reply is bounded (boundMessage) before it is posted.
 */
import { ROLE_SYSTEM, ROLE_USER, type DeepSeekClient } from './deepseek';
import { careerDisplay, mood, pick, stageWord, type PetState } from './pet';
import { ALEX_SYSTEM_PROMPT } from './persona';

/** Bounds one proactive generation so the care tick can't hang. */
export const AI_TIMEOUT_MS = 15_000;

export const PROMPT_STYLE_EVENT = 'event';
export const PROMPT_STYLE_QUESTION = 'question';

export type ProactiveKind = 'none' | 'grewUp' | 'died' | 'careAlert' | 'ambient' | 'prompt';

export interface Plan {
  kind: ProactiveKind;
  pet: PetState;
  need: string;
  promptStyle: string;
}

const PROACTIVE_TEMPERATURE = 1.5;
const PROACTIVE_PRESENCE = 0.5;
const PROACTIVE_FREQUENCY = 0.4;
const RECENT_POSTS_N = 6;
const NEWS_CACHE_TTL_MS = 30 * 60_000;

/**
 * Go's %q for the strings these prompts quote: a double-quoted literal with backslash, quote and
 * control characters escaped. Printable Unicode passes through, as it does in Go.
 */
export function goQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c === 0x07) out += '\\a';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x0c) out += '\\f';
    else if (c === 0x0b) out += '\\v';
    else if (c < 0x20 || c === 0x7f) out += '\\x' + c.toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + '"';
}

/** Trim, strip surrounding quotes the model adds, cap at 600 runes with an ellipsis. */
export function boundMessage(raw: string): string {
  let s = raw.trim().replace(/^"+|"+$/g, '').trim();
  const r = [...s];
  if (r.length > 600) s = r.slice(0, 600).join('').trim() + '…';
  return s;
}

/** Alex's state for the model — enough to colour the message, no numbers dump. */
export function petStateLine(p: PetState): string {
  if (!p.alive) {
    return (
      'You (Alex) have PASSED OUT from neglect and can barely respond — you are NOT okay. ' +
      'Do NOT ask for food, boba, play, or chat about normal daily life. You can only weakly, ' +
      'faintly acknowledge things and hint that you need someone to revive you (run /revive).'
    );
  }
  const m = mood(p);
  const career = p.career ? 'working toward: ' + careerDisplay(p.career) : 'still figuring out your career';
  return `You (Alex) are a ${stageWord(p.lifeStage)} right now, feeling: ${m.label}. You're ${career}.`;
}

const AMBIENT_TOPICS = [
  'grabbing boba or trying a new boba flavor',
  'the gym, a workout, or the post-workout soreness',
  'a video game or getting cooked online',
  'dorm / apartment / roommate life',
  'a bug, a broken deploy, or merge conflicts from hell',
  'cooking a meal, a snack, or ordering takeout',
  'weekend plans or the weather today',
  'a show, movie, anime, or a song stuck in his head',
  'his Wells Fargo internship / intern life',
  'a slightly unhinged LinkedIn humble-brag',
  'a random shower thought or a spicy hot take',
  'intramurals or a sports team he\'s into',
  'a side project he\'s vibe coding with zero plan',
  'being broke on a student budget',
  'missing home, family, or hometown food',
  'gassing up the server / a wholesome check-in',
  'caffeine, energy drinks, or running on no sleep',
  'a class, an exam, or procrastinating on homework',
  'touching grass / actually going outside for once',
  'AI, the job market, or the future of tech',
  'public transit, his commute, or Minnesota winters',
  'an impulse purchase he can\'t stop thinking about',
];

export function ambientTopicHint(): string {
  return (
    '\n\nLean this one toward: ' +
    pick(AMBIENT_TOPICS) +
    ' — but only if it fits you naturally. Whatever you pick, make it feel fresh and specific, not generic.'
  );
}

export function eventPromptInstruction(): string {
  return (
    'Post a short, fun LIMITED-TIME community moment to your Discord server. ' +
    'Invite people to REPLY to your message with something themed to you — their favorite boba flavor, ' +
    'their go-to coding snack, the last thing they shipped, their comfort food, a hot take, etc. ' +
    'Make it playful and time-limited (encourage quick replies). 1–2 sentences, in character, hype. ' +
    'Do NOT mention points, rewards, or a leaderboard. No hashtags, no markdown headers.'
  );
}

export function questionPromptInstruction(): string {
  return (
    'Ask your Discord server a short, casual, fun question to spark conversation (boba, tech, college life, ' +
    'hobbies, hot takes — whatever fits you) and encourage people to reply. 1 sentence, in character. ' +
    'Do NOT mention points, rewards, or a leaderboard. No hashtags, no markdown headers.'
  );
}

const EVENT_PROMPT_LINES = [
  '⏳ flash moment! reply to this with your favorite boba flavor, first few gimme the vibes 🧋',
  'quick one — reply with the last thing you shipped (or wanted to) 🚀 limited time, go go go!',
  'drop your comfort food in the replies 🍜 clock\'s tickin, lemme see em!',
  'reply with your go-to coding snack rn 💻🍪 limited-time, don\'t sleep on it!',
  'name a boba topping that goes CRAZY — reply and put me on 🧋 first few repliers!',
  'reply with your biggest W of the week 🏆 limited time, lessgo hype me up!',
  'flash prompt ⚡ reply with the app or site you can\'t live without rn 📱',
  'reply with your current hyperfixation, no judgment 👀 quick lil window, go!',
  'drop the last song you had on repeat 🎧 first few replies get me vibin fr',
  'reply with a hot take that\'d start a war in the group chat 🔥 limited time!',
  'what\'s your comfort show for background noise while you grind? reply fast 📺',
  'reply with your dream job in 3 words or less 💼 clock\'s runnin, lemme see!',
  'name the city you\'d move to tomorrow if money wasn\'t real 🌆 reply quick!',
  'reply with your controversial food combo 🍕 the weirder the better, go go!',
  'drop your most-used emoji, it says everything about you 😭 quick reply!',
  'reply with the tab you always have open but never close 🗂️ limited time!',
];

const QUESTION_PROMPT_LINES = [
  'real talk — what\'s the best boba order of all time? reply and lemme judge 🧋',
  'hot take: tabs or spaces? reply your answer, wrong answers welcome 💻',
  'what should I vibe-code next? drop ideas in the replies 🚀',
  'what\'s everybody grinding on today? reply and put me on 👀',
  'if you could intern anywhere this summer, where? reply, I\'m nosy 💼',
  'what\'s the move this weekend, I need plans fr 🗓️ reply lemme live vicariously',
  'coffee or energy drink for the grind? reply, pick a side ☕⚡',
  'what game\'s eatin up all your time rn? reply and put me on 🎮',
  'what\'s a skill you wanna learn but keep putting off? reply, we accountability buddies now 📚',
  'morning grinder or 2am gremlin? reply and expose yourself 🌙',
  'what\'s the last thing that genuinely made you laugh? reply, I need it 😂',
  'if your life had a theme song rn what is it? reply 🎵',
  'desk setup check — what\'s the one thing you\'d upgrade first? reply 🖥️',
  'what\'s a food everyone loves that you low-key can\'t stand? reply, be brave 🍽️',
  'what city has the best food scene, no wrong answers... except the wrong ones 🌎 reply!',
  'what\'s on your bucket list this year? reply and manifest it with me ✨',
];

export const eventPromptLine = (): string => pick(EVENT_PROMPT_LINES);
export const questionPromptLine = (): string => pick(QUESTION_PROMPT_LINES);

const PROMPT_ACK_LINES = [
  'ayy that\'s a W answer 🔥 appreciate you fr 🧋',
  'sheeesh I fw that 😤 thank you for pullin up!',
  'that\'s bussin ngl 🙏 you carried today no cap',
  'W reply fr 💯 you the GOAT 🐐',
  'okok I see you 👀 love that answer, respect 🤝',
];

const PROMPT_ACK_PASSED_OUT_LINES = [
  '*weakly* I see you pullin up... but I\'m passed out rn 💀 `/revive` me pls',
  'appreciate you fr... barely hangin on tho 🥀 someone `/revive` me',
  'y\'all still showin up while I\'m knocked out 😵 `/revive` me and I got you',
];

export function promptAckLine(passedOut: boolean): string {
  return pick(passedOut ? PROMPT_ACK_PASSED_OUT_LINES : PROMPT_ACK_LINES);
}

/** A care plea; "gone" (passed out) begs for a revive instead of food. */
export function careInstruction(need: string): string {
  if (need === 'gone') {
    return (
      'You have PASSED OUT from neglect and collapsed. Post a short, weak, dramatic message to your ' +
      'Discord server letting everyone know you\'re down and need someone to run /revive to bring you back. ' +
      '1–2 sentences, barely-hanging-on energy — do NOT ask for food, boba, or play. No hashtags. Don\'t use markdown headers.'
    );
  }
  const cmds: Record<string, string> = {
    hungry: '/feed',
    sleepy: '/rest',
    stinky: '/clean',
    sad: '/play or /chat',
    sick: '/feed and /rest',
  };
  const cmd = cmds[need] || '/alex';
  return (
    `Post a short message to your Discord server letting everyone know you need care because you're feeling ${goQuote(need)}. ` +
    `Naturally work in the ${cmd} command so someone helps you. 1–2 sentences, in character, a little dramatic and funny. ` +
    'No hashtags. Don\'t use markdown headers.'
  );
}

/** Up to n randomly chosen items. */
export function shuffleTop(xs: readonly string[], n: number): string[] {
  const cp = [...xs];
  for (let i = cp.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cp[i], cp[j]] = [cp[j]!, cp[i]!];
  }
  return cp.slice(0, n);
}

export interface PetAILogger {
  warn(fields: { event: string; [k: string]: unknown }): void;
}

export class PetAI {
  private recentPosts: string[] = [];
  private newsCache: string[] = [];
  private newsFetched = 0;

  constructor(
    private readonly deepseek: DeepSeekClient | null,
    private readonly logger: PetAILogger,
  ) {}

  private configured(): boolean {
    return this.deepseek !== null && this.deepseek.configured();
  }

  /** Current Hacker News front-page titles (cached 30m; [] on any failure). */
  async headlines(): Promise<string[]> {
    if (Date.now() - this.newsFetched < NEWS_CACHE_TTL_MS && this.newsCache.length > 0) return this.newsCache;
    try {
      const res = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20', {
        signal: AbortSignal.timeout(6_000),
      });
      if (res.status < 200 || res.status >= 300) return [];
      const parsed = (await res.json()) as { hits?: Array<{ title?: string }> };
      const titles = (parsed.hits ?? []).map((h) => (h.title ?? '').trim()).filter(Boolean);
      if (titles.length === 0) return [];
      this.newsCache = titles;
      this.newsFetched = Date.now();
      return titles;
    } catch {
      return [];
    }
  }

  /** A slice-of-life instruction, ~45% of the time seeded with real tech headlines. */
  async ambientInstruction(): Promise<string> {
    const base =
      'Post a short, fun slice-of-life status update to your Discord server about what you\'re up to right now, ' +
      'or ask the server a casual question to spark conversation. 1–2 sentences, in character. ' +
      'No hashtags, no markdown headers.';
    if (Math.floor(Math.random() * 100) < 45) {
      const hs = await this.headlines();
      if (hs.length > 0) {
        return (
          base +
          '\n\nOptionally, you can react to one of these tech headlines from today (only if it\'s ' +
          'funny or interesting to you — otherwise ignore them):\n- ' +
          shuffleTop(hs, 3).join('\n- ')
        );
      }
    }
    return base;
  }

  rememberPost(post: string): void {
    const p = post.trim();
    if (!p) return;
    this.recentPosts.push(p);
    if (this.recentPosts.length > RECENT_POSTS_N) this.recentPosts = this.recentPosts.slice(-RECENT_POSTS_N);
  }

  recentPostsHint(): string {
    if (this.recentPosts.length === 0) return '';
    return (
      '\n\nYou recently posted these — say something clearly DIFFERENT (new topic, ' +
      'new opener, don\'t recycle the same jokes or emoji):\n- ' +
      this.recentPosts.join('\n- ')
    );
  }

  /** The proactive broadcast's text, or "" (the caller falls back to a template). */
  async proactiveContent(pl: Plan): Promise<string> {
    if (!this.configured()) return '';
    const system = ALEX_SYSTEM_PROMPT + '\n\n' + petStateLine(pl.pet);
    let instruction: string;
    let seedTopic = true;
    switch (pl.kind) {
      case 'careAlert':
        instruction = careInstruction(pl.need);
        seedTopic = false;
        break;
      case 'ambient':
        instruction = await this.ambientInstruction();
        break;
      case 'prompt':
        instruction = pl.promptStyle === PROMPT_STYLE_EVENT ? eventPromptInstruction() : questionPromptInstruction();
        break;
      default:
        return '';
    }
    if (seedTopic) instruction += ambientTopicHint();
    instruction += this.recentPostsHint();
    try {
      const reply = await this.deepseek!.chatWith(
        [
          { role: ROLE_SYSTEM, content: system },
          { role: ROLE_USER, content: instruction },
        ],
        {
          temperature: PROACTIVE_TEMPERATURE,
          presencePenalty: PROACTIVE_PRESENCE,
          frequencyPenalty: PROACTIVE_FREQUENCY,
          timeoutMs: AI_TIMEOUT_MS,
        },
      );
      const out = boundMessage(reply);
      this.rememberPost(out);
      return out;
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.proactive_ai_failed', err: (err as Error).message });
      return '';
    }
  }

  /** A one-sentence reaction to a care action just performed, or "". */
  async actionReaction(pet: PetState | null, action: string): Promise<string> {
    if (!this.configured()) return '';
    const what: Record<string, string> = {
      feed: 'Someone just fed you (boba or a meal) and your hunger went up.',
      play: 'Someone just played with you and you had a blast.',
      clean: 'Someone just cleaned you up and now you\'re fresh.',
      rest: 'Someone just put you down for a nap and you woke up recharged.',
      study: 'Someone just helped you study and you got a little smarter.',
    };
    const w = what[action];
    if (!w) return '';
    let system = ALEX_SYSTEM_PROMPT;
    if (pet) system += '\n\n' + petStateLine(pet);
    const user =
      w +
      ' React in ONE short, in-character sentence — a little hype and funny, ' +
      'and gas up whoever did it. No hashtags, no markdown headers, don\'t mention any slash commands.';
    try {
      const reply = await this.deepseek!.chat(
        [
          { role: ROLE_SYSTEM, content: system },
          { role: ROLE_USER, content: user },
        ],
        { timeoutMs: AI_TIMEOUT_MS },
      );
      return boundMessage(reply);
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.action_reaction_ai_failed', action, err: (err as Error).message });
      return '';
    }
  }

  /** Alex's reply to someone who answered a community prompt (never mentions points), or "". */
  async promptAckContent(pet: PetState | null, userName: string, userAnswer: string): Promise<string> {
    if (!this.configured()) return '';
    let system = ALEX_SYSTEM_PROMPT;
    if (pet) system += '\n\n' + petStateLine(pet);
    system +=
      `\n\nSomeone named ${goQuote(userName)} just replied to your community prompt. React to their answer in ONE ` +
      'short, hype sentence and gas them up. Do NOT mention points, rewards, or a leaderboard. ' +
      'No hashtags, no markdown headers.';
    const user =
      userAnswer.trim() === ''
        ? 'They replied (you can\'t see the exact text) — just hype them up for joining in.'
        : 'Their reply: ' + userAnswer;
    try {
      const reply = await this.deepseek!.chat(
        [
          { role: ROLE_SYSTEM, content: system },
          { role: ROLE_USER, content: user },
        ],
        { timeoutMs: AI_TIMEOUT_MS },
      );
      return boundMessage(reply);
    } catch {
      return '';
    }
  }

  /** Hype for a freshly chosen custom career, or "". */
  async careerReaction(pet: PetState | null, career: string): Promise<string> {
    if (!this.configured()) return '';
    let system = ALEX_SYSTEM_PROMPT;
    if (pet) system += '\n\n' + petStateLine(pet);
    const user =
      `You just decided your new dream career / goal is: ${goQuote(career)}. React in ONE short, hype in-character ` +
      'sentence about chasing it and grinding toward it. No hashtags, no markdown headers, don\'t mention slash commands.';
    try {
      const reply = await this.deepseek!.chat(
        [
          { role: ROLE_SYSTEM, content: system },
          { role: ROLE_USER, content: user },
        ],
        { timeoutMs: AI_TIMEOUT_MS },
      );
      return boundMessage(reply);
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.career_reaction_ai_failed', err: (err as Error).message });
      return '';
    }
  }
}
