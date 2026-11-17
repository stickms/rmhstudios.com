/**
 * The link-preview card path for a research page (`lib/rmh-research/api/`).
 * Client-safe: route `head()`s pass it to `buildMeta({ image })`.
 */
import { OG_CARD_VERSION } from '@/lib/og/static-cards';
import type { ResearchCardKind } from './research.contract';

export function researchCardPath(kind: ResearchCardKind, id: string): string {
  return `/api/og/research/${kind}/${encodeURIComponent(id)}?v=${OG_CARD_VERSION}`;
}
