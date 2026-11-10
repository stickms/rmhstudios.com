/**
 * Contracts for the RMHLadder resume calls (redesign audit C1). Client-safe.
 * Their routes keep bespoke error mapping inside the handler (analyze reserves
 * an AI budget and maps service errors to statuses), so they stay hand-written
 * and the contract types the client side. Upload is multipart and stays raw.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { CandidateProfile } from '@/lib/rmhladder/resume/schemas';

export const analyzeLadderResumeApi = endpoint<{
  body: { versionId: string };
  res: Record<string, unknown>;
}>()({ method: 'POST', path: '/api/rmhladder/resume/$id/analyze' });

export const confirmLadderResumeApi = endpoint<{
  body: { versionId: string; profile: CandidateProfile };
  res: Record<string, unknown>;
}>()({ method: 'POST', path: '/api/rmhladder/resume/$id/confirm' });

export const deleteLadderResumeApi = endpoint<{ res: Record<string, unknown> }>()({
  method: 'DELETE',
  path: '/api/rmhladder/resume/$id',
});
