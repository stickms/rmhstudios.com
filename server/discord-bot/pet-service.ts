/**
 * The Alex tamagotchi's command surface and background life (port of discordbot/pet_service.go,
 * pet_care.go's tick, pet_events.go, pet_presence.go and pet_intro.go).
 *
 * There is ONE global Alex shared across every server. Every mutation goes through the global
 * lock → load → applyDecay → mutate → save, so simultaneous commands from any server cannot race
 * the read-modify-write cycle. The paid image call (/show) and every AI line run OUTSIDE the lock
 * on a snapshot, so a slow model never blocks other caretakers. Per-guild data (last channel,
 * intro flag, message level, persona prompt) lives in discord_alex_guild.
 */
import {
  ERR_MISSING_ACCESS,
  ERR_MISSING_PERMISSIONS,
  ERR_UNKNOWN_CHANNEL,
  discordCode,
  type DiscordPort,
  type Embed,
  type FileUpload,
} from './discord';
import { getDuration } from './config';
import {
  deferReply,
  interactionAvatar,
  interactionUser,
  respondText,
  type Interaction,
} from './interactions';
import { KeyedMutex } from './mutex';
import {
  CAREER_BLURB,
  GLOBAL_PET_KEY,
  NO_DECAY,
  STAGE_LABEL,
  ageString,
  applyDecay,
  canGraduate,
  careerDisplay,
  careerOptionsLine,
  clampStat,
  clean,
  feed,
  genericCareerBlurb,
  intelligenceLabel,
  legacyNote,
  mood,
  needs,
  newPet,
  normalizeCareer,
  play,
  rest,
  sanitizeCareer,
  sanitizePetName,
  stageWord,
  startNewLife,
  statBar,
  study,
  type ActionResult,
  type DecayResult,
  type Mood,
  type PetState,
} from './pet';
import {
  PROMPT_STYLE_EVENT,
  PROMPT_STYLE_QUESTION,
  PetAI,
  eventPromptLine,
  questionPromptLine,
  type Plan,
  type ProactiveKind,
} from './pet-ai';
import { ambientDue, ambientLine, careAlertInterval, careAlertLine, dueSince, wantsMessage } from './pet-care';
import { AlexImager, contentTypeForExt, detectImageExt, type AlexImage } from './pet-image';
import { MSG_LEVEL_ALL, MSG_LEVEL_CARE, MSG_LEVEL_OFF, PetRepo, type CaretakerRow, type GuildChannel } from './pet-repo';
import { CHANNEL_GUILD_TEXT, PERM, type GatewayState } from './state';

export interface BotLogger {
  info(fields: { event: string; [k: string]: unknown }): void;
  warn(fields: { event: string; [k: string]: unknown }): void;
  error(fields: { event: string; [k: string]: unknown }): void;
}

/** Leaderboard weight per care action. */
export const CARE_POINTS: Record<string, number> = {
  feeds: 10,
  plays: 8,
  cleans: 6,
  naps: 5,
  talks: 3,
  studies: 9,
  interactions: 6,
};
/** Points for answering a community prompt (never announced). */
export const INTERACTION_POINTS = 6;
/** How many users can win a single prompt. */
export const PROMPT_MAX_CLAIMS = 12;
const SHOW_COOLDOWN_MS = 45_000;
/** Command-driven presence updates are throttled under Discord's rate limit. */
const PRESENCE_THROTTLE_MS = 30_000;

export const promptDuration = (): number => getDuration('ALEX_PROMPT_DURATION', 30 * 60_000);

interface ActivePrompt {
  style: string;
  channels: Set<string>;
  expiresAt: number;
  claimed: Set<string>;
}

export const attributeFooter = (username: string, emoji: string, verb: string) => ({
  text: `${emoji} ${username} ${verb}`,
});

export function errEmbed(msg: string): Embed {
  return { color: 0xef4444, title: '❌ bruh something broke', description: msg };
}

export function imageFile(img: AlexImage): FileUpload {
  return { name: img.filename, data: img.bytes, contentType: contentTypeForExt(img.ext) };
}

/** The stat card; `res` surfaces a growth or death detected on this load. */
export function statusEmbed(p: PetState, m: Mood, now: number, res: DecayResult): Embed {
  let color = 0x34d399;
  if (!p.alive) color = 0x6b7280;
  else if (p.health < 25 || needs(p).length > 0) color = 0xef4444;
  else if (m.key === 'chillin') color = 0xa855f7;

  let desc = '';
  if (res.died) desc += '💀 **Alex passed out from neglect...** he needs a `/revive`. RIP the grind 🥀\n\n';
  else if (res.grewUp) desc += `🎉 **Alex grew up into a ${stageWord(res.stageAfter)}!** they grow up so fast 🥹\n\n`;
  desc += `**${p.name}** · ${STAGE_LABEL[p.lifeStage] ?? ''} · gen ${p.generation}\n_${m.emoji} ${m.label}_\n🎯 Dream: ${careerDisplay(p.career)} · 🧠 ${intelligenceLabel(p.intelligence)}`;

  return {
    title: '🧋 ' + p.name + ' the Alex',
    color,
    description: desc,
    fields: [
      { name: '🍽️ Hunger', value: statBar(p.hunger), inline: true },
      { name: '😊 Happiness', value: statBar(p.happiness), inline: true },
      { name: '⚡ Energy', value: statBar(p.energy), inline: true },
      { name: '🧼 Hygiene', value: statBar(p.hygiene), inline: true },
      { name: '❤️ Health', value: statBar(p.health), inline: true },
      { name: '🧠 Intelligence', value: statBar(p.intelligence), inline: true },
      { name: '🎂 Age', value: ageString(p, now), inline: true },
    ],
    footer: { text: '/feed · /play · /clean · /rest · /study · /show · /chat' },
  };
}

export function caretakersTextEmbed(rows: CaretakerRow[], username: string): Embed {
  const medals = ['🥇', '🥈', '🥉'];
  let b = '';
  rows.forEach((c, idx) => {
    const rank = idx < medals.length ? medals[idx] : '`#' + (idx + 1) + '`';
    b += `${rank} **${c.username}** — ${c.points} pts  ·  🍽️${c.feeds} 🎮${c.plays} 🧼${c.cleans} 😴${c.naps} 💬${c.talks} 📚${c.studies} 🤝${c.interactions}\n`;
  });
  return {
    title: "🏆 Alex's Top Caretakers",
    color: 0xf59e0b,
    description: b,
    footer: attributeFooter(username, '🏆', 'pulled up the leaderboard'),
  };
}

const MESSAGE_LEVEL_BLURB: Record<string, { color: number; title: string; desc: string }> = {
  [MSG_LEVEL_ALL]: {
    color: 0x34d399,
    title: "🔔 Alex's messages: ALL",
    desc: 'Alex will send **everything** here — his random slice-of-life posts, care alerts when he needs something, and big life events.',
  },
  [MSG_LEVEL_CARE]: {
    color: 0xf59e0b,
    title: "🩹 Alex's messages: CARE ONLY",
    desc: 'Alex will only ping here when he **genuinely needs care** or hits a **life event** (growing up, passing out). No random chatter.',
  },
  [MSG_LEVEL_OFF]: {
    color: 0x6b7280,
    title: "🔕 Alex's messages: SILENT",
    desc: "Alex will be **completely silent** in this server — no proactive messages at all. Commands still work; he just won't message on his own.",
  },
};

// ─── Presence (bot status line) ───────────────────────────────────────────

export function presenceStage(st: string): string {
  switch (st) {
    case 'infant':
      return 'Baby Alex';
    case 'toddler':
      return 'Toddler Alex';
    case 'child':
      return 'Kid Alex';
    case 'teen':
      return 'Teen Alex';
    case 'adult':
      return 'Adult Alex';
    default:
      return 'Alex';
  }
}

export function presenceText(p: PetState): string {
  if (!p.alive) return '💀 passed out — someone /revive me';
  const m = mood(p);
  return `${m.emoji} ${presenceStage(p.lifeStage)} · ${m.label}`;
}

/** dnd when sick or gone, idle when sleepy, online otherwise. */
export function presenceStatus(p: PetState): string {
  if (!p.alive) return 'dnd';
  switch (mood(p).key) {
    case 'sick':
      return 'dnd';
    case 'sleepy':
      return 'idle';
    default:
      return 'online';
  }
}

export function introEmbed(): Embed {
  return {
    color: 0xa855f7,
    title: "🧋 ayo what's good — I'm Alex!",
    description:
      "sheeesh new server who dis 😤 I'm y'all's new lil buddy and this whole server is raisin me together fr.\n\n" +
      'I start out as a **baby** 👶 and grow all the way up to a **grown adult** 🧑‍💻 — but only if y\'all take care of me! ' +
      "I get hungry, tired, lonely, and funky, and if you neglect me too long I'll get sick and pass out 💀 (don't worry, `/revive` brings me back).\n\n" +
      "Every now and then I'll pop in here to ask for care or just tell y'all what I'm up to (probably gettin boba 🧋).",
    fields: [
      {
        name: '🎮 Take care of me',
        value: '`/alex` — check on me\n`/feed` — feed me (boba is elite 🧋)\n`/play` — play with me\n`/clean` — clean me up\n`/rest` — nap time',
        inline: true,
      },
      {
        name: '🚀 Help me grow',
        value:
          '`/study` — make me smarter 🧠\n`/career` — pick my dream job\n`/chat` — talk to me\n`/show` — see what I look like 📸\n`/newlife` — New Game+ once I\'m grown',
        inline: true,
      },
      { name: '🏆 Clout', value: "`/caretakers` — see who's the realest caretaker", inline: false },
    ],
    footer: { text: 'start me off right — try /feed 🧋' },
  };
}

/** Text channels the bot can most likely post in, best first (system channel, then by position). */
export function candidateIntroChannels(state: GatewayState, guildId: string): string[] {
  const g = state.guild(guildId);
  if (!g) return [];
  const botId = state.selfId;
  const sendable = (chId: string) => {
    if (!botId) return true;
    const perms = state.channelPermissions(botId, chId);
    if (perms === null) return true; // unknown — let the send decide
    return (perms & PERM.VIEW_CHANNEL) !== 0n && (perms & PERM.SEND_MESSAGES) !== 0n;
  };
  const texts = [...g.channels.values()]
    .filter((c) => c.type === CHANNEL_GUILD_TEXT)
    .sort((a, b) => a.position - b.position);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null) => {
    if (!id || seen.has(id) || !sendable(id)) return;
    seen.add(id);
    out.push(id);
  };
  add(g.systemChannelId);
  for (const c of texts) add(c.id);
  return out;
}

export interface PetServiceDeps {
  repo: PetRepo;
  imager: AlexImager;
  ai: PetAI;
  port: DiscordPort;
  state: GatewayState;
  logger: BotLogger;
  /** Base URL of the web app that renders the /caretakers image ("" = text only). */
  imageBaseURL: string;
}

export class PetService {
  private readonly locks = new KeyedMutex();
  private readonly cooldowns = new Map<string, number>();
  private prompt: ActivePrompt | null = null;
  readonly repo: PetRepo;
  readonly imager: AlexImager;
  readonly ai: PetAI;
  private readonly port: DiscordPort;
  private readonly state: GatewayState;
  private readonly logger: BotLogger;
  private readonly imageBaseURL: string;

  constructor(deps: PetServiceDeps) {
    this.repo = deps.repo;
    this.imager = deps.imager;
    this.ai = deps.ai;
    this.port = deps.port;
    this.state = deps.state;
    this.logger = deps.logger;
    this.imageBaseURL = deps.imageBaseURL.replace(/\/+$/, '');
  }

  private globalLock() {
    return this.locks.get(GLOBAL_PET_KEY);
  }

  /** Is `action` still cooling down for `key`? If not, stamp it now. */
  onCooldown(key: string, action: string, ms: number, now: number): boolean {
    const k = key + ':' + action;
    const last = this.cooldowns.get(k);
    if (last !== undefined && now - last < ms) return true;
    this.cooldowns.set(k, now);
    return false;
  }

  /** Load (or create) the global Alex, decay him, and remember this guild's channel. Lock held. */
  private async loadDecay(guildId: string, channelId: string, now: number): Promise<[PetState, DecayResult]> {
    const pet = (await this.repo.load(GLOBAL_PET_KEY)) ?? newPet(GLOBAL_PET_KEY, now);
    const res = applyDecay(pet, now);
    pet.lastInteractionAt = now;
    if (guildId && channelId) {
      await this.repo.recordGuildChannel(guildId, channelId).catch((e: Error) =>
        this.logger.warn({ event: 'discord_bot.record_guild_channel_failed', guildId, err: e.message }),
      );
    }
    return [pet, res];
  }

  private async creditCaretaker(userId: string, username: string, avatarHash: string, care: string): Promise<void> {
    if (!care) return;
    await this.repo
      .bumpCaretaker(GLOBAL_PET_KEY, userId, username, avatarHash, care, CARE_POINTS[care] ?? 0)
      .catch((e: Error) => this.logger.warn({ event: 'discord_bot.caretaker_credit_failed', userId, err: e.message }));
  }

  private async requireGuild(i: Interaction): Promise<string | null> {
    if (!i.guild_id) {
      await respondText(this.port, i, 'Alex hangs out in servers, not DMs 🏠 — use these commands in a server channel.').catch(
        () => undefined,
      );
      return null;
    }
    return i.guild_id;
  }

  private async editEmbed(i: Interaction, embed: Embed, files?: FileUpload[]): Promise<void> {
    await this.port.editOriginal(i.token, { embeds: [embed] }, files);
  }

  private async save(pet: PetState, what: string, guildId: string): Promise<void> {
    await this.repo
      .save(pet)
      .catch((e: Error) => this.logger.warn({ event: 'discord_bot.pet_save_failed', what, guildId, err: e.message }));
  }

  // ─── Commands ───────────────────────────────────────────────────────────

  async handleStatus(i: Interaction): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    await deferReply(this.port, i);
    const now = Date.now();
    const { username } = interactionUser(i);
    let snap: PetState;
    let res: DecayResult;
    const release = await this.globalLock().lock();
    try {
      try {
        [snap, res] = await this.loadDecay(guildId, i.channel_id ?? '', now);
      } catch {
        return await this.editEmbed(i, errEmbed("couldn't check on Alex rn"));
      }
      await this.save(snap, 'status', guildId);
      snap = { ...snap };
    } finally {
      release();
    }
    const m = mood(snap);
    const embed = statusEmbed(snap, m, now, res);
    embed.footer = attributeFooter(username, '👀', 'checked on Alex');
    const img = this.imager.cached(snap, m, now);
    if (img) embed.image = { url: 'attachment://' + img.filename };
    await this.editEmbed(i, embed, img ? [imageFile(img)] : undefined);
  }

  handleFeed(i: Interaction, kind: string): Promise<void> {
    const food = kind || 'boba';
    return this.simpleAction(i, 'feed', (p, now) => feed(p, food, now));
  }
  handlePlay(i: Interaction): Promise<void> {
    return this.simpleAction(i, 'play', play);
  }
  handleClean(i: Interaction): Promise<void> {
    return this.simpleAction(i, 'clean', clean);
  }
  handleRest(i: Interaction): Promise<void> {
    return this.simpleAction(i, 'rest', rest);
  }
  handleStudy(i: Interaction): Promise<void> {
    return this.simpleAction(i, 'study', study);
  }

  /** feed/play/clean/rest/study: lock, load, decay, mutate, persist, credit, render. */
  private async simpleAction(
    i: Interaction,
    name: string,
    mutate: (p: PetState, now: number) => ActionResult,
  ): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    await deferReply(this.port, i);
    const now = Date.now();
    const { id: userId, username } = interactionUser(i);
    let snap: PetState;
    let res: DecayResult;
    let result: ActionResult;
    const release = await this.globalLock().lock();
    try {
      let pet: PetState;
      try {
        [pet, res] = await this.loadDecay(guildId, i.channel_id ?? '', now);
      } catch {
        return await this.editEmbed(i, errEmbed("Alex isn't responding rn, try again"));
      }
      result = mutate(pet, now);
      await this.save(pet, name, guildId);
      snap = { ...pet };
    } finally {
      release();
    }
    const m = mood(snap);

    if (result.ok) {
      await this.creditCaretaker(userId, username, interactionAvatar(i), result.care);
      this.refreshPresence(snap);
    }
    let flavor = result.message;
    if (result.ok) flavor = (await this.ai.actionReaction(snap, name)) || result.message;

    const embed = statusEmbed(snap, m, now, res);
    embed.description = flavor + '\n\n' + embed.description;
    if (result.ok) embed.footer = attributeFooter(username, '🫶', 'looked after Alex');
    const img = this.imager.cached(snap, m, now);
    if (img) embed.image = { url: 'attachment://' + img.filename };
    await this.editEmbed(i, embed, img ? [imageFile(img)] : undefined);
  }

  /** /show — reuse or generate a picture, the paid call outside the lock. */
  async handleShow(i: Interaction): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    await deferReply(this.port, i);
    const now = Date.now();
    const { username } = interactionUser(i);
    let snap: PetState;
    let res: DecayResult;
    const release = await this.globalLock().lock();
    try {
      try {
        [snap, res] = await this.loadDecay(guildId, i.channel_id ?? '', now);
      } catch {
        return await this.editEmbed(i, errEmbed("couldn't find Alex rn"));
      }
      await this.save(snap, 'show', guildId);
      snap = { ...snap };
    } finally {
      release();
    }
    const m = mood(snap);
    const embed = statusEmbed(snap, m, now, res);
    embed.footer = attributeFooter(username, '📸', 'snapped a pic of Alex');

    const cached = this.imager.cached(snap, m, now);
    if (cached) {
      embed.image = { url: 'attachment://' + cached.filename };
      return this.editEmbed(i, embed, [imageFile(cached)]);
    }
    if (this.onCooldown(GLOBAL_PET_KEY, 'show', SHOW_COOLDOWN_MS, now)) {
      embed.description = '📸 Alex just took a pic — give him a sec before the next one!\n\n' + embed.description;
      return this.editEmbed(i, embed);
    }
    try {
      const img = await this.imager.generate(snap, m, now);
      embed.image = { url: 'attachment://' + img.filename };
      return await this.editEmbed(i, embed, [imageFile(img)]);
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.alex_image_failed', guildId, err: (err as Error).message });
      embed.description =
        "📸 couldn't snap a pic rn (camera's actin up) — here's how Alex is doin tho:\n\n" + embed.description;
      return this.editEmbed(i, embed);
    }
  }

  /** /revive — a dead Alex comes back as a gen-N+1 newborn. */
  async handleRevive(i: Interaction): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    await deferReply(this.port, i);
    const now = Date.now();
    const { username } = interactionUser(i);
    let snap: PetState;
    let wasAlive: boolean;
    const release = await this.globalLock().lock();
    try {
      let pet: PetState;
      try {
        [pet] = await this.loadDecay(guildId, i.channel_id ?? '', now);
      } catch {
        return await this.editEmbed(i, errEmbed('revive failed, try again'));
      }
      wasAlive = pet.alive;
      if (!wasAlive) {
        startNewLife(pet, now);
        await this.save(pet, 'revive', guildId);
      }
      snap = { ...pet };
    } finally {
      release();
    }
    const m = mood(snap);
    const embed = statusEmbed(snap, m, now, NO_DECAY);
    if (wasAlive) {
      let hint = 'Alex is alive and well — no need to revive 😎';
      if (canGraduate(snap)) hint += "\nHe's a grown adult now though — use `/newlife` to start a New Game+ 🎓";
      embed.description = hint + '\n\n' + embed.description;
      embed.footer = attributeFooter(username, '👀', 'checked on Alex');
      return this.editEmbed(i, embed);
    }
    this.refreshPresence(snap);
    embed.description =
      `✨ **Alex is reborn!** Welcome back to the world, lil guy (generation ${snap.generation}) 🍼\n${legacyNote(snap.intelligence)}\nTake better care this time fr 🙏\n\n` +
      embed.description;
    embed.footer = attributeFooter(username, '✨', 'revived Alex');
    return this.editEmbed(i, embed);
  }

  /** /newlife — voluntary New Game+ once Alex is a living adult. */
  async handleNewLife(i: Interaction): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    await deferReply(this.port, i);
    const now = Date.now();
    const { username } = interactionUser(i);
    let snap: PetState;
    let graduated = false;
    let prevGen = 0;
    let prevCareer = '';
    const release = await this.globalLock().lock();
    try {
      let pet: PetState;
      try {
        [pet] = await this.loadDecay(guildId, i.channel_id ?? '', now);
      } catch {
        return await this.editEmbed(i, errEmbed("couldn't start a new life rn, try again"));
      }
      if (canGraduate(pet)) {
        graduated = true;
        prevGen = pet.generation;
        prevCareer = careerDisplay(pet.career);
        startNewLife(pet, now);
        await this.save(pet, 'newlife', guildId);
      }
      snap = { ...pet };
    } finally {
      release();
    }
    const m = mood(snap);
    const embed = statusEmbed(snap, m, now, NO_DECAY);
    if (!graduated) {
      const reason = snap.alive
        ? 'Alex has to grow all the way up to an **Adult** before he can start a New Game+ 🎓'
        : 'Alex has passed out 💀 — use `/revive` to bring him back instead.';
      embed.description = reason + '\n\n' + embed.description;
      embed.footer = attributeFooter(username, '👀', 'checked on Alex');
      return this.editEmbed(i, embed);
    }
    this.refreshPresence(snap);
    embed.description =
      `🎓 **Alex graduated and started a whole new life!**\nGen ${prevGen} (${prevCareer}) lived a full life — say hi to **generation ${snap.generation}** 🍼\n${legacyNote(snap.intelligence)}\n\n` +
      embed.description;
    embed.footer = attributeFooter(username, '🎓', "started Alex's new life");
    return this.editEmbed(i, embed);
  }

  /** /career — view, or set a preset or custom career. */
  async handleCareer(i: Interaction, path: string): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    await deferReply(this.port, i);
    const now = Date.now();
    const { username } = interactionUser(i);
    let note = '';
    let footerVerb = "checked Alex's career";
    let footerEmoji = '👀';
    let setKnown = '';
    let setCustom = '';
    let snap: PetState;
    let res: DecayResult;
    const release = await this.globalLock().lock();
    try {
      let pet: PetState;
      try {
        [pet, res] = await this.loadDecay(guildId, i.channel_id ?? '', now);
      } catch {
        return await this.editEmbed(i, errEmbed("couldn't set Alex's career rn"));
      }
      if (path === '') {
        note = 'Alex is currently going for: **' + careerDisplay(pet.career) + '**\n' + careerOptionsLine();
      } else if (!pet.alive) {
        note = "Alex can't chase a career while he's passed out 💀 — `/revive` him first.";
      } else {
        const key = normalizeCareer(path);
        const custom = key ? '' : sanitizeCareer(path);
        if (key) {
          pet.career = key;
          setKnown = key;
        } else if (custom) {
          pet.career = custom;
          setCustom = custom;
        } else {
          note = "that career name ain't gonna work 😅 — try something like `swe`, `quant`, or anything you dream up.";
        }
        if (setKnown || setCustom) {
          if (pet.happiness < 100) pet.happiness = clampStat(pet.happiness + 6);
          footerVerb = "set Alex's dream job";
          footerEmoji = '🎯';
        }
      }
      await this.save(pet, 'career', guildId);
      snap = { ...pet };
    } finally {
      release();
    }
    if (setKnown) {
      note =
        'Alex is now chasing **' +
        careerDisplay(snap.career) +
        '** — ' +
        CAREER_BLURB[setKnown] +
        '\nKeep him `/study`-ing to make it happen 📚';
    } else if (setCustom) {
      const hype = (await this.ai.careerReaction(snap, setCustom)) || genericCareerBlurb(setCustom);
      note = 'Alex is now chasing **' + careerDisplay(snap.career) + '** — ' + hype + '\nKeep him `/study`-ing to make it happen 📚';
    }
    const embed = statusEmbed(snap, mood(snap), now, res);
    embed.description = note + '\n\n' + embed.description;
    embed.footer = attributeFooter(username, footerEmoji, footerVerb);
    return this.editEmbed(i, embed);
  }

  async handleRename(i: Interaction, name: string): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    const cleanName = sanitizePetName(name);
    if (!cleanName) return respondText(this.port, i, "that name ain't gonna work 😅 — try 1–32 regular characters.");
    await deferReply(this.port, i);
    const now = Date.now();
    const { username } = interactionUser(i);
    let snap: PetState;
    let res: DecayResult;
    let old: string;
    const release = await this.globalLock().lock();
    try {
      let pet: PetState;
      try {
        [pet, res] = await this.loadDecay(guildId, i.channel_id ?? '', now);
      } catch {
        return await this.editEmbed(i, errEmbed('rename failed, try again'));
      }
      old = pet.name;
      pet.name = cleanName;
      await this.save(pet, 'rename', guildId);
      snap = { ...pet };
    } finally {
      release();
    }
    const embed = statusEmbed(snap, mood(snap), now, res);
    embed.description = `📝 ${old} goes by **${cleanName}** now — "new name who dis 😎"\n\n` + embed.description;
    embed.footer = attributeFooter(username, '📝', 'renamed Alex');
    return this.editEmbed(i, embed);
  }

  /** /caretakers — the global leaderboard: the rendered image, falling back to text. */
  async handleCaretakers(i: Interaction): Promise<void> {
    if (!(await this.requireGuild(i))) return;
    await deferReply(this.port, i);
    const { username } = interactionUser(i);
    let rows: CaretakerRow[];
    try {
      rows = await this.repo.topCaretakers(GLOBAL_PET_KEY, 10);
    } catch {
      return this.editEmbed(i, errEmbed("couldn't load the leaderboard rn"));
    }
    if (rows.length === 0) {
      return this.editEmbed(i, {
        title: "🏆 Alex's Top Caretakers",
        color: 0xf59e0b,
        description: "nobody's taken care of Alex yet 👀 — be the first with `/feed`!",
        footer: attributeFooter(username, '🏆', 'pulled up the leaderboard'),
      });
    }
    if (!this.onCooldown(GLOBAL_PET_KEY, 'avatar_refresh', 5 * 60_000, Date.now())) {
      await this.refreshCaretakerAvatars(rows);
    }
    try {
      const png = await this.fetchCaretakersImage();
      if (png && png.length > 0) {
        return await this.editEmbed(
          i,
          {
            title: "🏆 Alex's Top Caretakers",
            color: 0xf59e0b,
            image: { url: 'attachment://caretakers.png' },
            footer: attributeFooter(username, '🏆', 'pulled up the leaderboard'),
          },
          [{ name: 'caretakers.png', data: png, contentType: 'image/png' }],
        );
      }
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.caretakers_image_unavailable', err: (err as Error).message });
    }
    return this.editEmbed(i, caretakersTextEmbed(rows, username));
  }

  /** Refresh the shown caretakers' avatars, bounded to 5s in total. */
  private async refreshCaretakerAvatars(rows: CaretakerRow[]): Promise<void> {
    const all = Promise.allSettled(
      rows.map(async (r) => {
        const u = await this.port.getUser(r.userId);
        await this.repo
          .setCaretakerAvatar(GLOBAL_PET_KEY, r.userId, u.avatar ?? '')
          .catch((e: Error) =>
            this.logger.warn({ event: 'discord_bot.caretaker_avatar_refresh_failed', userId: r.userId, err: e.message }),
          );
      }),
    );
    await Promise.race([all, new Promise((resolve) => setTimeout(resolve, 5_000).unref())]);
  }

  /** The rendered leaderboard PNG from the web app; null when no base URL is configured. */
  private async fetchCaretakersImage(): Promise<Buffer | null> {
    if (!this.imageBaseURL) return null;
    const res = await fetch(this.imageBaseURL + '/api/discord/activity-image?type=caretakers', {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`caretakers image HTTP ${res.status}`);
    const png = Buffer.from(await res.arrayBuffer()).subarray(0, 10 << 20);
    if (detectImageExt(png) !== '.png') throw new Error('caretakers image: not a PNG');
    return png;
  }

  /** /alexmessages — set or report this server's proactive-message level. */
  async handleSetMessages(i: Interaction, level: string): Promise<void> {
    const guildId = await this.requireGuild(i);
    if (!guildId) return;
    await deferReply(this.port, i);
    const { username } = interactionUser(i);
    if (level === '') {
      let current: string;
      try {
        current = await this.repo.guildMessageLevel(guildId);
      } catch {
        return this.editEmbed(i, errEmbed("couldn't read Alex's settings rn"));
      }
      const info = MESSAGE_LEVEL_BLURB[current] ?? MESSAGE_LEVEL_BLURB[MSG_LEVEL_ALL]!;
      return this.editEmbed(i, {
        color: info.color,
        title: "⚙️ Alex's messages here: currently **" + current.toUpperCase() + '**',
        description: info.desc + '\n\nChange it with `/alexmessages` → `all` · `care` · `off`.',
        footer: attributeFooter(username, '👀', "checked Alex's message settings"),
      });
    }
    const info = MESSAGE_LEVEL_BLURB[level];
    if (!info) return this.editEmbed(i, errEmbed('unknown setting — pick `all`, `care`, or `off`.'));
    try {
      await this.repo.setGuildMessageLevel(guildId, i.channel_id ?? '', level);
    } catch {
      return this.editEmbed(i, errEmbed("couldn't update Alex's settings rn"));
    }
    return this.editEmbed(i, {
      color: info.color,
      title: info.title,
      description: info.desc,
      footer: attributeFooter(username, '⚙️', "changed Alex's messages here"),
    });
  }

  // ─── Chat integration hooks ─────────────────────────────────────────────

  /** The guild's /prompt persona, or "" (a DB error falls back to the default persona). */
  async customPrompt(guildId: string): Promise<string> {
    if (!guildId) return '';
    try {
      return await this.repo.guildCustomPrompt(guildId);
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.read_custom_prompt_failed', guildId, err: (err as Error).message });
      return '';
    }
  }

  setCustomPrompt(guildId: string, prompt: string): Promise<void> {
    if (!guildId) return Promise.resolve();
    return this.repo.setGuildCustomPrompt(guildId, prompt);
  }

  /** A live state line for the /chat and mention system prompts ("" without pet context). */
  async statusLineForChat(guildId: string): Promise<string> {
    if (!guildId) return '';
    const now = Date.now();
    return this.globalLock().run(async () => {
      let pet: PetState | null;
      try {
        pet = await this.repo.load(GLOBAL_PET_KEY);
      } catch {
        return '';
      }
      if (!pet) return '';
      applyDecay(pet, now);
      const m = mood(pet);
      if (!pet.alive) {
        return (
          '\n\nCURRENT STATE: You (Alex) have PASSED OUT from neglect and can barely respond — you are NOT okay. ' +
          'Reply weakly and briefly, like you\'re barely hanging on. Do NOT ask for food, boba, play, or talk about ' +
          'normal daily life — only faintly acknowledge them and hint that you need someone to run /revive.'
        );
      }
      const career = pet.career ? 'chasing your goal: ' + careerDisplay(pet.career) : 'still figuring out what you wanna be';
      return (
        '\n\nCURRENT STATE (let this subtly color your reply, don\'t recite the numbers): ' +
        `you're a ${stageWord(pet.lifeStage)} right now, vibe: ${m.label}, and you're ${career} (intelligence ${Math.trunc(pet.intelligence)}/100). ` +
        `Hunger ${Math.trunc(pet.hunger)}/100, Energy ${Math.trunc(pet.energy)}/100, Hygiene ${Math.trunc(pet.hygiene)}/100, Happiness ${Math.trunc(pet.happiness)}/100, Health ${Math.trunc(pet.health)}/100. ` +
        'If a stat is low, naturally hint at needing it (e.g. hungry → crave boba/food; sleepy → tired; sad → want company). ' +
        'Let your career dream come through in how you talk.'
      );
    });
  }

  /** The global Alex, decayed, as a copy (null when missing or the DB is unavailable). */
  async snapshot(): Promise<PetState | null> {
    return this.globalLock().run(async () => {
      try {
        const pet = await this.repo.load(GLOBAL_PET_KEY);
        if (!pet) return null;
        applyDecay(pet, Date.now());
        return { ...pet };
      } catch {
        return null;
      }
    });
  }

  async isPassedOut(): Promise<boolean> {
    const s = await this.snapshot();
    return s !== null && !s.alive;
  }

  /** A mention: remember the channel and cheer Alex up a touch (no leaderboard credit). */
  async noteMentioned(guildId: string, channelId: string): Promise<void> {
    if (!guildId) return;
    const now = Date.now();
    await this.globalLock().run(async () => {
      let pet: PetState;
      try {
        [pet] = await this.loadDecay(guildId, channelId, now);
      } catch {
        return;
      }
      if (pet.alive) pet.happiness = clampStat(pet.happiness + 2);
      await this.repo.save(pet).catch(() => undefined);
    });
  }

  /** A /chat: stamp the chat, cheer him up, credit "talks". */
  async recordChat(guildId: string, channelId: string, userId: string, username: string, avatar: string): Promise<void> {
    if (!guildId) return;
    const now = Date.now();
    const ok = await this.globalLock().run(async () => {
      let pet: PetState;
      try {
        [pet] = await this.loadDecay(guildId, channelId, now);
      } catch {
        return false;
      }
      pet.lastChatAt = now;
      if (pet.alive) pet.happiness = clampStat(pet.happiness + 4);
      await this.repo.save(pet).catch(() => undefined);
      return true;
    });
    if (ok) await this.creditCaretaker(userId, username, avatar, 'talks');
  }

  // ─── Community prompts (pet_events.go) ──────────────────────────────────

  registerPrompt(style: string, channels: Set<string>, now: number): void {
    if (channels.size === 0) return;
    this.prompt = { style, channels, expiresAt: now + promptDuration(), claimed: new Set() };
  }

  /** Claim the live prompt in this channel: first time, in window, under the cap. Atomic (sync). */
  claimPrompt(channelId: string, userId: string, now: number): boolean {
    if (!channelId || !userId) return false;
    const p = this.prompt;
    if (!p || now > p.expiresAt) return false;
    if (!p.channels.has(channelId)) return false;
    if (p.claimed.has(userId) || p.claimed.size >= PROMPT_MAX_CLAIMS) return false;
    p.claimed.add(userId);
    return true;
  }

  async creditInteraction(userId: string, username: string, avatarHash: string): Promise<void> {
    await this.repo
      .bumpCaretaker(GLOBAL_PET_KEY, userId, username, avatarHash, 'interactions', INTERACTION_POINTS)
      .catch((e: Error) => this.logger.warn({ event: 'discord_bot.interaction_credit_failed', userId, err: e.message }));
  }

  // ─── Presence ───────────────────────────────────────────────────────────

  updatePresence(p: PetState): void {
    try {
      this.port.updatePresence({
        status: presenceStatus(p),
        activities: [{ name: 'Custom Status', type: 4, state: presenceText(p) }],
      });
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.presence_update_failed', err: (err as Error).message });
    }
  }

  /** Throttled presence refresh from a command handler. */
  refreshPresence(p: PetState): void {
    if (this.onCooldown(GLOBAL_PET_KEY, 'presence', PRESENCE_THROTTLE_MS, Date.now())) return;
    this.updatePresence(p);
  }

  // ─── One-time intro (pet_intro.go) ──────────────────────────────────────

  /** Post the per-guild intro once (persisted), into the first channel that accepts it. */
  async announceIntro(guildId: string): Promise<void> {
    if (!guildId) return;
    await this.locks.get(guildId).run(async () => {
      let sent: boolean;
      try {
        sent = await this.repo.guildIntroSent(guildId);
      } catch (err) {
        this.logger.warn({ event: 'discord_bot.intro_check_failed', guildId, err: (err as Error).message });
        return;
      }
      if (sent) return;
      let channelId = '';
      for (const ch of candidateIntroChannels(this.state, guildId)) {
        try {
          await this.port.send(ch, { embeds: [introEmbed()] });
          channelId = ch;
          break;
        } catch {
          /* try the next channel */
        }
      }
      if (!channelId) {
        this.logger.info({ event: 'discord_bot.intro_skipped_no_channel', guildId });
        return;
      }
      await this.repo
        .markGuildIntro(guildId, channelId)
        .catch((e: Error) => this.logger.warn({ event: 'discord_bot.intro_mark_failed', guildId, err: e.message }));
      this.logger.info({ event: 'discord_bot.intro_sent', guildId, channelId });
    });
  }

  // ─── Background caretaking tick (pet_care.go) ───────────────────────────

  /** One heartbeat: advance Alex, refresh presence, broadcast at most one proactive message. */
  async careTick(): Promise<void> {
    const now = Date.now();
    const pl = await this.decideGlobal(now);
    if (!pl) return;
    this.updatePresence(pl.pet);
    if (pl.kind === 'none') return;
    let channels: GuildChannel[];
    try {
      channels = await this.repo.allGuildChannels();
    } catch (err) {
      this.logger.warn({ event: 'discord_bot.care_tick_channels_failed', err: (err as Error).message });
      return;
    }
    if (channels.length === 0) return;
    await this.broadcast(pl, channels, now);
  }

  /** Under the lock: advance, choose the one message, stamp throttles and persist. */
  async decideGlobal(now: number): Promise<Plan | null> {
    return this.globalLock().run(async () => {
      let pet: PetState | null;
      try {
        pet = await this.repo.load(GLOBAL_PET_KEY);
      } catch (err) {
        this.logger.warn({ event: 'discord_bot.care_tick_load_failed', err: (err as Error).message });
        return null;
      }
      if (!pet) pet = newPet(GLOBAL_PET_KEY, now);
      const res = applyDecay(pet, now);
      let kind: ProactiveKind = 'none';
      let need = '';
      let promptStyle = '';
      if (res.died) kind = 'died';
      else if (res.grewUp) kind = 'grewUp';
      else {
        const ns = needs(pet);
        if (ns.length > 0) {
          if (dueSince(pet.lastCareAlertAt, careAlertInterval(), now)) {
            kind = 'careAlert';
            need = ns[0]!;
            pet.lastCareAlertAt = now;
          }
        } else if (pet.alive && ambientDue(pet.lastAmbientAt, now)) {
          pet.lastAmbientAt = now;
          if (Math.floor(Math.random() * 100) < 50) {
            kind = 'prompt';
            promptStyle = Math.floor(Math.random() * 100) < 55 ? PROMPT_STYLE_EVENT : PROMPT_STYLE_QUESTION;
          } else kind = 'ambient';
        }
      }
      // Persisted regardless of the send outcome, so a failed broadcast cannot re-spam next tick.
      await this.repo
        .save(pet)
        .catch((e: Error) => this.logger.warn({ event: 'discord_bot.care_tick_save_failed', err: e.message }));
      return { kind, pet: { ...pet }, need, promptStyle };
    });
  }

  private async broadcast(pl: Plan, channels: GuildChannel[], now: number): Promise<void> {
    let content = '';
    let embeds: Embed[] = [];
    let img: AlexImage | null = null;
    switch (pl.kind) {
      case 'died':
        embeds = [
          {
            color: 0x6b7280,
            title: '💀 RIP Alex (for now)',
            description: `**${pl.pet.name}** passed out from neglect... y'all gotta take better care 🥀\nSomeone run \`/revive\` to bring him back for a fresh start 🙏`,
          },
        ];
        break;
      case 'grewUp': {
        const embed: Embed = {
          color: 0x34d399,
          title: '🎉 Alex leveled up in life!',
          description: `**${pl.pet.name}** just grew into a **${STAGE_LABEL[pl.pet.lifeStage] ?? ''}**! 🥹 they really do grow up fast...\nsay hi with \`/chat\` or check on him with \`/alex\``,
        };
        embeds = [embed];
        try {
          img = await this.imager.generate(pl.pet, mood(pl.pet), now);
          embed.image = { url: 'attachment://' + img.filename };
        } catch {
          img = null;
        }
        break;
      }
      case 'careAlert':
        content = '🧋 **Alex:** ' + ((await this.ai.proactiveContent(pl)) || careAlertLine(pl.need));
        break;
      case 'ambient':
        content = '🧋 **Alex:** ' + ((await this.ai.proactiveContent(pl)) || ambientLine(pl.pet.lifeStage, pl.pet.career));
        break;
      case 'prompt':
        content =
          pl.promptStyle === PROMPT_STYLE_EVENT
            ? '🎉 **Alex — flash event!** ' + ((await this.ai.proactiveContent(pl)) || eventPromptLine())
            : '🧋 **Alex:** ' + ((await this.ai.proactiveContent(pl)) || questionPromptLine());
        break;
      default:
        return;
    }
    const promptChannels = new Set<string>();
    for (const gc of channels) {
      if (!wantsMessage(gc.messageLevel, pl.kind)) continue;
      try {
        await this.port.send(gc.channelId, { content, embeds }, img ? [imageFile(img)] : undefined);
        if (pl.kind === 'prompt') promptChannels.add(gc.channelId);
      } catch (err) {
        await this.handleSendError(gc.guildId, gc.channelId, err);
      }
    }
    if (pl.kind === 'prompt') this.registerPrompt(pl.promptStyle, promptChannels, now);
  }

  /** A gone/forbidden channel is forgotten so the bot stops hammering it; others are logged. */
  private async handleSendError(guildId: string, channelId: string, err: unknown): Promise<void> {
    const code = discordCode(err);
    if (code === ERR_UNKNOWN_CHANNEL || code === ERR_MISSING_ACCESS || code === ERR_MISSING_PERMISSIONS) {
      this.logger.info({ event: 'discord_bot.clearing_unreachable_channel', guildId, channelId, code });
      await this.repo
        .clearGuildChannel(guildId)
        .catch((e: Error) => this.logger.warn({ event: 'discord_bot.clear_guild_channel_failed', guildId, err: e.message }));
      return;
    }
    this.logger.warn({ event: 'discord_bot.proactive_send_failed', guildId, channelId, err: (err as Error)?.message });
  }
}
