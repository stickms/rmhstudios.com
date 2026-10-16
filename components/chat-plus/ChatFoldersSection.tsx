'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FOLDER_NAME_MAX, MAX_FOLDERS, scopeKeyOf, type ChatRef } from '@/lib/chat-plus/types';
import { CHAT_FOLDERS_KEY, useChatFolders } from './folders-hooks';

/** M1 — put this chat in (or out of) the viewer's folders; create a folder inline. */
export function ChatFoldersSection({ chat }: { chat: ChatRef }) {
  const { t } = useTranslation('f-messaging');
  const qc = useQueryClient();
  const { data: folders } = useChatFolders();
  const [name, setName] = useState('');
  const scopeKey = scopeKeyOf(chat.kind, chat.id);

  const setMember = useMutation({
    mutationFn: async ({ folderId, member }: { folderId: string; member: boolean }) => {
      const res = await fetch(`/api/chat-folders/${encodeURIComponent(folderId)}/items`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat, member }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAT_FOLDERS_KEY }),
    onError: (e: Error) =>
      toast.error(e.message || t('folder-failed', { defaultValue: 'Could not update the folder' })),
  });

  const create = useMutation({
    mutationFn: async (folderName: string) => {
      const res = await fetch('/api/chat-folders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'failed');
      return data.folder as { id: string };
    },
    onSuccess: async (folder) => {
      setName('');
      // New folders from this chat start out containing it.
      await setMember.mutateAsync({ folderId: folder.id, member: true });
    },
    onError: (e: Error) =>
      toast.error(e.message || t('folder-failed', { defaultValue: 'Could not update the folder' })),
  });

  return (
    <section aria-labelledby="opt-folders">
      <h3 id="opt-folders" className="text-sm font-semibold text-site-text">
        {t('folders-title', { defaultValue: 'Folders' })}
      </h3>
      <p className="mb-2 text-xs text-site-text-dim">
        {t('folders-help', {
          defaultValue: 'Only you see your folders. They appear as tabs above your chats.',
        })}
      </p>
      {(folders ?? []).length > 0 && (
        <div className="flex flex-col divide-y divide-site-border">
          {(folders ?? []).map((f) => (
            <label
              key={f.id}
              className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-site-text"
            >
              <span className="min-w-0 truncate">{f.name}</span>
              <Switch
                checked={f.scopeKeys.includes(scopeKey)}
                onCheckedChange={(member) => setMember.mutate({ folderId: f.id, member })}
                aria-label={t('folder-toggle', {
                  name: f.name,
                  defaultValue: 'Include this chat in {{name}}',
                })}
              />
            </label>
          ))}
        </div>
      )}
      {(folders ?? []).length < MAX_FOLDERS && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
        >
          <label className="sr-only" htmlFor="new-folder-name">
            {t('folder-new-label', { defaultValue: 'New folder name' })}
          </label>
          <input
            id="new-folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={FOLDER_NAME_MAX}
            placeholder={t('folder-new-placeholder', { defaultValue: 'New folder, e.g. Friends' })}
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
    </section>
  );
}
