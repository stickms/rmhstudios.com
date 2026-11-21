/** s04-17 — in the admin user drawer: the communities a deleted or banned user owns, with "Assign owner" among their moderators. */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { api, apiQuery } from '@/lib/contract/client';
import {
  assignCommunityOwnerApi,
  listOwnedCommunitiesApi,
} from '@/lib/communities/handover.contract';
import type { OwnedCommunityDTO } from '@/lib/communities/handover';

function AssignRow({ community, onDone }: { community: OwnedCommunityDTO; onDone: () => void }) {
  const { t } = useTranslation('community-handover');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const selectId = `assign-${community.id}`;
  const assign = async () => {
    setBusy(true);
    try {
      await api(assignCommunityOwnerApi, { params: { slug: community.slug }, body: { userId } });
      toast.success(t('assigned', { name: community.name, defaultValue: 'New owner set for {{name}}.' }));
      onDone();
    } catch {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-col gap-2 border-b border-site-border py-3">
      <p className="t-body">{community.name}</p>
      {community.moderators.length === 0 ? (
        <p className="t-meta">
          {t('admin-no-moderators', { defaultValue: 'No moderators to hand it to.' })}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={selectId} className="t-label">
              {t('admin-moderator-for', {
                name: community.name,
                defaultValue: 'New owner of {{name}}',
              })}
            </label>
            <Select id={selectId} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t('choose', { defaultValue: 'Choose a moderator' })}</option>
              {community.moderators.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.handle ? `@${m.handle}` : (m.name ?? '')}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="default" disabled={busy || !userId} onClick={() => void assign()}>
            {t('admin-assign', { defaultValue: 'Assign owner' })}
          </Button>
        </div>
      )}
    </li>
  );
}

export function AdminOwnedCommunities({ userId }: { userId: string }) {
  const { t } = useTranslation('community-handover');
  const queryClient = useQueryClient();
  const options = apiQuery(listOwnedCommunitiesApi, { params: { id: userId } });
  const query = useQuery({ ...options, retry: false });
  const orphaned = query.data?.communities.filter((c) => c.orphan) ?? [];
  if (query.isError) {
    return (
      <p role="alert" className="t-body text-site-danger">
        {t('error-load-admin', { defaultValue: "Couldn't load this account's communities." })}
      </p>
    );
  }
  if (orphaned.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="t-label">{t('admin-heading', { defaultValue: 'Communities without an owner' })}</h3>
      <ul>
        {orphaned.map((c) => (
          <AssignRow
            key={c.id}
            community={c}
            onDone={() => void queryClient.invalidateQueries({ queryKey: options.queryKey })}
          />
        ))}
      </ul>
    </section>
  );
}
