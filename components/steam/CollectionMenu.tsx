'use client';

import { useId, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { toast } from 'sonner';
import { FolderPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FAVORITES, MAX_NAME } from '@/lib/games/collections';
import { useLibraryCollections } from '@/hooks/useLibraryCollections';

const layoutApi = getRouteApi('/games/_library');

/** "Add to collection": tick the collections a title is in, or start a new one. */
export function CollectionMenu({ gameId }: { gameId: string }) {
  const { t } = useTranslation('games-hub');
  const { collections: server, signedIn } = layoutApi.useLoaderData();
  const { collections, has, toggle } = useLibraryCollections(server, signedIn);
  const [name, setName] = useState('');
  const id = useId();
  const custom = collections.filter((c) => c.name !== FAVORITES);

  const fail = (code?: string) =>
    toast.error(
      code === 'TOO_MANY'
        ? t('steam-collections-err-many', { defaultValue: 'You have too many collections.' })
        : code === 'BAD_NAME'
          ? t('steam-collections-err-name', { defaultValue: 'Choose a different name for the collection.' })
          : t('steam-collections-err', { defaultValue: 'Could not update your collections.' }),
    );

  if (!signedIn) return null; // custom collections live on the account

  return (
    <details className="stm-collmenu">
      <summary className="stm-btn">
        <FolderPlus aria-hidden size={16} />
        {t('steam-collections-add', { defaultValue: 'Add to collection' })}
      </summary>
      <div className="stm-collmenu-panel">
        <label className="stm-collmenu-row">
          <input type="checkbox" checked={has(FAVORITES, gameId)} onChange={() => void toggle(FAVORITES, gameId, fail)} />
          {t('steam-section-favorites', { defaultValue: 'Favorites' })}
        </label>
        {custom.map((c) => (
          <label key={c.name} className="stm-collmenu-row">
            <input type="checkbox" checked={c.ids.includes(gameId)} onChange={() => void toggle(c.name, gameId, fail)} />
            {c.name}
          </label>
        ))}
        <form
          className="stm-collmenu-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void toggle(name, gameId, fail);
            setName('');
          }}
        >
          <label htmlFor={id} className="stm-sr">
            {t('steam-collections-new', { defaultValue: 'New collection' })}
          </label>
          <input
            id={id}
            className="stm-input"
            value={name}
            maxLength={MAX_NAME}
            placeholder={t('steam-collections-new', { defaultValue: 'New collection' })}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="stm-btn" disabled={!name.trim()}>
            {t('steam-collections-create', { defaultValue: 'Create' })}
          </button>
        </form>
      </div>
    </details>
  );
}
