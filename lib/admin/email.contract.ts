/**
 * Contracts for /api/admin/email/** — the admin email composer (/admin/email).
 * Client-safe: request types come from the zod schemas by `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  Audience,
  CreateCampaignBody,
  PreviewBody,
  TestSendBody,
} from '@/lib/email/campaign-schema';
import type { CampaignCategory } from '@/lib/email/preferences';

export interface EmailRecipientSummary {
  id: string;
  name: string | null;
  handle: string | null;
  email: string | null;
}

export interface EmailAudiencePreview {
  matched: number;
  eligible: number;
  optedOut: number;
  sample: EmailRecipientSummary[];
}

export interface EmailCampaignRow {
  id: string;
  subject: string;
  category: CampaignCategory;
  audienceMode: Audience['mode'];
  status: 'sending' | 'sent' | 'failed';
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  createdAt: string;
  finishedAt: string | null;
  author: string | null;
  canResume: boolean;
}

export const adminEmailPreview = endpoint<{ body: PreviewBody; res: EmailAudiencePreview }>()({
  method: 'POST',
  path: '/api/admin/email/preview',
});

export const adminEmailUserSearch = endpoint<{
  query: { q: string };
  res: { users: (EmailRecipientSummary & { image: string | null })[] };
}>()({ method: 'GET', path: '/api/admin/email/users' });

export const adminEmailTest = endpoint<{
  body: TestSendBody;
  res: { ok: boolean; to: string | null };
}>()({ method: 'POST', path: '/api/admin/email/test' });

export const adminEmailCampaigns = endpoint<{ res: { campaigns: EmailCampaignRow[] } }>()({
  method: 'GET',
  path: '/api/admin/email/campaigns',
});

export const adminEmailSend = endpoint<{
  body: CreateCampaignBody;
  res: { id: string; total: number; skipped: number };
}>()({ method: 'POST', path: '/api/admin/email/campaigns' });

export const adminEmailResume = endpoint<{
  res: { ok: true };
}>()({ method: 'POST', path: '/api/admin/email/campaigns/$id/resume' });
