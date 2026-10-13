'use client';

/** L6 — admin glossary: terms, aliases, short definitions and an optional link. */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiJson } from '@/lib/reading/client';
import type { GlossaryTermView } from '@/lib/reading/schema';

const KEY = ['admin-glossary'] as const;

interface Draft {
  id: string | null;
  term: string;
  aliases: string;
  definition: string;
  linkUrl: string;
}
const blank: Draft = { id: null, term: '', aliases: '', definition: '', linkUrl: '' };

export default function AdminGlossary() {
  const { t } = useTranslation('f-reading');
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(blank);
  const confirm = useConfirm();
  const { data, isPending } = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<{ terms: GlossaryTermView[] }>('/api/admin/reading/glossary'),
  });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = JSON.stringify({
        term: d.term,
        aliases: d.aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        definition: d.definition,
        linkUrl: d.linkUrl.trim() || null,
      });
      return d.id
        ? apiJson(`/api/admin/reading/glossary/${d.id}`, { method: 'PATCH', body })
        : apiJson('/api/admin/reading/glossary', { method: 'POST', body });
    },
    onSuccess: () => {
      setDraft(blank);
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(t('glossary-saved', { defaultValue: 'Glossary term saved.' }));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiJson(`/api/admin/reading/glossary/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (err: Error) => toast.error(err.message),
  });

  const terms = data?.terms ?? [];

  async function remove(term: GlossaryTermView) {
    const ok = await confirm({
      title: t('glossary-delete-title', { defaultValue: 'Delete this term?' }),
      description: t('glossary-delete-desc', {
        term: term.term,
        defaultValue: '“{{term}}” will stop linking everywhere.',
      }),
      confirmLabel: t('glossary-delete', { defaultValue: 'Delete term' }),
      danger: true,
    });
    if (ok) del.mutate(term.id);
  }

  return (
    <div className="space-y-6">
      <form
        className="glass-pane space-y-3 rounded-site p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(draft);
        }}
      >
        <h2 className="font-display text-lg font-semibold text-site-text">
          {draft.id
            ? t('glossary-edit', { defaultValue: 'Edit term' })
            : t('glossary-add', { defaultValue: 'Add a term' })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="gl-term" className="text-sm text-site-text-muted">
              {t('glossary-term-label', { defaultValue: 'Term' })}
            </label>
            <Input
              id="gl-term"
              required
              minLength={2}
              maxLength={80}
              value={draft.term}
              onChange={(e) => setDraft({ ...draft, term: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="gl-aliases" className="text-sm text-site-text-muted">
              {t('glossary-aliases-label', { defaultValue: 'Aliases (comma separated)' })}
            </label>
            <Input
              id="gl-aliases"
              value={draft.aliases}
              onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="gl-def" className="text-sm text-site-text-muted">
            {t('glossary-definition-label', { defaultValue: 'Short definition' })}
          </label>
          <Textarea
            id="gl-def"
            required
            maxLength={600}
            rows={3}
            value={draft.definition}
            onChange={(e) => setDraft({ ...draft, definition: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="gl-link" className="text-sm text-site-text-muted">
            {t('glossary-link-label', { defaultValue: 'Link (optional, https:// or a site path)' })}
          </label>
          <Input
            id="gl-link"
            maxLength={300}
            value={draft.linkUrl}
            onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="accent" size="sm" loading={save.isPending}>
            {t('save', { defaultValue: 'Save' })}
          </Button>
          {draft.id ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(blank)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
          ) : null}
        </div>
      </form>

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : terms.length === 0 ? (
        <EmptyState
          title={t('glossary-empty', { defaultValue: 'No glossary terms yet' })}
          description={t('glossary-empty-hint', {
            defaultValue:
              'Add a term and its first mention in any news, blog or library text will link to it.',
          })}
        />
      ) : (
        <ul className="glass-fill divide-y divide-site-border rounded-site">
          {terms.map((term) => (
            <li key={term.id} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-site-text">{term.term}</p>
                {term.aliases.length > 0 ? (
                  <p className="text-xs text-site-text-dim">{term.aliases.join(', ')}</p>
                ) : null}
                <p className="mt-0.5 text-sm text-site-text-muted">{term.definition}</p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('glossary-edit', { defaultValue: 'Edit term' })}
                onClick={() =>
                  setDraft({
                    id: term.id,
                    term: term.term,
                    aliases: term.aliases.join(', '),
                    definition: term.definition,
                    linkUrl: term.linkUrl ?? '',
                  })
                }
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('glossary-delete', { defaultValue: 'Delete term' })}
                onClick={() => void remove(term)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
