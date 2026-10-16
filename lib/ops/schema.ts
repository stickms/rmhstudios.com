import { z } from 'zod';
import { LOCALES } from '@/lib/i18n/config';

export const NOTICE_SEGMENTS = ['all', 'new', 'game', 'locale'] as const;
export type NoticeSegment = (typeof NOTICE_SEGMENTS)[number];

export const createNoticeSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    linkUrl: z
      .string()
      .trim()
      .max(300)
      .regex(/^(\/(?!\/)|https:\/\/)/, 'Use a site path or an https link')
      .optional(),
    segment: z.enum(NOTICE_SEGMENTS),
    segmentValue: z.string().trim().min(1).max(64).optional(),
    endsAt: z.string().datetime().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.segment === 'game' && !v.segmentValue) {
      ctx.addIssue({ code: 'custom', path: ['segmentValue'], message: 'Pick a game' });
    }
    if (v.segment === 'locale' && !(LOCALES as readonly string[]).includes(v.segmentValue ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['segmentValue'], message: 'Unknown locale' });
    }
  });
export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;

export const createExperimentSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'lowercase letters, digits, dashes'),
  name: z.string().trim().min(1).max(120),
  testPct: z.number().int().min(1).max(100).default(50),
});

export const updateExperimentSchema = z.object({
  id: z.string().min(1).max(40),
  status: z.enum(['DRAFT', 'RUNNING', 'STOPPED']).optional(),
  testPct: z.number().int().min(1).max(100).optional(),
});

export const experimentEventSchema = z.object({
  key: z.string().max(64),
  event: z.enum(['expose', 'convert']),
});

/** FNV-1a 32-bit — sticky, dependency-free bucket from a string. */
export function hashBucket(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

export type Variant = 'control' | 'test';

export function assignVariant(userId: string, key: string, testPct: number): Variant {
  return hashBucket(`${key}:${userId}`) < testPct ? 'test' : 'control';
}

export interface ArmCounts {
  exposed: number;
  converted: number;
}

/** Two-proportion z-test (two-sided). Null until both arms have data. */
export function significance(control: ArmCounts, test: ArmCounts) {
  if (control.exposed < 1 || test.exposed < 1) return null;
  const p1 = control.converted / control.exposed;
  const p2 = test.converted / test.exposed;
  const pooled = (control.converted + test.converted) / (control.exposed + test.exposed);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / control.exposed + 1 / test.exposed));
  if (se === 0) return { p1, p2, lift: p2 - p1, z: 0, pValue: 1 };
  const z = (p2 - p1) / se;
  return { p1, p2, lift: p2 - p1, z, pValue: 2 * (1 - normalCdf(Math.abs(z))) };
}

function normalCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * (x / Math.SQRT2));
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const poly = ((((a[4] * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0]) * t;
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + erf);
}

/** Stable error fingerprint input: message with volatile bits normalised + top stack frame. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/0x[0-9a-f]+/gi, '0x*')
    .replace(/\b[0-9a-f]{8,}\b/gi, '*')
    .replace(/\d+/g, 'N')
    .slice(0, 200);
}

export function topFrameOf(stack: string | undefined): string {
  if (!stack) return '';
  const line = stack
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^at |@/.test(l));
  if (!line) return '';
  return line
    .replace(/https?:\/\/[^/\s)]+/g, '')
    .replace(/[?#][^\s)]*/g, '')
    .replace(/-[A-Za-z0-9_]{8,}(\.[a-z]+)/g, '-*$1')
    .replace(/:\d+:\d+/g, '')
    .slice(0, 300);
}
