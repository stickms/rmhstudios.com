/**
 * L7 on profiles. `useShelvesTab` decides (lazily, after idle, from the shelves
 * route — never from the profile payload) whether the profile shows a Shelves
 * tab. Deliberately tiny: ProfileColumn imports it statically.
 */

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useIdleReady } from '@/hooks/useIdleReady';
import { apiJson } from '@/lib/reading/client';
import type { ShelfPublicView } from '@/lib/reading/schema';

const key = (id: string) => ['profile-shelves', id] as const;

export function useProfileShelves(ownerId: string, enabled: boolean) {
  return useQuery({
    queryKey: key(ownerId),
    queryFn: () => apiJson<ShelfPublicView>(`/api/profile/${encodeURIComponent(ownerId)}/shelves`),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Tab descriptor for ProfileColumn: shown on your own profile, or when others' public shelves are non-empty. */
export function useShelvesTab(ownerId: string | undefined, isOwn: boolean) {
  const { t } = useTranslation('f-reading');
  const idle = useIdleReady();
  const { data } = useProfileShelves(ownerId ?? '', idle && !!ownerId);
  const show = isOwn || (data?.entries.length ?? 0) > 0;
  return { show, label: t('profile-shelves-tab', { defaultValue: 'Shelves' }) };
}
