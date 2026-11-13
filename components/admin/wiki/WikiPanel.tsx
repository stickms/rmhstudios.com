import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { api, apiQuery } from '@/lib/contract/client';
import { deleteWikiPageApi, listWikiPagesApi, seedWikiPagesApi } from '@/lib/wiki/wiki.contract';
import { WikiEditor } from './WikiEditor';

/** `null` is the list; `'new'` or a page id is the editor. */
type View = null | 'new' | number;

/**
 * The wiki page manager: every page on wiki.rmhstudios.com as rows on rules,
 * with the editor swapped in for one page at a time. Admin only; the API is
 * what enforces that.
 */
export function WikiPanel() {
  const { t } = useTranslation('f-wiki');
  const confirm = useConfirm();
  const q = useQuery({ ...apiQuery(listWikiPagesApi), retry: false });
  const { data } = q;
  const reload = () => q.refetch();
  const [view, setView] = useState<View>(null);
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      const { created } = await api(seedWikiPagesApi);
      toast.success(
        created.length
          ? t('seeded', {
              defaultValue: 'Added {{count}} starter page.',
              defaultValue_other: 'Added {{count}} starter pages.',
              count: created.length,
            })
          : t('seeded-none', { defaultValue: 'Every starter page is already on the wiki.' }),
      );
      await reload();
    } catch {
      toast.error(t('seed-failed', { defaultValue: 'Could not add the starter pages.' }));
    } finally {
      setSeeding(false);
    }
  };

  const remove = async (id: number, title: string) => {
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this page?' }),
      description: t('delete-description', {
        defaultValue: '"{{title}}" will be removed from the wiki.',
        title,
      }),
      confirmLabel: t('delete-confirm', { defaultValue: 'Delete page' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteWikiPageApi, { params: { id: String(id) } });
      toast.success(t('deleted', { defaultValue: 'Page deleted.' }));
      await reload();
    } catch {
      toast.error(t('delete-failed', { defaultValue: 'Could not delete the page.' }));
    }
  };

  if (q.isPending) return <Spinner />;

  if (!data) {
    return (
      <EmptyState
        title={t('unreachable-title', { defaultValue: 'The wiki did not answer' })}
        description={t('unreachable-description', {
          defaultValue:
            'Check that the wikijs service is running and that WIKIJS_URL and WIKIJS_API_KEY are correct.',
        })}
        action={
          <Button onClick={() => void reload()}>{t('retry', { defaultValue: 'Try again' })}</Button>
        }
      />
    );
  }

  if (!data.configured) {
    return (
      <EmptyState
        title={t('setup-title', { defaultValue: 'The wiki is not connected' })}
        description={t('setup-description', {
          defaultValue:
            'Create an API key in the Wiki.js admin area, set it as WIKIJS_API_KEY and restart the web service. The steps are in docs/wiki.md.',
        })}
      />
    );
  }

  if (view !== null) {
    return (
      <WikiEditor
        pageId={view === 'new' ? null : view}
        publicUrl={data.publicUrl}
        aiConfigured={data.aiConfigured}
        onClose={() => setView(null)}
        onSaved={() => void reload()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-meta">
          {t('page-count', {
            defaultValue: '{{count}} page',
            defaultValue_other: '{{count}} pages',
            count: data.pages.length,
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button loading={seeding} onClick={() => void seed()}>
            {t('seed', { defaultValue: 'Add starter pages' })}
          </Button>
          <Button variant="primary" onClick={() => setView('new')}>
            {t('new-page', { defaultValue: 'New page' })}
          </Button>
        </div>
      </div>

      {data.pages.length === 0 ? (
        <EmptyState
          title={t('empty-title', { defaultValue: 'No pages yet' })}
          description={t('empty-description', {
            defaultValue: 'Add the starter pages, or write the first page yourself.',
          })}
        />
      ) : (
        <ul className="border-t border-site-border">
          {data.pages.map((page) => (
            <li
              key={page.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3"
            >
              <div className="min-w-0 flex-1 basis-60">
                <p className="t-body flex min-w-0 items-center gap-2 font-medium text-site-text">
                  <span className="truncate">{page.title}</span>
                  {page.isPublished ? null : <Badge>{t('draft', { defaultValue: 'Draft' })}</Badge>}
                </p>
                <p className="t-meta truncate">
                  /{page.path} · {new Date(page.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={`${data.publicUrl}/${page.locale}/${page.path}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('view', { defaultValue: 'View' })}
                  </a>
                </Button>
                <Button size="sm" onClick={() => setView(page.id)}>
                  {t('edit', { defaultValue: 'Edit' })}
                </Button>
                <Button variant="danger" size="sm" onClick={() => void remove(page.id, page.title)}>
                  {t('delete', { defaultValue: 'Delete' })}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
