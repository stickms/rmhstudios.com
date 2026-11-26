/**
 * SavedGraphs — the member's saved graphs, as rows on rules (s15-08).
 *
 * Opening a row fetches its stored result and hands it to the Graphing tab, which draws it at once: no model call.
 * Rename and delete act on the row; a delete asks first. The list is a React Query read (`useCalcGraphs`), so this
 * component holds no `api()` call of its own.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { isolateText } from '@/lib/i18n/user-text';
import { useCalcGraphActions, useSavedGraphs } from '@/components/rmhcalculator/useCalcGraphs';
import type { CalcGraphFull, CalcGraphSummary } from '@/lib/rmhcalculator/graphs-schema';
import { toast } from '@/lib/toast';

interface SavedGraphsProps {
  /** The saved graph the Graphing tab currently shows, if any. */
  activeId: string | null;
  /** A saved graph was opened: show its stored result. */
  onOpen: (graph: CalcGraphFull) => void;
  /** A saved graph was deleted: forget it if it is the one on screen. */
  onDeleted: (id: string) => void;
}

export function SavedGraphs({ activeId, onOpen, onDeleted }: SavedGraphsProps) {
  const { t } = useTranslation('calc-graphs');
  const confirm = useConfirm();
  const prompt = usePrompt();
  const refusalText = useRefusalText();
  const list = useSavedGraphs();
  const { update, remove, open } = useCalcGraphActions();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const arrive = useArrival(!list.isPending);

  const openRow = async (row: CalcGraphSummary) => {
    setOpeningId(row.id);
    try {
      onOpen(await open(row.id));
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('open-failed', { defaultValue: 'Could not open the graph' }));
    } finally {
      setOpeningId(null);
    }
  };

  const renameRow = async (row: CalcGraphSummary) => {
    const next = await prompt({
      title: t('rename-title', { defaultValue: 'Rename graph' }),
      label: t('name-label', { defaultValue: 'Graph name' }),
      initialValue: row.title,
      confirmLabel: t('rename-confirm', { defaultValue: 'Rename' }),
      validate: (value) =>
        value.trim() === '' ? t('name-required', { defaultValue: 'Enter a name for the graph' }) : null,
    });
    const title = next?.trim();
    if (!title || title === row.title) return;
    try {
      await update.mutateAsync({ id: row.id, body: { title } });
      toast.success(t('renamed', { defaultValue: 'Graph renamed' }));
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('rename-failed', { defaultValue: 'Could not rename the graph' }));
    }
  };

  const deleteRow = async (row: CalcGraphSummary) => {
    const sure = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this graph?' }),
      description: t('delete-description', {
        defaultValue: '“{{title}}” is removed from your saved graphs. This cannot be undone.',
        title: isolateText(row.title),
      }),
      confirmLabel: t('delete-confirm', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!sure) return;
    try {
      await remove.mutateAsync(row.id);
      onDeleted(row.id);
      toast.success(t('deleted', { defaultValue: 'Graph deleted' }));
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('delete-failed', { defaultValue: 'Could not delete the graph' }));
    }
  };

  const graphs = list.data?.graphs ?? [];

  return (
    <section className="rmhcalc-saved" aria-labelledby="rmhcalc-saved-heading">
      <h2 id="rmhcalc-saved-heading" className="t-label">
        {t('saved-heading', { defaultValue: 'Saved graphs' })}
      </h2>

      {list.isPending ? (
        <div className="rmhcalc-saved__skeleton" aria-hidden="true">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : list.isError ? (
        <div className="rmhcalc-saved__notice" role="alert">
          <p className="t-body">{t('load-failed', { defaultValue: 'Could not load your saved graphs.' })}</p>
          <Button variant="default" size="sm" onClick={() => void list.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : graphs.length === 0 ? (
        <p className={`t-body rmhcalc-saved__empty ${arrive ?? ''}`}>
          {t('empty', { defaultValue: 'No saved graphs yet. Plot a graph, then press Save graph to keep it.' })}
        </p>
      ) : (
        <ul className={`rmhcalc-saved__list ${arrive ?? ''}`}>
          {graphs.map((row) => (
            <li key={row.id} className="rmhcalc-saved__row" data-active={row.id === activeId || undefined}>
              <button
                type="button"
                className="rmhcalc-saved__open"
                disabled={openingId !== null}
                aria-current={row.id === activeId ? 'true' : undefined}
                aria-label={t('open-aria', { defaultValue: 'Open {{title}}', title: row.title })}
                onClick={() => void openRow(row)}
              >
                <span className="rmhcalc-saved__title t-body" dir="auto">
                  {row.title}
                </span>
                <span className="rmhcalc-saved__fns t-meta" dir="auto">
                  {row.functions.join(', ')}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('rename-aria', { defaultValue: 'Rename {{title}}', title: row.title })}
                disabled={update.isPending}
                onClick={() => void renameRow(row)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('delete-aria', { defaultValue: 'Delete {{title}}', title: row.title })}
                disabled={remove.isPending}
                onClick={() => void deleteRow(row)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
