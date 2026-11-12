import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useChatFolders } from './folders-hooks';

const ManageFoldersDialog = lazy(() => import('./ManageFoldersDialog'));

/** `all`, the built-in `unread`, or a folder id. */
export type FolderFilter = string;

/**
 * M1 — folder tabs over the DM list and the group list. "All" and "Unread" are
 * built in; the rest are the viewer's own folders. The folders are fetched after
 * first paint, and until they arrive the bar is just All / Unread, so the list
 * underneath never waits on it. The parent filters server-side
 * (`?folder=` / `?filter=unread`) so pagination stays correct.
 */
export function ChatFolderBar({
  value,
  onChange,
}: {
  value: FolderFilter;
  onChange: (next: FolderFilter) => void;
}) {
  const { t } = useTranslation('f-messaging');
  const idle = useIdleReady();
  const { data: folders } = useChatFolders(idle);
  const [managing, setManaging] = useState(false);

  // A deleted folder must not leave the list stuck on it.
  useEffect(() => {
    if (folders && value !== 'all' && value !== 'unread' && !folders.some((f) => f.id === value)) {
      onChange('all');
    }
  }, [folders, value, onChange]);

  const tabs: TabItem[] = [
    { id: 'all', label: t('folder-all', { defaultValue: 'All' }) },
    { id: 'unread', label: t('folder-unread', { defaultValue: 'Unread' }) },
    ...(folders ?? []).map((f) => ({ id: f.id, label: f.name })),
  ];

  return (
    <div className="flex items-center gap-1 pb-3">
      <div className="min-w-0 flex-1">
        <Tabs
          tabs={tabs}
          value={value}
          onChange={onChange}
          size="sm"
          aria-label={t('folder-tabs', { defaultValue: 'Chat folders' })}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setManaging(true)}
        aria-haspopup="dialog"
        aria-label={t('folders-manage', { defaultValue: 'Manage folders' })}
        title={t('folders-manage', { defaultValue: 'Manage folders' })}
        className="shrink-0 text-site-text-muted"
      >
        <FolderCog className="size-5" />
      </Button>
      {managing && (
        <Suspense fallback={null}>
          <ManageFoldersDialog onClose={() => setManaging(false)} />
        </Suspense>
      )}
    </div>
  );
}
