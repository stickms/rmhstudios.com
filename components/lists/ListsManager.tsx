'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { List as ListIcon, Plus, Pin } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import type { ListView } from '@/lib/lists/constants';

export function ListsManager({ initial }: { initial: ListView[] }) {
  const { t } = useTranslation('c-lists');
  const [lists, setLists] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error('create failed');
      const { list } = (await res.json()) as { list: ListView };
      setLists((prev) => [list, ...prev]);
      setName('');
      setCreating(false);
      toast.success(t('created', { defaultValue: 'List created' }));
    } catch {
      toast.error(t('error', { defaultValue: "Couldn't create the list" }));
    }
  }

  return (
    <div className="px-4 pt-4 pb-12">
      <div className="mb-4 flex justify-end">
        {creating ? (
          <div className="flex flex-1 gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder={t('name-placeholder', { defaultValue: 'List name' })}
              aria-label={t('name-placeholder', { defaultValue: 'List name' })}
              autoFocus
            />
            <Button variant="accent" onClick={create}>
              {t('create', { defaultValue: 'Create' })}
            </Button>
          </div>
        ) : (
          <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('new-list', { defaultValue: 'New list' })}
          </Button>
        )}
      </div>

      {lists.length === 0 ? (
        <EmptyState
          icon={ListIcon}
          title={t('empty-title', { defaultValue: 'No lists yet' })}
          description={t('empty-desc', { defaultValue: 'Group accounts and read them as their own feed.' })}
        />
      ) : (
        <ul className="space-y-2">
          {lists.map((l) => (
            <li key={l.id}>
              <Card interactive className="flex-row items-center gap-3 px-4 py-3">
                <a href={`/lists/${l.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <ListIcon className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-site-text">{l.name}</span>
                      {l.pinned ? <Pin className="h-3 w-3 shrink-0 text-site-text-dim" aria-hidden /> : null}
                    </span>
                    <span className="block text-xs text-site-text-muted">
                      {l.memberCount} {t('members', { defaultValue: 'members' })} · {l.visibility.toLowerCase()}
                    </span>
                  </span>
                </a>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
