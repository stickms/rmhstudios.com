'use client';

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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, PenLine } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  /** Character ceiling for the body — the caller's column limit. */
  maxBody: number;
  maxTitle: number;
  busy?: boolean;
  /** Ask for a revision summary. Off for a brand-new document. */
  askSummary?: boolean;
  onSave: (draft: DocDraft) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
}

/** Shared markdown reader styling, so a doc reads the same wherever it renders. */
export const DOC_PROSE_CLASS =
  'space-y-3 text-[15px] leading-relaxed text-site-text [&_a]:text-site-accent [&_code]:font-mono [&_h2]:mt-5 [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_pre]:overflow-x-auto [&_pre]:rounded-site [&_pre]:bg-site-surface [&_pre]:p-3';

export function DocBody({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn(DOC_PROSE_CLASS, className)}>
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}

export function DocEditor({
  initialTitle,
  initialBody,
  maxBody,
  maxTitle,
  busy,
  askSummary = true,
  onSave,
  onCancel,
  className,
}: DocEditorProps) {
  const { t } = useTranslation('c-ui');
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [summary, setSummary] = useState('');
  const [preview, setPreview] = useState(false);

  const valid = title.trim().length >= 2 && body.trim().length > 0;

  return (
    <div className={cn('space-y-3', className)}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, maxTitle))}
        placeholder={t('doc-title-placeholder', { defaultValue: 'Page title' })}
        aria-label={t('doc-title-label', { defaultValue: 'Page title' })}
      />

      {preview ? (
        <div className="glass-inset rounded-site p-4">
          <DocBody body={body} />
        </div>
      ) : (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, maxBody))}
          rows={18}
          className="font-mono text-sm"
          placeholder={t('doc-body-placeholder', { defaultValue: 'Write in Markdown…' })}
          aria-label={t('doc-body-label', { defaultValue: 'Page content' })}
        />
      )}

      {askSummary ? (
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value.slice(0, 200))}
          placeholder={t('doc-summary-placeholder', {
            defaultValue: 'What changed? (shown in the history)',
          })}
          aria-label={t('doc-summary-label', { defaultValue: 'Edit summary' })}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? <PenLine aria-hidden /> : <Eye aria-hidden />}
          {preview
            ? t('doc-write', { defaultValue: 'Write' })
            : t('doc-preview', { defaultValue: 'Preview' })}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('doc-cancel', { defaultValue: 'Cancel' })}
          </Button>
        ) : null}
        <Button
          variant="accent"
          size="sm"
          loading={busy}
          disabled={!valid}
          onClick={() => onSave({ title: title.trim(), body, summary: summary.trim() })}
        >
          {t('doc-save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </div>
  );
}
