/**
 * What the author of a grid can do from its page: a draft can be edited, tried and published; a published grid can be
 * edited and tried until another member plays it, after which it is locked and the page says why. Publish is the one
 * ink primary, and only on a draft.
 */
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/rules';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { publishConnectionGridApi } from '@/lib/party/connections.contract';
import type { GridGroup, GridPlayView } from '@/lib/party/connections';
import { isCompleteGrid } from '@/lib/party/connections-practice';

interface Props {
  grid: Pick<GridPlayView, 'id' | 'title' | 'draft' | 'editable' | 'solution'>;
  onEdit: () => void;
  onTry: () => void;
  /** Reload the grid after a publish. */
  onChanged: () => void;
}

export function ConnectionsAuthorBar({ grid, onEdit, onTry, onChanged }: Props) {
  const { t } = useTranslation('connections-maker');
  const refusalText = useRefusalText();
  const groups: GridGroup[] = grid.solution ?? [];
  const complete = isCompleteGrid(grid.title, groups);

  async function publish() {
    try {
      await api(publishConnectionGridApi, { params: { id: grid.id } });
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('publish-failed', { defaultValue: 'Could not publish the grid.' }));
      return;
    }
    toast.success(t('grid-published', { defaultValue: 'Grid published.' }));
    onChanged();
  }

  return (
    <Section className="space-y-3 pt-4">
      {grid.draft ? (
        <p className="t-body text-site-text-muted">
          {t('draft-note', {
            defaultValue: 'This is a draft. Only you can see it, and it counts toward your grid limit.',
          })}
        </p>
      ) : !grid.editable ? (
        <p className="t-body text-site-text-muted">
          {t('locked-note', { defaultValue: 'This grid has been played, so it can no longer be changed.' })}
        </p>
      ) : (
        <p className="t-body text-site-text-muted">
          {t('editable-note', { defaultValue: 'Nobody has played this grid yet, so you can still change it.' })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {grid.draft ? (
          <Button variant="primary" disabled={!complete} onClick={() => void publish()}>
            {t('publish', { defaultValue: 'Publish' })}
          </Button>
        ) : null}
        {grid.editable ? <Button onClick={onEdit}>{t('edit', { defaultValue: 'Edit' })}</Button> : null}
        <Button disabled={!complete} onClick={onTry}>
          {t('try-it', { defaultValue: 'Try it' })}
        </Button>
      </div>
    </Section>
  );
}
