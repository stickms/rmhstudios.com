import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import type { wikiPage } from '@/lib/wiki/wiki-schema';
import { useWikiAssist, type WikiAssistFailure } from './useWikiAssist';
import { createWikiPageApi, getWikiPageApi, updateWikiPageApi } from '@/lib/wiki/wiki.contract';

/** Mirrors `wikiPath` in `lib/wiki/wiki-schema.ts`, for the inline hint before a save. */
const PATH = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
 * One wiki page: path (new pages only), title, description, tags, Markdown
 * body, and the DeepSeek assistant that writes into the body. Nothing the
 * assistant writes is saved until Save.
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
  const [path, setPath] = useState(initial?.path ?? '');
  const [locale, setLocale] = useState(initial?.locale ?? 'en');
  const [pathTouched, setPathTouched] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? true);
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
  const pathValid = PATH.test(path);
  const canSave = Boolean(title.trim() && content.trim() && (!isNew || pathValid)) && !writing;

  const save = async () => {
    setSaving(true);
    const fields = {
      title: title.trim(),
      description: description.trim(),
      content,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      isPublished,
    };
    try {
      if (id === null) {
        const page = await api(createWikiPageApi, { body: { path, ...fields } });
        setId(page.id);
        setLocale(page.locale);
        toast.success(t('created', { defaultValue: 'Page created.' }));
      } else {
        await api(updateWikiPageApi, { params: { id: String(id) }, body: fields });
        toast.success(t('saved', { defaultValue: 'Page saved.' }));
      }
      onSaved();
    } catch (err) {
      toast.error(
        errorField<string>(err, 'error') === 'conflict'
          ? t('path-taken', { defaultValue: 'A page already uses that path.' })
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
              <a href={`${publicUrl}/${locale}/${path}`} target="_blank" rel="noreferrer">
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
            maxLength={200}
            onChange={(e) => {
              setTitle(e.target.value);
              if (isNew && !pathTouched) setPath(slugify(e.target.value));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-path`}>{t('field-path', { defaultValue: 'Path' })}</Label>
          <Input
            id={`${ids}-path`}
            value={path}
            maxLength={200}
            disabled={!isNew}
            aria-invalid={isNew && path !== '' && !pathValid}
            aria-describedby={`${ids}-path-hint`}
            onChange={(e) => {
              setPathTouched(true);
              setPath(e.target.value);
            }}
          />
          <p id={`${ids}-path-hint`} className="t-meta">
            {isNew
              ? t('path-hint', {
                  defaultValue: 'Lowercase words joined by hyphens; slashes make sub-pages.',
                })
              : t('path-fixed', { defaultValue: 'Move a page from the wiki itself.' })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-description`}>
            {t('field-description', { defaultValue: 'Description' })}
          </Label>
          <Input
            id={`${ids}-description`}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-tags`}>{t('field-tags', { defaultValue: 'Tags' })}</Label>
          <Input
            id={`${ids}-tags`}
            value={tags}
            placeholder={t('tags-placeholder', { defaultValue: 'Separated by commas' })}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={isPublished}
          onCheckedChange={setIsPublished}
          aria-labelledby={`${ids}-published`}
        />
        <span id={`${ids}-published`} className="t-body text-site-text">
          {t('field-published', { defaultValue: 'Published' })}
        </span>
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
          {t('field-content', { defaultValue: 'Body (Markdown)' })}
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
