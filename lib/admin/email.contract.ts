/**
 * Contracts for /api/admin/email/** — the admin email composer (/admin/email).
 * Client-safe: request types come from the zod schemas by `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  AiDesignBody,
  AiImageBody,
  EmailDesign,
  RenderBody,
  AiRewriteBody,
  Audience,
  CreateCampaignBody,
  PreviewBody,
  TestSendBody,
} from '@/lib/email/campaign-schema';
import type { CampaignCategory } from '@/lib/email/preferences';

export interface EmailRecipientSummary {
  id: string;
  name:
    | string
    | null;
  handle:
    | string
    | null;
  email:
    | string
    | null;
}

export interface EmailAudiencePreview {
  matched: number;
  eligible: number;
  optedOut: number;
  duplicates: number;
  throttled: number;
  sample: EmailRecipientSummary[];
}

export interface EmailCampaignRow {
  id: string;
  subject: string;
  category: CampaignCategory;
  audienceMode: Audience['mode'];
  status:
    | 'sending'
    | 'sent'
    | 'failed';
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  duplicates: number;
  throttled: number;
  /** The admin sent past the frequency cap for this campaign. */
  ignoreFrequencyCap: boolean;
  createdAt: string;
  finishedAt:
    | string
    | null;
  author:
    | string
    | null;
  canResume: boolean;
}

export const adminEmailPreview =
  endpoint<{
    body: PreviewBody;
    res: EmailAudiencePreview;
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/preview',
    },
  );

export const adminEmailUserSearch =
  endpoint<{
    query: {
      q: string;
    };
    res: {
      users: (EmailRecipientSummary & {
        image:
          | string
          | null;
      })[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/email/users',
    },
  );

export const adminEmailTest =
  endpoint<{
    body: TestSendBody;
    res: {
      ok: boolean;
      to:
        | string
        | null;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/test',
    },
  );

export const adminEmailCampaigns =
  endpoint<{
    res: {
      campaigns: EmailCampaignRow[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/email/campaigns',
    },
  );

export const adminEmailSend =
  endpoint<{
    body: CreateCampaignBody;
    /** `duplicate`: the same message was sent moments ago; this is that send, not a new one. */
    res: {
      id: string;
      total: number;
      skipped: number;
      duplicate: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/campaigns',
    },
  );

export const adminEmailResume =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/campaigns/$id/resume',
    },
  );

/* ── AI writing help (admin only; 503 when the model is not configured). Drafting
   the subject or body goes through /api/rmharks/ai-generate (email modes), like the
   compose box. ── */

/** Rewrite the whole body or the highlighted passage; the result replaces it in place. */
export const adminEmailAiRewrite =
  endpoint<{
    body: AiRewriteBody;
    res: {
      text: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/ai/rewrite',
    },
  );

/** A picture themed on the draft, stored as a site image. */
export const adminEmailAiImage =
  endpoint<{
    body: AiImageBody;
    res: {
      url: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/ai/image',
    },
  );

/** Which AI designers are configured (DeepSeek, Kimi). */
export const adminEmailDesignModels =
  endpoint<{
    res: {
      deepseek: boolean;
      kimi: boolean;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/email/ai/design',
    },
  );

/** Design the email with DeepSeek or Kimi from the draft and the brand kit. */
export const adminEmailAiDesign =
  endpoint<{
    body: AiDesignBody;
    res: {
      design: EmailDesign;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/ai/design',
    },
  );

/** The message exactly as a recipient gets it, for the preview pane. */
export const adminEmailRender =
  endpoint<{
    body: RenderBody;
    res: {
      subject: string;
      html: string;
      design: EmailDesign | null;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/email/render',
    },
  );
