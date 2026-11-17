import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { serverError } from '@/lib/http';
import { api } from '@/lib/contract/client';
import {
  adminEmailPreview,
  adminEmailSend,
  adminEmailTest,
  type EmailAudiencePreview,
  type EmailRecipientSummary,
} from '@/lib/admin/email.contract';
import { CAMPAIGN_CATEGORIES, type CampaignCategory } from '@/lib/email/preferences';
import { MAX_BODY, MAX_SUBJECT, type Audience } from '@/lib/email/campaign-schema';
import { BULK_MIN_GAP_HOURS } from '@/lib/email/frequency';
import {
  AudienceEditor,
  EMPTY_FILTERS,
  recipientName,
  toFilters,
  type AudienceMode,
  type FilterDraft,
} from '@/components/admin/email/AudienceEditor';
import { CampaignHistory } from '@/components/admin/email/CampaignHistory';
import { categoryHelp, categoryName } from '@/components/admin/email/labels';

/**
 * The admin email composer: write a message, pick its type and audience, see
 * who it reaches, send a test to yourself, then send. The send itself runs in
 * the jobs worker (`lib/email/campaign.server.ts`); the history below shows
 * its progress.
 */
export function EmailComposer() {
  const { t } = useTranslation('admin');
  const confirm = useConfirm();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<CampaignCategory>('announcements');
  const [mode, setMode] = useState<AudienceMode>('all');
  const [filters, setFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<EmailRecipientSummary[]>([]);

  const [preview, setPreview] = useState<EmailAudiencePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const audience: Audience | null = useMemo(() => {
    if (mode === 'all') return { mode: 'all' };
    if (mode === 'filter') return { mode: 'filter', filters: toFilters(filters) };
    return selected.length > 0 ? { mode: 'manual', userIds: selected.map((u) => u.id) } : null;
  }, [mode, filters, selected]);
  const audienceKey = JSON.stringify(audience);

  // The draft goes into the preview too, so it can count who already had this exact message.
  const draftKey = `${subject.trim()}\u0000${body.trim()}`;

  // Re-count whenever the audience, the type or the draft changes, after a short pause in typing.
  useEffect(() => {
    if (!audience) {
      setPreview(null);
      return;
    }
    let live = true;
    setPreviewing(true);
    const timer = setTimeout(() => {
      api(adminEmailPreview, {
        body: {
          audience,
          category,
          ...(subject.trim() && body.trim() ? { subject: subject.trim(), body: body.trim() } : {}),
        },
      })
        .then((p) => {
          if (live) setPreview(p);
        })
        .catch(() => {
          if (live) setPreview(null);
        })
        .finally(() => {
          if (live) setPreviewing(false);
        });
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // audienceKey and draftKey stand in for `audience` and the draft fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey, category, draftKey]);

  const draftReady = subject.trim().length > 0 && body.trim().length > 0;
  const canSend = draftReady && !!audience && !!preview && preview.eligible > 0 && !previewing;

  async function sendTest() {
    if (!draftReady) return;
    setTesting(true);
    try {
      const r = await api(adminEmailTest, {
        body: { subject: subject.trim(), body: body.trim(), category },
      });
      if (r.ok && r.to) {
        toast.success(t('email-test-sent', { to: r.to, defaultValue: 'Test sent to {{to}}' }));
      } else {
        toast.error(t('email-test-failed', { defaultValue: 'The test could not be sent' }));
      }
    } catch (e) {
      toast.error(serverError(e) || t('email-test-failed', { defaultValue: 'The test could not be sent' }));
    } finally {
      setTesting(false);
    }
  }

  async function send() {
    if (!canSend || !audience || !preview) return;
    const ok = await confirm({
      title: t('email-confirm-title', {
        count: preview.eligible,
        defaultValue_one: 'Send to {{count}} person?',
        defaultValue: 'Send to {{count}} people?',
      }),
      description:
        category === 'service'
          ? t('email-confirm-service', {
              defaultValue:
                'This is a required notice: it goes to everyone in the audience, including people who turned email off. It cannot be recalled once sent.',
            })
          : t('email-confirm-desc', { defaultValue: 'An email cannot be recalled once sent.' }),
      confirmLabel: t('email-send', { defaultValue: 'Send' }),
      danger: category === 'service',
    });
    if (!ok) return;
    setSending(true);
    try {
      const r = await api(adminEmailSend, {
        body: { subject: subject.trim(), body: body.trim(), category, audience },
      });
      if (r.duplicate) {
        toast.message(
          t('email-already-sending', {
            defaultValue: 'This message was just sent. Nothing new was sent.',
          }),
        );
      } else {
        toast.success(
          t('email-queued', {
            count: r.total,
            defaultValue_one: 'Sending to {{count}} person',
            defaultValue: 'Sending to {{count}} people',
          }),
        );
      }
      setSubject('');
      setBody('');
      setSelected([]);
      setHistoryKey((k) => k + 1);
    } catch (e) {
      toast.error(serverError(e) || t('email-send-failed', { defaultValue: 'The email could not be sent' }));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <section className="space-y-3">
        <h2 className="t-heading text-site-text">
          {t('email-message', { defaultValue: 'Message' })}
        </h2>
        <Input
          value={subject}
          maxLength={MAX_SUBJECT}
          placeholder={t('email-subject', { defaultValue: 'Subject' })}
          aria-label={t('email-subject', { defaultValue: 'Subject' })}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          value={body}
          rows={10}
          maxLength={MAX_BODY}
          placeholder={t('email-body', { defaultValue: 'Message' })}
          aria-label={t('email-body', { defaultValue: 'Message' })}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="t-meta">
          {t('email-body-help', {
            defaultValue:
              'Plain text. A blank line starts a new paragraph and links are detected. {{name}} is replaced with the reader’s name.',
            // Interpolated with itself so the reader sees the literal placeholder to type.
            name: '{{name}}',
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="t-heading text-site-text">{t('email-type', { defaultValue: 'Type' })}</h2>
        <Tabs
          aria-label={t('email-type', { defaultValue: 'Type' })}
          value={category}
          onChange={(id) => setCategory(id as CampaignCategory)}
          tabs={CAMPAIGN_CATEGORIES.map((c) => ({ id: c, label: categoryName(t, c) }))}
        />
        <p className="t-body text-site-text-muted">{categoryHelp(t, category)}</p>
      </section>

      <section className="space-y-3">
        <h2 className="t-heading text-site-text">
          {t('email-audience', { defaultValue: 'Audience' })}
        </h2>
        <AudienceEditor
          mode={mode}
          onModeChange={setMode}
          filters={filters}
          onFiltersChange={setFilters}
          selected={selected}
          onSelectedChange={setSelected}
        />
      </section>

      <section
        className="space-y-3 border-t border-site-border pt-4"
        aria-live="polite"
      >
        {!audience ? (
          <p className="t-body text-site-text-muted">
            {t('email-preview-none', { defaultValue: 'Choose at least one person.' })}
          </p>
        ) : previewing && !preview ? (
          <Spinner />
        ) : preview ? (
          <>
            <p className="t-body text-site-text">
              {t('email-preview-count', {
                count: preview.eligible,
                defaultValue_one: '{{count}} person will receive this.',
                defaultValue: '{{count}} people will receive this.',
              })}
              {preview.optedOut > 0
                ? ` ${t('email-preview-opted-out', {
                    count: preview.optedOut,
                    defaultValue_one: '{{count}} more matches but opted out of this type of email.',
                    defaultValue: '{{count}} more match but opted out of this type of email.',
                  })}`
                : ''}
              {preview.duplicates > 0
                ? ` ${t('email-preview-duplicates', {
                    count: preview.duplicates,
                    defaultValue_one: '{{count}} already received this message.',
                    defaultValue: '{{count}} already received this message.',
                  })}`
                : ''}
              {preview.throttled > 0
                ? ` ${t('email-preview-throttled', {
                    count: preview.throttled,
                    hours: BULK_MIN_GAP_HOURS,
                    defaultValue_one: '{{count}} had an email in the last {{hours}} hours and is left out.',
                    defaultValue: '{{count}} had an email in the last {{hours}} hours and are left out.',
                  })}`
                : ''}
            </p>
            {preview.sample.length > 0 ? (
              <ul className="divide-y divide-site-border border-t border-site-border">
                {preview.sample.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 py-2"
                  >
                    <span className="truncate t-body text-site-text">{recipientName(u)}</span>
                    <span className="truncate t-meta">{u.email}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={sendTest}
            loading={testing}
            disabled={!draftReady}
          >
            {t('email-send-test', { defaultValue: 'Send test to me' })}
          </Button>
          <Button
            variant={category === 'service' ? 'danger' : 'primary'}
            onClick={send}
            loading={sending}
            disabled={!canSend}
          >
            {t('email-send', { defaultValue: 'Send' })}
          </Button>
        </div>
      </section>

      <CampaignHistory refreshKey={historyKey} />
    </>
  );
}
