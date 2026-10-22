/**
 * Massive March signals (R18) — templated hints left at puzzle sites.
 *
 * There is deliberately no free text. A signal is a fixed phrase id plus, for a
 * few phrases, a glyph or a small number. The phrases live in the UI (i18n); the
 * server only knows which ids and parameter kinds are legal.
 */
import { z } from 'zod';
import { SYMBOLS } from './world/sites';

export type SignalParam = 'none' | 'symbol' | 'number';

export const SIGNAL_TEMPLATES = {
  'look-again': 'none',
  listen: 'none',
  'wait-all': 'none',
  order: 'none',
  slow: 'none',
  trust: 'none',
  'glyph-first': 'symbol',
  'glyph-avoid': 'symbol',
  count: 'number',
} as const satisfies Record<string, SignalParam>;

export type SignalTemplate = keyof typeof SIGNAL_TEMPLATES;
export const SIGNAL_TEMPLATE_IDS = Object.keys(SIGNAL_TEMPLATES) as SignalTemplate[];

export const MAX_SIGNALS_PER_AUTHOR_PER_SITE = 3;
export const SIGNALS_SHOWN = 8;

/** Is `param` a legal parameter for `template`? */
export function paramIsValid(template: SignalTemplate, param: string): boolean {
  switch (SIGNAL_TEMPLATES[template]) {
    case 'none':
      return param === '';
    case 'symbol':
      return (SYMBOLS as readonly string[]).includes(param);
    case 'number':
      return /^[1-9]$/.test(param);
  }
}

export const postSignalSchema = z
  .object({
    siteId: z.string().min(1).max(40),
    template: z.enum(SIGNAL_TEMPLATE_IDS as [SignalTemplate, ...SignalTemplate[]]),
    param: z.string().max(16).default(''),
  })
  .refine((v) => paramIsValid(v.template, v.param));

export const voteSignalSchema = z.object({
  signalId: z.string().min(1).max(40),
  /** 0 withdraws a previous vote. */
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

export const listSignalsQuerySchema = z.object({ siteId: z.string().min(1).max(40) });

export interface SignalView {
  id: string;
  template: SignalTemplate;
  param: string;
  score: number;
  myVote: -1 | 0 | 1;
  mine: boolean;
}
