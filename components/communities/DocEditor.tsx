/**
 * The shared collaborative-document editor.
 *
 * Community wiki pages (F21) and game guides are the same object: a titled
 * markdown body with a revision trail, edited by more than one person. The
 * guide surface (`components/games/GuideView.tsx`) grew its own inline editor
 * before revisions had any UI at all — it can write `GameGuideRevision` rows
 * and has never been able to show one. This component is the version with the
 * history story, and it is deliberately **prop-driven**: it does no fetching
 * and knows nothing about communities, so the guide surface can adopt it by
 * passing its own `onSave`.
 *
 * Nothing here is a second markdown pipeline either — the preview renders
 * through the same `react-markdown` path the guides and blog use (no raw
 * HTML), and the diff is `lib/feed/word-diff.ts`, the one written for post edit
 * history.
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, PenLine } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ReadabilityMeter } from '@/components/reading/ReadabilityMeter';
import { cn } from '@/lib/utils';

export interface DocDraft {
  title: string;
  body: string;
  /** Free-text "what changed", stored on the revision. */
  summary: string;
}

interface DocEditorProps {
  initialTitle: string;
  initialBody: string;
  /** Start with this summary (a restored draft). */
  initialSummary?: string;
  /** Called with the whole draft on every change, so a caller can keep an unsaved edit across a reload. */
  onDraftChange?: (draft: DocDraft) => void;
  /** Replaces the Save button's text (already translated), e.g. "Save page". */
  saveLabel?: string;
  /** Character ceiling for the body — the caller's column limit. */
  maxBody: number;
  maxTitle: number;
  busy?: boolean;
  /** Ask for a revision summary. Off for a brand-new document. */
  askSummary?: boolean;
  onSave: (draft: DocDraft) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
  /** Shortest title that can be saved (default 2). A game guide's column wants 3. */
  minTitle?: number;
  /** Ceiling for the summary (default 200); a guide revision note is 120. */
  maxSummary?: number;
  /** Already-translated texts that replace the page wording ("Page title", "Write in Markdown…"). */
  labels?: {
    title?: string;
    body?: string;
    bodyPlaceholder?: string;
    summaryPlaceholder?: string;
    summary?: string;
  };
  /** Controls placed at the start of the action row (a guide's Publish and Delete). */
  leading?: ReactNode;
}

/** Shared markdown reader styling, so a doc reads the same wherever it renders. */
export const DOC_PROSE_CLASS =
  'space-y-3 text-body leading-relaxed text-site-text [&_a]:text-site-accent [&_a]:underline [&_code]:font-mono [&_h2]:mt-5 [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_pre]:overflow-x-auto [&_pre]:rounded-site [&_pre]:bg-site-surface [&_pre]:p-3';

export function DocBody({ body, className }: { body: string; className?: string }) {
  return (
    <div dir="auto" className={cn(DOC_PROSE_CLASS, className)}>
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}

export function DocEditor({
  initialTitle,
  initialBody,
  initialSummary = '',
  onDraftChange,
  saveLabel,
  maxBody,
  maxTitle,
  busy,
  askSummary = true,
  onSave,
  onCancel,
  className,
  minTitle = 2,
  maxSummary = 200,
  labels,
  leading,
}: DocEditorProps) {
  const { t } = useTranslation('c-ui');
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [summary, setSummary] = useState(initialSummary);
  const [preview, setPreview] = useState(false);

  const changed = (next: Partial<DocDraft>) => onDraftChange?.({ title, body, summary, ...next });

  const valid = title.trim().length >= minTitle && body.trim().length > 0;

  return (
    <div className={cn('space-y-3', className)}>
      <Input
        dir="auto"
        value={title}
        onChange={(e) => {
          const next = e.target.value.slice(0, maxTitle);
          setTitle(next);
          changed({ title: next });
        }}
        placeholder={
          labels?.title ??
          t('doc-title-placeholder', {
            defaultValue: 'Page title',
          })
        }
        aria-label={
          labels?.title ??
          t('doc-title-label', {
            defaultValue: 'Page title',
          })
        }
      />

      {preview ? (
        <div className="surface-field rounded-site p-5">
          <DocBody body={body} />
        </div>
      ) : (
        <Textarea
          dir="auto"
          value={body}
          onChange={(e) => {
            const next = e.target.value.slice(0, maxBody);
            setBody(next);
            changed({ body: next });
          }}
          rows={18}
          className="font-mono text-sm"
          placeholder={
            labels?.bodyPlaceholder ??
            t('doc-body-placeholder', {
              defaultValue: 'Write in Markdown…',
            })
          }
          aria-label={
            labels?.body ??
            t('doc-body-label', {
              defaultValue: 'Page content',
            })
          }
        />
      )}

      {!preview ? <ReadabilityMeter text={body} /> : null}

      {askSummary ? (
        <Input
          value={summary}
          onChange={(e) => {
            const next = e.target.value.slice(0, maxSummary);
            setSummary(next);
            changed({ summary: next });
          }}
          placeholder={
            labels?.summaryPlaceholder ??
            t('doc-summary-placeholder', {
              defaultValue: 'What changed? (shown in the history)',
            })
          }
          aria-label={
            labels?.summary ??
            t('doc-summary-label', {
              defaultValue: 'Edit summary',
            })
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {leading ? <div className="mr-auto flex flex-wrap items-center gap-2">{leading}</div> : null}
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? <PenLine aria-hidden /> : <Eye aria-hidden />}
          {preview
            ? t('doc-write', {
                defaultValue: 'Write',
              })
            : t('doc-preview', {
                defaultValue: 'Preview',
              })}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('doc-cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
        ) : null}
        <Button
          variant="default"
          size="sm"
          loading={busy}
          disabled={!valid}
          onClick={() =>
            onSave({
              title: title.trim(),
              body,
              summary: summary.trim(),
            })
          }
        >
          {saveLabel ??
            t('doc-save', {
              defaultValue: 'Save',
            })}
        </Button>
      </div>
    </div>
  );
}
