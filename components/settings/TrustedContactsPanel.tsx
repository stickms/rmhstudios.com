/**
 * Trusted contacts (I3 §3) — nominate three people, and vouch for the people
 * who nominated you.
 *
 * The approval control is written to be *hard to press casually*: it names what
 * is being approved, it says out loud that it hands over an account, and it
 * confirms. A quorum that people click through without reading is not a quorum,
 * it is a phishing target with extra steps.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Check, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  approveRecoveryRequestApi,
  confirmTrustedContactApi,
  nominateTrustedContactApi,
  removeTrustedContactApi,
} from '@/lib/recovery/recovery.contract';
import type { RecoveryRequestDTO } from '@/lib/recovery/requests.server';
import type { TrustedContactDTO } from '@/lib/recovery/trusted-contacts.server';
import { recoveryRequestsQuery, trustedContactsQuery } from '@/lib/recovery/recovery.queries';

type ContactRow = TrustedContactDTO;
type ApprovableRequest = RecoveryRequestDTO;

const MAX_CONTACTS = 3;

export function TrustedContactsPanel() {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const contactsQuery = trustedContactsQuery();
  const requestsQuery = recoveryRequestsQuery();
  // Each part fails on its own: a failed read leaves that part empty.
  const { data: contactData, isPending: contactsPending } = useQuery(contactsQuery);
  const { data: requestData, isPending: requestsPending } = useQuery(requestsQuery);
  const loading = contactsPending || requestsPending;
  // The body spaces its children (settings.css `> * + *`), so each one takes the fade.
  const arrival = useArrival(!loading);
  const contacts: ContactRow[] = contactData?.contacts ?? [];
  const trustedFor: ContactRow[] = contactData?.trustedFor ?? [];
  const approvable: ApprovableRequest[] = requestData?.approvable ?? [];
  const setContacts = (update: (prev: ContactRow[]) => ContactRow[]) =>
    queryClient.setQueryData(contactsQuery.queryKey, (old) => ({
      contacts: update(old?.contacts ?? []),
      trustedFor: old?.trustedFor ?? [],
    }));
  const setTrustedFor = (update: (prev: ContactRow[]) => ContactRow[]) =>
    queryClient.setQueryData(contactsQuery.queryKey, (old) => ({
      contacts: old?.contacts ?? [],
      trustedFor: update(old?.trustedFor ?? []),
    }));
  const setApprovable = (update: (prev: ApprovableRequest[]) => ApprovableRequest[]) =>
    queryClient.setQueryData(requestsQuery.queryKey, (old) => ({
      mine: old?.mine ?? [],
      approvable: update(old?.approvable ?? []),
    }));
  const [handle, setHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const nominate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!handle.trim()) return;
    setAdding(true);
    try {
      const data = await api(nominateTrustedContactApi, {
        body: { handle: handle.trim().replace(/^@/, '') },
      });
      setContacts((prev) => [...prev, data.contact]);
      setHandle('');
      toast.success(
        t('contacts-added', { defaultValue: 'Invitation sent. They have to accept it.' }),
      );
    } catch (e) {
      toast.error(
        serverError(e) ?? t('contacts-add-failed', { defaultValue: 'Could not add that person.' }),
      );
    } finally {
      setAdding(false);
    }
  };

  const remove = async (row: ContactRow) => {
    setBusyId(row.id);
    try {
      await api(removeTrustedContactApi, { params: { id: row.id } });
      setContacts((prev) => prev.filter((item) => item.id !== row.id));
      setTrustedFor((prev) => prev.filter((item) => item.id !== row.id));
    } catch {
      toast.error(t('contacts-remove-failed', { defaultValue: 'Could not remove that.' }));
    } finally {
      setBusyId(null);
    }
  };

  const accept = async (row: ContactRow) => {
    setBusyId(row.id);
    try {
      await api(confirmTrustedContactApi, { params: { id: row.id } });
      setTrustedFor((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, confirmedAt: new Date().toISOString() } : item,
        ),
      );
    } catch {
      toast.error(t('contacts-accept-failed', { defaultValue: 'Could not accept that.' }));
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (request: ApprovableRequest) => {
    const who = request.owner?.handle ? `@${request.owner.handle}` : '';
    const confirmed = await confirm({
      title: t('contacts-approve-title', { defaultValue: 'Approve this account recovery?' }),
      description: t('contacts-approve-confirm', {
        defaultValue:
          'Only approve if you have spoken to this person another way and know it is really them. Two approvals hand over the account, including anything it has bought.',
      }),
      confirmLabel: t('contacts-approve', { defaultValue: 'Approve recovery' }),
      danger: true,
    });
    if (!confirmed) return;
    setBusyId(request.id);
    try {
      const data = await api(approveRecoveryRequestApi, { params: { id: request.id } });
      setApprovable((prev) =>
        prev.map((item) =>
          item.id === request.id
            ? { ...item, approvedByMe: true, approvals: data.approvals }
            : item,
        ),
      );
      toast.success(
        t('contacts-approved', { defaultValue: 'Approved.' }) + (who ? ` (${who})` : ''),
      );
    } catch (e) {
      toast.error(
        serverError(e) ?? t('contacts-approve-failed', { defaultValue: 'Could not approve that.' }),
      );
    } finally {
      setBusyId(null);
    }
  };

  const atLimit = contacts.length >= MAX_CONTACTS;

  return (
    <SettingsSection
      title={t('contacts-title', { defaultValue: 'Trusted contacts' })}
      description={t('contacts-description', {
        defaultValue:
          'Nominate up to three people. If you ever lose access, two of them approving — after a 24-hour wait you can cancel — gets you back in.',
      })}
      bodyClassName="space-y-0"
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <>
          {approvable.length > 0 ? (
            <ul className={cn('mb-4 space-y-2', arrival)}>
              {approvable.map((request) => (
                <li key={request.id} className="rounded-site-sm p-3">
                  <div className="flex items-center gap-2">
                    {request.owner ? (
                      <UserAvatar
                        src={request.owner.image}
                        alt={request.owner.name ?? request.owner.handle ?? ''}
                        size={32}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-site-text">
                        {request.owner?.name ?? request.owner?.handle ?? ''}
                      </p>
                      <p className="text-xs text-site-text-muted">
                        {t('contacts-request-detail', {
                          defaultValue: 'is trying to recover their account. Approvals:',
                        })}{' '}
                        {request.approvals}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-2"
                    disabled={request.approvedByMe || busyId === request.id}
                    onClick={() => void approve(request)}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    {request.approvedByMe
                      ? t('contacts-approved-label', { defaultValue: 'You approved this' })
                      : t('contacts-approve', { defaultValue: 'Approve recovery' })}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <h3 className={cn('mb-2 text-sm font-semibold text-site-text', arrival)}>
            {t('contacts-mine-title', { defaultValue: 'People you nominated' })}
          </h3>
          {contacts.length === 0 ? (
            <p className={cn('mb-3 text-sm text-site-text-muted', arrival)}>
              {t('contacts-mine-empty', { defaultValue: 'Nobody yet.' })}
            </p>
          ) : (
            <ul className={cn('mb-3 space-y-2', arrival)}>
              {contacts.map((row) => (
                <li key={row.id} className="flex items-center gap-2 rounded-site-sm p-3">
                  <UserAvatar
                    src={row.user.image}
                    alt={row.user.name ?? row.user.handle ?? ''}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-site-text">
                      {row.user.name ?? `@${row.user.handle ?? ''}`}
                    </p>
                    <p className="text-xs text-site-text-muted">
                      {row.confirmedAt
                        ? t('contacts-confirmed', { defaultValue: 'Accepted' })
                        : t('contacts-pending', { defaultValue: 'Waiting for them to accept' })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={busyId === row.id}
                    onClick={() => void remove(row)}
                    aria-label={t('contacts-remove-aria', {
                      defaultValue: 'Remove trusted contact',
                    })}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={nominate}
            className={cn('mb-4 flex flex-col gap-2 sm:flex-row sm:items-end', arrival)}
          >
            <div className="min-w-0 flex-1">
              <Label htmlFor="trusted-contact-handle">
                {t('contacts-handle-label', { defaultValue: 'Their handle' })}
              </Label>
              <Input
                id="trusted-contact-handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="@handle"
                disabled={atLimit}
                className="mt-1"
              />
            </div>
            <Button type="submit" loading={adding} disabled={atLimit || !handle.trim()}>
              <UserPlus className="h-4 w-4" aria-hidden />
              {t('contacts-add', { defaultValue: 'Nominate' })}
            </Button>
          </form>

          {trustedFor.length > 0 ? (
            <>
              <h3 className={cn('mb-2 text-sm font-semibold text-site-text', arrival)}>
                {t('contacts-for-title', { defaultValue: 'People who nominated you' })}
              </h3>
              <ul className={cn('space-y-2', arrival)}>
                {trustedFor.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 rounded-site-sm p-3"
                  >
                    <UserAvatar
                      src={row.user.image}
                      alt={row.user.name ?? row.user.handle ?? ''}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-site-text">
                        {row.user.name ?? `@${row.user.handle ?? ''}`}
                      </p>
                      <p className="text-xs text-site-text-muted">
                        {row.confirmedAt
                          ? t('contacts-you-accepted', { defaultValue: 'You accepted' })
                          : t('contacts-you-pending', { defaultValue: 'Waiting for your answer' })}
                      </p>
                    </div>
                    {row.confirmedAt ? null : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => void accept(row)}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        {t('contacts-accept', { defaultValue: 'Accept' })}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busyId === row.id}
                      onClick={() => void remove(row)}
                      aria-label={t('contacts-decline-aria', {
                        defaultValue: 'Decline being a trusted contact',
                      })}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </SettingsSection>
  );
}
