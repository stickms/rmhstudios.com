/**
 * uiHelpers.ts — Shared UI helper functions for Signal Forge overlays
 *
 * Card keyword tags, colour lookups, and rarity border classes used by
 * every sub-component that renders cards or relics.
 */

import type { Card } from '@/lib/signal-forge/Card';
import { KEYWORD_GLOSSARY } from '@/lib/signal-forge/Glossary';

/** Build a structured list of keyword/ability tags for a card. */
export function cardKeywordTags(card: Card): string[] {
  const tags: string[] = [];
  if (card.echo) tags.push('Echo');
  if (card.aoe) tags.push('AOE');
  if (card.exhaust) tags.push('Exhaust');
  if (card.sustain) tags.push('Sustain');
  if (card.wildcard) tags.push('Wildcard');
  if (card.isGlitch) tags.push('Glitch');
  if (card.leech) tags.push('Leech');
  if (card.stabilize) tags.push('Stabilize');
  if (card.piercing) tags.push('Piercing');
  if (card.chain) tags.push('Chain');
  if (card.growing) tags.push('Growing');
  if (card.retain) tags.push('Retain');
  if (card.multihit && card.multihit > 1) tags.push('Multihit');
  if (card.innate) tags.push('Innate');
  if (card.ethereal) tags.push('Ethereal');
  if (card.siphon) tags.push('Siphon');
  if (card.bleed) tags.push('Bleed');
  if (card.freeze) tags.push('Freeze');
  if (card.vulnerable) tags.push('Vulnerable');
  if (card.weak) tags.push('Weak');
  if (card.upgraded) tags.push('Upgraded');
  return tags;
}

/** Keyword badge Tailwind classes. */
export function keywordColor(kw: string): string {
  const map: Record<string, string> = {
    Echo: 'bg-purple-700 text-purple-200',
    AOE: 'bg-orange-700 text-orange-200',
    Exhaust: 'bg-red-800 text-red-300',
    Sustain: 'bg-green-700 text-green-200',
    Wildcard: 'bg-yellow-700 text-yellow-200',
    Glitch: 'bg-red-600 text-red-100',
    Leech: 'bg-emerald-700 text-emerald-200',
    Stabilize: 'bg-sky-700 text-sky-200',
    Piercing: 'bg-yellow-600 text-yellow-100',
    Chain: 'bg-orange-600 text-orange-100',
    Growing: 'bg-green-600 text-green-100',
    Retain: 'bg-purple-600 text-purple-100',
    Multihit: 'bg-red-700 text-red-200',
    Innate: 'bg-cyan-700 text-cyan-200',
    Ethereal: 'bg-pink-700 text-pink-200',
    Siphon: 'bg-teal-700 text-teal-200',
    Bleed: 'bg-red-600 text-red-200',
    Freeze: 'bg-blue-700 text-blue-200',
    Vulnerable: 'bg-orange-800 text-orange-200',
    Weak: 'bg-yellow-800 text-yellow-200',
    Upgraded: 'bg-amber-600 text-amber-100',
  };
  return map[kw] ?? 'bg-slate-600 text-slate-200';
}

/** Tooltip description for a keyword tag. */
export function keywordTooltip(kw: string): string {
  return KEYWORD_GLOSSARY[kw] ?? '';
}

/** Waveform type text colour. */
export function typeColor(type: string): string {
  const map: Record<string, string> = {
    Pulse: 'text-red-400',
    Sine: 'text-blue-400',
    Saw: 'text-green-400',
    Noise: 'text-pink-400',
  };
  return map[type] ?? 'text-slate-400';
}

/** Card rarity left-border + background class. */
export function rarityBorder(rarity: string): string {
  if (rarity === 'rare') return 'border-l-purple-500 bg-purple-900/20';
  if (rarity === 'uncommon') return 'border-l-blue-500 bg-blue-900/20';
  return 'border-l-slate-500 bg-slate-800';
}

/** Relic rarity left-border + background class. */
export function relicRarityBorder(rarity: string): string {
  if (rarity === 'rare') return 'border-l-purple-500 bg-purple-900/20';
  if (rarity === 'uncommon') return 'border-l-orange-500 bg-orange-900/20';
  return 'border-l-yellow-600 bg-yellow-900/20';
}
