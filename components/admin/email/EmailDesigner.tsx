import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/lib/toast';
import { serverError } from '@/lib/http';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import {
  adminEmailAiDesign,
  adminEmailDesignModels,
  adminEmailRender,
} from '@/lib/admin/email.contract';
import type { EmailDesign } from '@/lib/email/campaign-schema';
import type { CampaignCategory } from '@/lib/email/preferences';

type DesignModel = 'deepseek' | 'kimi';

interface Draft {
  subject: string;
  body: string;
  category: CampaignCategory;
  images: string[];
}

/** What a design was made from, so the panel can say when the text has moved on. */
const sourceKey = (d: Draft) => `${d.subject.trim()}\u0000${d.body.trim()}\u0000${d.images.join(' ')}`;

/**
 * The design panel: ask DeepSeek or Kimi to lay the email out with the brand
 * kit, or keep the plain layout. A design holds its own copy of the words, so
 * editing the message afterwards marks it as out of date.
 */
export function EmailDesigner({
  draft,
  design,
  onDesign,
}: {
  draft: Draft;
  design: EmailDesign | null;
  onDesign: (design: EmailDesign | null) => void;
}) {
  const { t } = useTranslation('admin');
  const [models, setModels] = useState<Record<DesignModel, boolean> | null>(null);
  const [model, setModel] = useState<DesignModel>('deepseek');
  const [direction, setDirection] = useState('');
  const [busy, setBusy] = useState(false);
  const [madeFrom, setMadeFrom] = useState<string | null>(null);

  useEffect(() => {
    api(adminEmailDesignModels)
      .then((m) => {
        setModels(m);
        if (!m.deepseek && m.kimi) setModel('kimi');
      })
      .catch(() => setModels({ deepseek: false, kimi: false }));
  }, []);

  const ready = draft.subject.trim().length > 0 && draft.body.trim().length > 0;
  const stale = design !== null && madeFrom !== null && madeFrom !== sourceKey(draft);
  const available = models ? models[model] : false;

  async function run() {
    setBusy(true);
    try {
      const r = await api(adminEmailAiDesign, {
        body: {
          subject: draft.subject.trim(),
          body: draft.body.trim(),
          category: draft.category,
          imageCount: draft.images.length,
          model,
          ...(direction.trim() ? { direction: direction.trim() } : {}),
        },
        timeoutMs: AI_TIMEOUT_MS * 2,
      });
      onDesign(r.design);
      setMadeFrom(sourceKey(draft));
    } catch (e) {
      toast.error(serverError(e) || t('email-design-failed', { defaultValue: 'The design could not be made' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="t-heading text-site-text">{t('email-design', { defaultValue: 'Design' })}</h2>
      <p className="t-body text-site-text-muted">
        {t('email-design-desc', {
          defaultValue:
            'Let DeepSeek or Kimi lay the email out with the RMH Studios brand: the logo, the Steel colours and type, and the house voice. It chooses the layout; the site draws it, so every design works in every inbox.',
        })}
      </p>
      <Tabs
        aria-label={t('email-design-model', { defaultValue: 'Designer' })}
        value={model}
        onChange={(id) => setModel(id as DesignModel)}
        tabs={[
          { id: 'deepseek', label: 'DeepSeek', disabled: models ? !models.deepseek : false },
          { id: 'kimi', label: 'Kimi', disabled: models ? !models.kimi : false },
        ]}
      />
      <Input
        value={direction}
        maxLength={300}
        placeholder={t('email-design-direction', {
          defaultValue: 'Direction (optional), for example: dark and calm, or make it feel like a launch',
        })}
        aria-label={t('email-design-direction-label', { defaultValue: 'Art direction' })}
        onChange={(e) => setDirection(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void run()}
          loading={busy}
          disabled={!ready || busy || !available}
        >
          <Sparkles aria-hidden />{' '}
          {design
            ? t('email-design-again', { defaultValue: 'Design again' })
            : t('email-design-run', { defaultValue: 'Design with AI' })}
        </Button>
        {design ? (
          <Button
            variant="ghost"
            onClick={() => {
              onDesign(null);
              setMadeFrom(null);
            }}
          >
            {t('email-design-plain', { defaultValue: 'Use the plain layout' })}
          </Button>
        ) : null}
        {models && !available ? (
          <span className="t-meta">
            {t('email-design-unavailable', { defaultValue: 'This designer is not configured.' })}
          </span>
        ) : null}
      </div>
      {design ? (
        <p className={stale ? 't-body text-site-danger' : 't-meta'}>
          {stale
            ? t('email-design-stale', {
                defaultValue:
                  'The message changed after it was designed. The design still has the old words: design again, or use the plain layout.',
              })
            : t('email-design-active', {
                defaultValue: 'This email will be sent with the design. Check it in the preview.',
              })}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The message exactly as a recipient gets it, rendered by the server and shown
 * in a sandboxed frame (no scripts, no same-origin access) at desktop or phone
 * width.
 */
export function EmailPreview({ draft, design }: { draft: Draft; design: EmailDesign | null }) {
  const { t } = useTranslation('admin');
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [rendered, setRendered] = useState<{ subject: string; html: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const key = `${sourceKey(draft)}\u0000${draft.category}\u0000${JSON.stringify(design)}`;

  useEffect(() => {
    if (!draft.subject.trim() && !draft.body.trim()) {
      setRendered(null);
      return;
    }
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api(adminEmailRender, {
        body: {
          subject: draft.subject,
          body: draft.body,
          category: draft.category,
          imageUrls: draft.images,
          design,
        },
      })
        .then((r) => {
          if (live) setRendered(r);
        })
        .catch(() => {})
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `key` stands in for the draft and design, whose identities change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-heading text-site-text">{t('email-preview', { defaultValue: 'Preview' })}</h2>
        <Tabs
          size="sm"
          aria-label={t('email-preview-width', { defaultValue: 'Preview width' })}
          value={width}
          onChange={(id) => setWidth(id as 'desktop' | 'phone')}
          tabs={[
            { id: 'desktop', label: t('email-preview-desktop', { defaultValue: 'Desktop' }) },
            { id: 'phone', label: t('email-preview-phone', { defaultValue: 'Phone' }) },
          ]}
        />
      </div>
      {rendered ? (
        <>
          <p className="t-meta">
            {t('email-preview-subject', { subject: rendered.subject, defaultValue: 'Subject: {{subject}}' })}
          </p>
          <div className="flex justify-center rounded-site border border-site-border bg-site-bg-subtle p-2">
            <iframe
              title={t('email-preview-frame', { defaultValue: 'Email preview' })}
              sandbox=""
              srcDoc={rendered.html}
              className="h-[640px] max-w-full rounded-site-sm border-0 bg-site-surface"
              style={{ width: width === 'desktop' ? 640 : 375 }}
            />
          </div>
        </>
      ) : loading ? (
        <Spinner />
      ) : (
        <p className="t-body text-site-text-muted">
          {t('email-preview-empty', { defaultValue: 'Write a subject and a message to see the email.' })}
        </p>
      )}
    </section>
  );
}
