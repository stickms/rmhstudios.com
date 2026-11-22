import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderInput, FolderPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { createFolderApi, listFoldersApi, moveDeckApi } from '@/lib/study/folders.contract';
import { normalizeFolderName, type DeckFolderSummary } from '@/lib/study/folders';

/**
 * "Move to folder" on an owned deck: a menu of the member's folders, "No folder", and "New folder…" (asked
 * through the prompt dialog). The menu is the accessible path; dragging is not needed.
 */
export function MoveToFolderMenu({
  deckId,
  folderId,
  folders,
  onMoved,
  showLabel = false,
}: {
  deckId: string;
  folderId: string | null;
  folders: readonly DeckFolderSummary[];
  /** Called after the move (or a new folder) with the deck's folder now, so the caller reloads its list. */
  onMoved: (folderId: string | null) => void;
  /** The deck page shows the words; a list row shows the icon alone. */
  showLabel?: boolean;
}) {
  const { t } = useTranslation('deck-folders');
  const prompt = usePrompt();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  async function move(target: string | null) {
    setOpen(false);
    if (target === folderId) return;
    try {
      await api(moveDeckApi, { params: { id: deckId }, body: { folderId: target } });
      onMoved(target);
    } catch {
      toast.error(t('move-failed', { defaultValue: 'Could not move the deck' }));
    }
  }

  async function moveToNew() {
    setOpen(false);
    const raw = await prompt({
      title: t('new-folder-title', { defaultValue: 'New folder' }),
      label: t('folder-name-label', { defaultValue: 'Folder name' }),
      confirmLabel: t('create-folder', { defaultValue: 'Create folder' }),
      validate: (v) =>
        normalizeFolderName(v) ? null : t('folder-name-invalid', { defaultValue: 'Use 1 to 40 characters' }),
    });
    const name = raw === null ? null : normalizeFolderName(raw);
    if (!name) return;
    try {
      const res = await api(createFolderApi, { body: { name } });
      await api(moveDeckApi, { params: { id: deckId }, body: { folderId: res.folder.id } });
      onMoved(res.folder.id);
    } catch (err) {
      const reason = errorField(err, 'error');
      toast.error(
        reason === 'Too many folders'
          ? t('too-many-folders', { defaultValue: 'You can have up to 30 folders' })
          : reason === 'Name taken'
            ? t('name-taken', { defaultValue: 'You already have a folder with that name' })
            : t('move-failed', { defaultValue: 'Could not move the deck' }),
      );
      onMoved(folderId);
    }
  }

  return (
    <>
      <Button
        ref={anchorRef}
        variant="ghost"
        size={showLabel ? 'default' : 'icon'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('move-to-folder', { defaultValue: 'Move to folder' })}
        onClick={() => setOpen((v) => !v)}
      >
        <FolderInput aria-hidden />
        {showLabel ? t('move-to-folder', { defaultValue: 'Move to folder' }) : null}
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label={t('move-to-folder', { defaultValue: 'Move to folder' })}
        align="end"
        className="w-56"
      >
        {folders.map((f) => (
          <MenuItem key={f.id} checked={f.id === folderId} onSelect={() => void move(f.id)}>
            {f.name}
          </MenuItem>
        ))}
        <MenuItem checked={folderId === null} onSelect={() => void move(null)}>
          {t('no-folder', { defaultValue: 'No folder' })}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={FolderPlus} onSelect={() => void moveToNew()}>
          {t('new-folder-item', { defaultValue: 'New folder…' })}
        </MenuItem>
      </AnchoredMenu>
    </>
  );
}

/** The deck page's "Move to folder": reads the member's folders itself and tells the page when the deck moved. */
export function DeckPageFolderMenu({
  deckId,
  folderId,
  onMoved,
}: {
  deckId: string;
  folderId: string | null;
  onMoved: (folderId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...apiQuery(listFoldersApi), staleTime: 30_000 });
  const [current, setCurrent] = useState(folderId);
  return (
    <MoveToFolderMenu
      deckId={deckId}
      folderId={current}
      folders={query.data?.folders ?? []}
      showLabel
      onMoved={(next) => {
        void queryClient.invalidateQueries({ queryKey: [listFoldersApi.path] });
        setCurrent(next);
        onMoved(next);
      }}
    />
  );
}
