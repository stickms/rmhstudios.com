import { useState, type ReactNode } from 'react';
import { FolderPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DeckFolderRow } from '@/components/study/DeckFolderRow';
import { MoveToFolderMenu } from '@/components/study/MoveToFolderMenu';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { api, errorField } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { createFolderApi, deleteFolderApi, updateFolderApi } from '@/lib/study/folders.contract';
import { groupDecks, normalizeFolderName, type DeckFolderSummary } from '@/lib/study/folders';

interface FolderDeck {
  id: string;
  folderId?: string | null;
  dueCount?: number;
}

/**
 * The member's own decks grouped by folder: folders in order (each with its counts, collapse and menu), then the
 * decks with no folder. With no folders the list is the flat one it always was, plus "New folder".
 */
export function DeckFolderList<D extends FolderDeck>({
  decks,
  folders,
  renderDeck,
  onChanged,
}: {
  decks: readonly D[];
  folders: readonly DeckFolderSummary[];
  renderDeck: (deck: D) => ReactNode;
  /** Reload the deck list after any change. */
  onChanged: () => void;
}) {
  const { t } = useTranslation('deck-folders');
  const prompt = usePrompt();
  const confirm = useConfirm();
  // A toggle shows at once; the server value takes over on the next load.
  const [collapsedNow, setCollapsedNow] = useState<Record<string, boolean>>({});

  const nameValidator = (v: string) =>
    normalizeFolderName(v) ? null : t('folder-name-invalid', { defaultValue: 'Use 1 to 40 characters' });

  function failure(err: unknown) {
    const reason = errorField(err, 'error');
    toast.error(
      reason === 'Too many folders'
        ? t('too-many-folders', { defaultValue: 'You can have up to 30 folders' })
        : reason === 'Name taken'
          ? t('name-taken', { defaultValue: 'You already have a folder with that name' })
          : t('folder-failed', { defaultValue: 'Could not change the folder' }),
    );
  }

  async function createNew() {
    const raw = await prompt({
      title: t('new-folder-title', { defaultValue: 'New folder' }),
      label: t('folder-name-label', { defaultValue: 'Folder name' }),
      confirmLabel: t('create-folder', { defaultValue: 'Create folder' }),
      validate: nameValidator,
    });
    const name = raw === null ? null : normalizeFolderName(raw);
    if (!name) return;
    try {
      await api(createFolderApi, { body: { name } });
      onChanged();
    } catch (err) {
      failure(err);
    }
  }

  async function rename(f: DeckFolderSummary) {
    const raw = await prompt({
      title: t('rename-folder-title', { defaultValue: 'Rename folder' }),
      label: t('folder-name-label', { defaultValue: 'Folder name' }),
      initialValue: f.name,
      confirmLabel: t('rename-folder', { defaultValue: 'Rename' }),
      validate: nameValidator,
    });
    const name = raw === null ? null : normalizeFolderName(raw);
    if (!name || name === f.name) return;
    try {
      await api(updateFolderApi, { params: { id: f.id }, body: { name } });
      onChanged();
    } catch (err) {
      failure(err);
    }
  }

  async function move(f: DeckFolderSummary, direction: 'up' | 'down') {
    try {
      await api(updateFolderApi, { params: { id: f.id }, body: { move: direction } });
      onChanged();
    } catch (err) {
      failure(err);
    }
  }

  async function remove(f: DeckFolderSummary) {
    const ok = await confirm({
      title: t('delete-folder-title', { name: f.name, defaultValue: 'Delete {{name}}?' }),
      description: t('delete-folder-body', {
        defaultValue: 'Delete the folder; its decks move to No folder.',
      }),
      confirmLabel: t('delete-folder', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteFolderApi, { params: { id: f.id } });
      onChanged();
    } catch (err) {
      failure(err);
    }
  }

  async function toggle(f: DeckFolderSummary, collapsed: boolean) {
    const next = !collapsed;
    setCollapsedNow((m) => ({ ...m, [f.id]: next }));
    try {
      await api(updateFolderApi, { params: { id: f.id }, body: { collapsed: next } });
    } catch (err) {
      setCollapsedNow((m) => ({ ...m, [f.id]: collapsed }));
      failure(err);
    }
  }

  const row = (d: D) => (
    <div key={d.id} className="flex items-center gap-1 pr-2">
      <div className="min-w-0 flex-1">{renderDeck(d)}</div>
      <MoveToFolderMenu deckId={d.id} folderId={d.folderId ?? null} folders={folders} onMoved={onChanged} />
    </div>
  );

  const groups = groupDecks(decks, folders);
  const loose = groups[groups.length - 1];
  const folderGroups = groups.slice(0, -1);

  return (
    <div>
      <div className="flex items-center justify-end px-2 pb-1">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => void createNew()}>
          <FolderPlus aria-hidden /> {t('new-folder', { defaultValue: 'New folder' })}
        </Button>
      </div>
      {folderGroups.map((g, i) => {
        const f = g.folder as DeckFolderSummary;
        const collapsed = collapsedNow[f.id] ?? f.collapsed;
        return (
          <DeckFolderRow
            key={f.id}
            folder={f}
            collapsed={collapsed}
            deckCount={g.decks.length}
            dueCount={g.due}
            isFirst={i === 0}
            isLast={i === folderGroups.length - 1}
            onToggle={() => void toggle(f, collapsed)}
            onRename={() => void rename(f)}
            onMove={(dir) => void move(f, dir)}
            onDelete={() => void remove(f)}
          >
            {g.decks.length === 0 ? (
              <p className="t-meta px-4 py-3">{t('folder-empty', { defaultValue: 'No decks yet' })}</p>
            ) : (
              g.decks.map(row)
            )}
          </DeckFolderRow>
        );
      })}
      {loose && loose.decks.length > 0 && (
        <section>
          {folderGroups.length > 0 && (
            <h3 className="t-heading border-b border-site-border px-4 py-2">
              {t('no-folder', { defaultValue: 'No folder' })}
            </h3>
          )}
          {loose.decks.map(row)}
        </section>
      )}
    </div>
  );
}
