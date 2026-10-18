'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FolderPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FOLDER_NAME_MAX, MAX_FOLDERS } from '@/lib/chat-plus/types';
import { CHAT_FOLDERS_KEY, useChatFolders, type ChatFolder } from './folders-hooks';

/** Rename, delete and create folders. Adding chats happens from each chat's options. */
export default function ManageFoldersDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('f-messaging');
  const qc = useQueryClient();
  const { data: folders } = useChatFolders();
  const [name, setName] = useState('');

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'failed');
    return data;
  };
  const refresh = () => qc.invalidateQueries({ queryKey: CHAT_FOLDERS_KEY });
  const fail = (e: Error) =>
    toast.error(e.message || t('folder-failed', { defaultValue: 'Could not update the folder' }));

  const create = useMutation({
    mutationFn: (n: string) => call('/api/chat-folders', 'POST', { name: n }),
    onSuccess: () => {
      setName('');
      return refresh();
    },
    onError: fail,
  });
  const rename = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      call(`/api/chat-folders/${encodeURIComponent(id)}`, 'PATCH', { name: n }),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => call(`/api/chat-folders/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: refresh,
    onError: fail,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('folders-manage', { defaultValue: 'Manage folders' })}</DialogTitle>
          <DialogDescription>
            {t('folders-manage-help', {
              defaultValue:
                'Add a chat to a folder from its Chat options. Deleting a folder never deletes the chats in it.',
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {(folders ?? []).map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              onRename={(n) => rename.mutate({ id: f.id, n })}
              onDelete={() => remove.mutate(f.id)}
            />
          ))}
          {(folders ?? []).length === 0 && (
            <li className="py-3 text-center text-sm text-site-text-dim">
              {t('folders-none', { defaultValue: 'No folders yet.' })}
            </li>
          )}
        </ul>
        {(folders ?? []).length < MAX_FOLDERS && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate(name.trim());
            }}
          >
            <label className="sr-only" htmlFor="manage-new-folder">
              {t('folder-new-label', { defaultValue: 'New folder name' })}
            </label>
            <input
              id="manage-new-folder"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={FOLDER_NAME_MAX}
              placeholder={t('folder-new-placeholder', {
                defaultValue: 'New folder, e.g. Friends',
              })}
              className="glass-inset min-h-11 min-w-0 flex-1 rounded-site px-3 text-sm text-site-text outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!name.trim()}
              loading={create.isPending}
            >
              <FolderPlus aria-hidden />
              {t('folder-create', { defaultValue: 'Create' })}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FolderRow({
  folder,
  onRename,
  onDelete,
}: {
  folder: ChatFolder;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('f-messaging');
  const [value, setValue] = useState(folder.name);
  const dirty = value.trim() && value.trim() !== folder.name;
  return (
    <li className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`folder-${folder.id}`}>
        {t('folder-rename-label', { defaultValue: 'Folder name' })}
      </label>
      <input
        id={`folder-${folder.id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={FOLDER_NAME_MAX}
        className="glass-inset min-h-11 min-w-0 flex-1 rounded-site px-3 text-sm text-site-text outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
      />
      <span className="shrink-0 text-xs tabular-nums text-site-text-dim">
        {t('folder-chat-count', {
          count: folder.scopeKeys.length,
          defaultValue: '{{count}} chats',
        })}
      </span>
      {dirty ? (
        <Button
          size="icon"
          variant="accent"
          aria-label={t('folder-save', { defaultValue: 'Save name' })}
          onClick={() => onRename(value.trim())}
        >
          <Check />
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('folder-delete', { name: folder.name, defaultValue: 'Delete {{name}}' })}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}
