import { useRefusalText } from '@/components/errors/useRefusalText';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import {
  adminEmailPreview,
  adminEmailSend,
  adminEmailTest,
  type EmailAudiencePreview,
  type EmailRecipientSummary,
} from '@/lib/admin/email.contract';
import { CAMPAIGN_CATEGORIES, type CampaignCategory } from '@/lib/email/preferences';
import { MAX_BODY, MAX_SUBJECT } from '@/lib/email/campaign-limits';
import type { Audience } from '@/lib/email/campaign-schema';
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
import { EmailImages, emailRewrite } from '@/components/admin/email/EmailAiTools';
import { AIGenerateButton } from '@/components/feed/AIGenerateButton';
import { ComposeAssist } from '@/components/feed/ComposeAssist';
import { EmailDesigner, EmailPreview } from '@/components/admin/email/EmailDesigner';
import type { EmailDesign } from '@/lib/email/campaign-schema';

/** The highlighted range of the message field. */
interface BodySelection {
  start: number;
  end: number;
}
import { categoryHelp, categoryName } from '@/components/admin/email/labels';

/**
 * The admin email composer: write a message, pick its type and audience, see
 * who it reaches, send a test to yourself, then send. The send itself runs in
 * the jobs worker (`lib/email/campaign.server.ts`); the history below shows
 * its progress.
 */
export function EmailComposer() {
  const { t } = useTranslation('admin');
  const refusalText = useRefusalText();
  const confirm = useConfirm();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  // A designed layout from DeepSeek or Kimi; null is the plain layout.
  const [design, setDesign] = useState<EmailDesign | null>(null);
  // The highlighted range of the body, kept as the admin selects so the AI menu
  // still knows it after the field loses focus to the menu.
  const [selection, setSelection] = useState<BodySelection | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState<CampaignCategory>('announcements');
  const [mode, setMode] = useState<AudienceMode>('all');
  const [filters, setFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<EmailRecipientSummary[]>([]);
  // Send past the frequency cap: people emailed in the last BULK_MIN_GAP_HOURS get it too.
  // Required notices are never capped, so the switch only exists for optional mail.
  const [overrideCap, setOverrideCap] = useState(false);
  const ignoreFrequencyCap = overrideCap && category !== 'service';

  const [preview, setPreview] = useState<EmailAudiencePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // The compose box's rewrite chips act on the highlighted passage while one is
  // highlighted (and still matches the text), otherwise the whole message.
  const assistTarget = useMemo(() => {
    if (selection && selection.end > selection.start && selection.end <= body.length) {
      const text = body.slice(selection.start, selection.end);
      if (text.trim().length > 0)
        return {
          text,
          range: selection,
        };
    }
    return {
      text: body,
      range: null,
    };
  }, [body, selection]);
  const rewrite = useMemo(() => emailRewrite(subject), [subject]);

  function applyRewrite(next: string) {
    const range = assistTarget.range;
    if (!range) {
      setBody(next);
      return;
    }
    setBody((current) => current.slice(0, range.start) + next + current.slice(range.end));
    const end = range.start + next.length;
    setSelection({
      start: range.start,
      end,
    });
    // Select the replacement once React has rendered it, so the admin sees what changed.
    setTimeout(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(range.start, end);
    }, 0);
  }

  const audience: Audience | null = useMemo(() => {
    if (mode === 'all')
      return {
        mode: 'all',
      };
    if (mode === 'filter')
      return {
        mode: 'filter',
        filters: toFilters(filters),
      };
    return selected.length > 0
      ? {
          mode: 'manual',
          userIds: selected.map((u) => u.id),
        }
      : null;
  }, [mode, filters, selected]);
  const audienceKey = JSON.stringify(audience);

  // The draft goes into the preview too, so it can count who already had this exact message.
  const draftKey = `${subject.trim()}\u0000${body.trim()}\u0000${images.join(' ')}\u0000${JSON.stringify(design)}`;

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
          ...(ignoreFrequencyCap
            ? {
                ignoreFrequencyCap: true,
              }
            : {}),
          ...(subject.trim() && body.trim()
            ? {
                subject: subject.trim(),
                body: body.trim(),
                imageUrls: images,
                design,
              }
            : {}),
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
  }, [audienceKey, category, draftKey, ignoreFrequencyCap]);

  const draftReady = subject.trim().length > 0 && body.trim().length > 0;
  const canSend = draftReady && !!audience && !!preview && preview.eligible > 0 && !previewing;

  async function sendTest() {
    if (!draftReady) return;
    setTesting(true);
    try {
      const r = await api(adminEmailTest, {
        body: {
          subject: subject.trim(),
          body: body.trim(),
          category,
          imageUrls: images,
          design,
        },
      });
      if (r.ok && r.to) {
        toast.success(
          t('email-test-sent', {
            to: r.to,
            defaultValue: 'Test sent to {{to}}',
          }),
        );
      } else {
        toast.error(
          t('email-test-failed', {
            defaultValue: 'The test could not be sent',
          }),
        );
      }
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ||
          t('email-test-failed', {
            defaultValue: 'The test could not be sent',
          }),
      );
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
          : ignoreFrequencyCap
            ? t('email-confirm-override', {
                hours: BULK_MIN_GAP_HOURS,
                count: Number(BULK_MIN_GAP_HOURS),
                defaultValue_one:
                  'This goes to people who had an email in the last {{hours}} hour too. An email cannot be recalled once sent.',
                defaultValue:
                  'This goes to people who had an email in the last {{hours}} hours too. An email cannot be recalled once sent.',
              })
            : t('email-confirm-desc', {
                defaultValue: 'An email cannot be recalled once sent.',
              }),
      confirmLabel: t('email-send', {
        defaultValue: 'Send',
      }),
      danger: category === 'service',
    });
    if (!ok) return;
    setSending(true);
    try {
      const r = await api(adminEmailSend, {
        body: {
          subject: subject.trim(),
          body: body.trim(),
          category,
          audience,
          imageUrls: images,
          design,
          ...(ignoreFrequencyCap
            ? {
                ignoreFrequencyCap: true,
              }
            : {}),
        },
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
      setImages([]);
      setDesign(null);
      setSelection(null);
      setSelected([]);
      setOverrideCap(false);
      setHistoryKey((k) => k + 1);
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ||
          t('email-send-failed', {
            defaultValue: 'The email could not be sent',
          }),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <section className="space-y-3">
        <h2 className="t-heading text-site-text">
          {t('email-message', {
            defaultValue: 'Message',
          })}
        </h2>
        <div className="relative">
          <Input
            value={subject}
            maxLength={MAX_SUBJECT}
            className="pe-12"
            placeholder={t('email-subject', {
              defaultValue: 'Subject',
            })}
            aria-label={t('email-subject', {
              defaultValue: 'Subject',
            })}
            onChange={(e) => setSubject(e.target.value)}
          />
          <div className="absolute end-2 top-1/2 -translate-y-1/2">
            <AIGenerateButton
              size="sm"
              request={{
                mode: 'email-subject',
                subject,
                body,
                category,
              }}
              onGenerated={setSubject}
              title={t('email-ai-subject', {
                defaultValue: 'Write the subject with AI',
              })}
            />
          </div>
        </div>
        <Textarea
          ref={bodyRef}
          value={body}
          rows={10}
          maxLength={MAX_BODY}
          placeholder={t('email-body', {
            defaultValue: 'Message',
          })}
          aria-label={t('email-body', {
            defaultValue: 'Message',
          })}
          onChange={(e) => setBody(e.target.value)}
          onSelect={(e) => {
            const el = e.currentTarget;
            setSelection({
              start: el.selectionStart,
              end: el.selectionEnd,
            });
          }}
        />
        <ComposeAssist value={assistTarget.text} onChange={applyRewrite} rewrite={rewrite} />
        <p className="t-meta">
          {assistTarget.range
            ? t('email-ai-selection', {
                defaultValue: 'The rewrites apply to the highlighted text.',
              })
            : t('email-ai-hint', {
                defaultValue: 'Highlight part of the message to rewrite only that part.',
              })}
        </p>
        <EmailImages
          subject={subject}
          body={body}
          images={images}
          onImages={setImages}
          leading={
            <AIGenerateButton
              request={{
                mode: 'email-body',
                subject,
                body,
                category,
              }}
              onGenerated={setBody}
              title={t('email-ai-body', {
                defaultValue: 'Write the message with AI',
              })}
            />
          }
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
        <h2 className="t-heading text-site-text">
          {t('email-type', {
            defaultValue: 'Type',
          })}
        </h2>
        <Tabs
          aria-label={t('email-type', {
            defaultValue: 'Type',
          })}
          value={category}
          onChange={(id) => setCategory(id as CampaignCategory)}
          tabs={CAMPAIGN_CATEGORIES.map((c) => ({
            id: c,
            label: categoryName(t, c),
          }))}
        />
        <p className="t-body text-site-text-muted">{categoryHelp(t, category)}</p>
      </section>

      <EmailDesigner
        draft={{
          subject,
          body,
          category,
          images,
        }}
        design={design}
        onDesign={setDesign}
      />

      <section className="space-y-3">
        <h2 className="t-heading text-site-text">
          {t('email-audience', {
            defaultValue: 'Audience',
          })}
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

      <EmailPreview
        draft={{
          subject,
          body,
          category,
          images,
        }}
        design={design}
      />

      <section className="space-y-3 border-t border-site-border pt-4" aria-live="polite">
        {!audience ? (
          <p className="t-body text-site-text-muted">
            {t('email-preview-none', {
              defaultValue: 'Choose at least one person.',
            })}
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
              {ignoreFrequencyCap
                ? ` ${t('email-preview-override', {
                    hours: BULK_MIN_GAP_HOURS,
                    count: Number(BULK_MIN_GAP_HOURS),
                    defaultValue_one: 'Includes people who had an email in the last {{hours}} hour.',
                    defaultValue: 'Includes people who had an email in the last {{hours}} hours.',
                  })}`
                : ''}
            </p>
            {category !== 'service' && (preview.throttled > 0 || overrideCap) ? (
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span id="email-override-cap" className="t-body text-site-text">
                  {t('email-override-cap', {
                    hours: BULK_MIN_GAP_HOURS,
                    count: Number(BULK_MIN_GAP_HOURS),
                    defaultValue_one: 'Also send to people emailed in the last {{hours}} hour',
                    defaultValue: 'Also send to people emailed in the last {{hours}} hours',
                  })}
                </span>
                <Switch checked={overrideCap} aria-labelledby="email-override-cap" onCheckedChange={setOverrideCap} />
              </div>
            ) : null}
            {preview.sample.length > 0 ? (
              <ul className="divide-y divide-site-border border-t border-site-border">
                {preview.sample.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                    <span className="truncate t-body text-site-text">{recipientName(u)}</span>
                    <span className="truncate t-meta">{u.email}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={sendTest} loading={testing} disabled={!draftReady}>
            {t('email-send-test', {
              defaultValue: 'Send test to me',
            })}
          </Button>
          <Button
            variant={category === 'service' ? 'danger' : 'primary'}
            onClick={send}
            loading={sending}
            disabled={!canSend}
          >
            {t('email-send', {
              defaultValue: 'Send',
            })}
          </Button>
        </div>
      </section>

      <CampaignHistory refreshKey={historyKey} />
    </>
  );
}
