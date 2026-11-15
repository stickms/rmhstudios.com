/**
 * Pictures of Alex in his current stage + mood (port of discordbot/pet_image.go), via the xAI
 * image API — the same provider and the same shared daily budget (image_gen_budget) as the web
 * tier's bot images. The bytes are attached to the Discord message directly (attachment://alex.png).
 *
 * Cost control: an in-memory cache per pet keyed by stage+mood+generation, the global daily cap,
 * and the /show cooldown in the service. Any failure throws, and every caller degrades to a
 * stats-only reply.
 */
import { timedAiFetch } from '../../lib/ai/timed-fetch.server';
import type { Mood, PetState } from './pet';
import type { PetRepo } from './pet-repo';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_XAI_MODEL = 'grok-imagine-image';
const IMAGE_CACHE_TTL_MS = 24 * 3_600_000;
const HTTP_TIMEOUT_MS = 60_000;

export interface AlexImage {
  bytes: Buffer;
  ext: string;
  filename: string;
}

/** The key of one look: stage + mood + generation (a new life gets fresh art). */
export function cacheKey(p: PetState, m: Mood): string {
  return `${p.lifeStage}:${m.key}:g${p.generation}`;
}

/** XAI_IMAGE_DAILY_CAP (default 50). */
export function imageDailyCapEnv(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.XAI_IMAGE_DAILY_CAP ?? '', 10);
  return Number.isFinite(n) && n > 0 && /^\d+$/.test((env.XAI_IMAGE_DAILY_CAP ?? '').trim()) ? n : 50;
}

export class AlexImager {
  private readonly apiKey = process.env.XAI_API_KEY ?? '';
  private readonly model = process.env.XAI_IMAGE_MODEL || DEFAULT_XAI_MODEL;
  private readonly cache = new Map<string, { key: string; img: AlexImage; at: number }>();

  constructor(
    private readonly repo: PetRepo,
    private readonly fetchImpl: typeof fetch = timedAiFetch,
  ) {}

  configured(): boolean {
    return this.apiKey !== '' && process.env.XAI_IMAGE_ENABLED !== 'false';
  }

  cached(p: PetState, m: Mood, now: number): AlexImage | null {
    const c = this.cache.get(p.guildId);
    return c && c.key === cacheKey(p, m) && now - c.at < IMAGE_CACHE_TTL_MS ? c.img : null;
  }

  async generate(p: PetState, m: Mood, now: number): Promise<AlexImage> {
    const hit = this.cached(p, m, now);
    if (hit) return hit;
    if (!this.configured()) throw new Error('image generation not configured');

    let ok: boolean;
    try {
      ok = await this.repo.reserveImageBudget(new Date(now).toISOString().slice(0, 10), imageDailyCapEnv());
    } catch {
      ok = false;
    }
    if (!ok) throw new Error('image budget unavailable');

    const url = await this.requestImage(buildAlexImagePrompt(p, m)).catch((e: Error) => {
      throw new Error(`xai request failed: ${e.message}`);
    });
    if (!url) throw new Error('xai request failed: no image url');
    const raw = await this.download(url).catch((e: Error) => {
      throw new Error(`image download failed: ${e.message}`);
    });
    if (raw.length === 0) throw new Error('image download failed: empty');
    const ext = detectImageExt(raw);
    if (!ext) throw new Error('unrecognized image bytes');

    const img: AlexImage = { bytes: raw, ext, filename: 'alex' + ext };
    this.cache.set(p.guildId, { key: cacheKey(p, m), img, at: now });
    return img;
  }

  private async requestImage(prompt: string): Promise<string> {
    const res = await this.fetchImpl(`${XAI_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, prompt, n: 1 }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) throw new Error(`xai HTTP ${res.status}`);
    const parsed = JSON.parse(text.slice(0, 1 << 20)) as { data?: Array<{ url?: string }> };
    return parsed.data?.[0]?.url ?? '';
  }

  private async download(url: string): Promise<Buffer> {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (res.status < 200 || res.status >= 300) throw new Error(`download HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, 10 << 20);
  }
}

const STAGE_PROMPT: Record<string, string> = {
  infant:
    'a chubby-cheeked BABY version, big round sparkly eyes, a tiny tuft of black hair, wearing a cozy onesie, cradling a baby bottle filled with boba',
  toddler: 'an adorable TODDLER with messy black hair, wearing an oversized hoodie, clutching a tiny tablet',
  child: 'a cheerful KID around 8 years old, black bowl-cut hair, graphic tee, little backpack',
  teen: 'a lanky TEENAGER with a black hair fade, hoodie and AirPods, scrolling a phone',
  adult:
    'a 21-year-old college tech-intern with a clean black hair fade, wearing a startup hoodie with a conference lanyard, holding a boba tea',
};

const MOOD_PROMPT: Record<string, string> = {
  thriving: 'beaming with a big confident smile, radiating positive energy, sparkles around him',
  chillin: 'relaxed and content, easy smile, sipping boba',
  hungry: 'looking hungry with a rumbling tummy, holding an empty boba cup upside down, pleading eyes',
  sleepy: 'mid-yawn with sleepy droopy eyes, rubbing one eye, little Zzz floating',
  stinky: 'looking disheveled and grimy with a small green stink cloud, hair a mess',
  sad: 'looking sad and lonely with teary puppy-dog eyes',
  sick: 'looking pale and sick with a thermometer in his mouth and a sweat drop, ice pack on head',
  gone: 'drawn as a cute little friendly ghost with swirly X eyes, floating',
};

const CAREER_VISUAL: Record<string, string> = {
  swe: 'styled as a software engineer with a laptop covered in stickers and a mechanical keyboard',
  data: 'styled as a data scientist surrounded by little floating charts and graphs',
  founder: 'styled as a startup founder in a branded hoodie giving a tiny pitch-deck presentation',
  quant: 'styled as a quant with floating stock charts and math equations around him',
  pm: 'styled as a product manager holding sticky notes and a roadmap',
  design: 'styled as a UX designer sketching wireframes on a tablet with a stylus',
};

/** The text-to-image prompt. Fully descriptive, no user text (a custom career is never drawn). */
export function buildAlexImagePrompt(p: PetState, m: Mood): string {
  const stage = STAGE_PROMPT[p.lifeStage] || STAGE_PROMPT.adult!;
  const expr = MOOD_PROMPT[m.key] || MOOD_PROMPT.chillin!;
  let s =
    'Cute chibi digital illustration in a wholesome virtual-pet / Tamagotchi art style of Alex Wu, ' +
    'an Asian-American Gen-Z computer-science student and tech intern who is obsessed with boba tea. ' +
    'Depict him as ' +
    stage +
    ', ' +
    expr;
  if (p.alive && (p.lifeStage === 'teen' || p.lifeStage === 'adult')) {
    const cv = Object.hasOwn(CAREER_VISUAL, p.career) ? CAREER_VISUAL[p.career] : '';
    if (cv) s += ', ' + cv;
  }
  s +=
    '. Single centered character, full body, expressive, vibrant saturated colors, ' +
    'soft studio lighting, clean simple pastel gradient background, thick clean outlines. ' +
    'No text, no words, no letters, no logos in the image.';
  return s;
}

/** Image magic bytes → extension ("" when not an image we accept). */
export function detectImageExt(buf: Uint8Array): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && png.every((b, i) => buf[i] === b)) return '.png';
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (buf.length >= 4 && ascii(0, 4) === 'GIF8') return '.gif';
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return '.webp';
  return '';
}

export function contentTypeForExt(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}
