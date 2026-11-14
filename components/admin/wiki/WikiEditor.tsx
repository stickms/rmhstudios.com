import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { isWikiTitle, wikiPageUrl } from '@/lib/wiki/editor-fields';
import type { wikiPage } from '@/lib/wiki/wiki-schema';
import { useWikiAssist, type WikiAssistFailure } from './useWikiAssist';
import { createWikiPageApi, getWikiPageApi, updateWikiPageApi } from '@/lib/wiki/wiki.contract';

type Page = z.infer<typeof wikiPage>;

interface EditorProps {
  /** `null` creates a page. */
  pageId: number | null;
  publicUrl: string;
  aiConfigured: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Loads the page (when there is one), then hands it to the form. */
export function WikiEditor(props: EditorProps) {
  const { t } = useTranslation('f-wiki');
  const q = useQuery({
    ...apiQuery(getWikiPageApi, { params: { id: String(props.pageId ?? 0) } }),
    enabled: props.pageId !== null,
    // The form owns the text once it is open; a background refetch must not race it.
    staleTime: Infinity,
    gcTime: 0,
  });

  if (props.pageId === null) return <WikiEditorForm {...props} initial={null} />;
  if (q.data) return <WikiEditorForm {...props} initial={q.data} />;
  if (q.isError) {
    return (
      <div className="space-y-3">
        <p className="t-body text-site-text-muted">
          {t('load-failed', { defaultValue: 'Could not load that page.' })}
        </p>
        <Button onClick={props.onClose}>{t('back', { defaultValue: 'Back to pages' })}</Button>
      </div>
    );
  }
  return <Spinner />;
}

/**
 * One wiki page: title (new pages only; it is the page's address), an edit
 * summary, the wikitext body, and the DeepSeek assistant that writes into the
 * body. Nothing the assistant writes is saved until Save. Each save is a new
 * revision on top of the one the editor holds; if someone else saved in
 * between and MediaWiki cannot merge the two, the save is refused.
 */
function WikiEditorForm({
  initial,
  publicUrl,
  aiConfigured,
  onClose,
  onSaved,
}: EditorProps & { initial: Page | null }) {
  const { t } = useTranslation('f-wiki');
  const ids = useId();
  const [id, setId] = useState(initial?.id ?? null);
  const [revisionId, setRevisionId] = useState(initial?.revisionId ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState(initial?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [instruction, setInstruction] = useState('');

  const assist = useWikiAssist({
    content,
    setContent,
    onFailure: (why: WikiAssistFailure) =>
      toast.error(
        why === 'empty'
          ? t('assist-empty', { defaultValue: 'The assistant wrote nothing. Try again.' })
          : why === 'offline'
            ? t('assist-offline', {
                defaultValue: 'The assistant is offline. Check DEEPSEEK_API_KEY.',
              })
            : why === 'rate-limited'
              ? t('assist-rate-limited', { defaultValue: 'Too many requests. Wait a moment.' })
              : t('assist-failed', { defaultValue: 'The assistant stopped before it finished.' }),
      ),
  });
  const { writing } = assist;

  const isNew = id === null;
  const titleValid = isWikiTitle(title);
  const canSave = Boolean(content.trim() && (!isNew || titleValid)) && !writing;

  const save = async () => {
    setSaving(true);
    try {
      const page =
        id === null
          ? await api(createWikiPageApi, {
              body: { title: title.trim(), content, summary: summary.trim() },
            })
          : await api(updateWikiPageApi, {
              params: { id: String(id) },
              body: { content, summary: summary.trim(), baseRevisionId: revisionId },
            });
      setId(page.id);
      setRevisionId(page.revisionId);
      // MediaWiki normalises a new title (first letter upper-case, underscores to spaces).
      setTitle(page.title);
      setSummary('');
      toast.success(
        id === null
          ? t('created', { defaultValue: 'Page created.' })
          : t('saved', { defaultValue: 'Page saved.' }),
      );
      onSaved();
    } catch (err) {
      const code = errorField<string>(err, 'error');
      toast.error(
        code === 'conflict'
          ? id === null
            ? t('title-taken', { defaultValue: 'A page with that title already exists.' })
            : t('edit-conflict', {
                defaultValue:
                  'Someone else saved this page since you opened it. Copy your text, reopen the page and apply it again.',
              })
          : t('save-failed', { defaultValue: 'Could not save the page.' }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-heading text-site-text">
          {isNew
            ? t('editor-new', { defaultValue: 'New page' })
            : t('editor-edit', { defaultValue: 'Edit page' })}
        </h2>
        <div className="flex flex-wrap gap-2">
          {isNew ? null : (
            <Button asChild variant="ghost">
              <a href={wikiPageUrl(publicUrl, title)} target="_blank" rel="noreferrer">
                {t('view-on-wiki', { defaultValue: 'View on the wiki' })}
              </a>
            </Button>
          )}
          <Button onClick={onClose}>{t('back', { defaultValue: 'Back to pages' })}</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!canSave}
            onClick={() => void save()}
          >
            {isNew
              ? t('create', { defaultValue: 'Create page' })
              : t('save', { defaultValue: 'Save page' })}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-title`}>{t('field-title', { defaultValue: 'Title' })}</Label>
          <Input
            id={`${ids}-title`}
            value={title}
            maxLength={255}
            disabled={!isNew}
            aria-invalid={isNew && title !== '' && !titleValid}
            aria-describedby={`${ids}-title-hint`}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p id={`${ids}-title-hint`} className="t-meta">
            {isNew
              ? t('title-hint', {
                  defaultValue: 'The title is also the address. A slash makes a sub-page.',
                })
              : t('title-fixed', { defaultValue: 'Rename a page on the wiki itself.' })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-summary`}>
            {t('field-summary', { defaultValue: 'Edit summary' })}
          </Label>
          <Input
            id={`${ids}-summary`}
            value={summary}
            maxLength={500}
            placeholder={t('summary-placeholder', { defaultValue: 'What you changed' })}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-site-border pt-4">
        <Label htmlFor={`${ids}-instruction`}>
          {t('assist-label', { defaultValue: 'Writing assistant' })}
        </Label>
        {aiConfigured ? (
          <>
            <Textarea
              id={`${ids}-instruction`}
              className="min-h-20"
              value={instruction}
              maxLength={2000}
              disabled={writing}
              placeholder={
                content.trim()
                  ? t('assist-placeholder-edit', {
                      defaultValue: 'Say what to change, such as "add a section on scoring".',
                    })
                  : t('assist-placeholder-new', {
                      defaultValue: 'Say what the page should cover.',
                    })
              }
              onChange={(e) => setInstruction(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              {writing ? (
                <Button onClick={assist.stop}>{t('assist-stop', { defaultValue: 'Stop' })}</Button>
              ) : (
                <Button
                  disabled={!instruction.trim()}
                  onClick={() => void assist.write(instruction.trim(), title.trim())}
                >
                  {content.trim()
                    ? t('assist-revise', { defaultValue: 'Revise page' })
                    : t('assist-draft', { defaultValue: 'Write draft' })}
                </Button>
              )}
              {assist.canUndo ? (
                <Button variant="ghost" onClick={assist.undo}>
                  {t('assist-undo', { defaultValue: 'Undo' })}
                </Button>
              ) : null}
              <p className="t-meta" role="status">
                {writing
                  ? t('assist-writing', { defaultValue: 'Writing' })
                  : t('assist-note', {
                      defaultValue:
                        'DeepSeek writes into the body below. Nothing is saved until you save.',
                    })}
              </p>
            </div>
          </>
        ) : (
          <p className="t-body text-site-text-muted">
            {t('assist-unconfigured', {
              defaultValue: 'Set DEEPSEEK_API_KEY to turn the assistant on.',
            })}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-content`}>
          {t('field-wikitext', { defaultValue: 'Body (wikitext)' })}
        </Label>
        <Textarea
          id={`${ids}-content`}
          className="min-h-[28rem] font-mono"
          value={content}
          readOnly={writing}
          spellCheck
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </div>
  );
}
