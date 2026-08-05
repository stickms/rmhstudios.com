'use client';

/**
 * Trusted contacts (I3 §3) — nominate three people, and vouch for the people
 * who nominated you.
 *
 * The approval control is written to be *hard to press casually*: it names what
 * is being approved, it says out loud that it hands over an account, and it
 * confirms. A quorum that people click through without reading is not a quorum,
 * it is a phishing target with extra steps.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, ShieldQuestion, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface ContactUser {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

interface ContactRow {
  id: string;
  confirmedAt: string | null;
  createdAt: string;
  user: ContactUser;
}

interface ApprovableRequest {
  id: string;
  createdAt: string;
  expiresAt: string;
  approvals: number;
  approvalsNeeded: number;
  phase: string;
  owner?: ContactUser;
  approvedByMe?: boolean;
}

const MAX_CONTACTS = 3;

export function TrustedContactsPanel() {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [trustedFor, setTrustedFor] = useState<ContactRow[]>([]);
  const [approvable, setApprovable] = useState<ApprovableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsRes, requestsRes] = await Promise.all([
        fetch('/api/account/recovery/contacts'),
        fetch('/api/account/recovery/requests'),
      ]);
      if (contactsRes.ok) {
        const data = (await contactsRes.json()) as {
          contacts: ContactRow[];
          trustedFor: ContactRow[];
        };
        setContacts(data.contacts);
        setTrustedFor(data.trustedFor);
      }
      if (requestsRes.ok) {
        const data = (await requestsRes.json()) as { approvable: ApprovableRequest[] };
        setApprovable(data.approvable);
      }
    } catch {
      // Leave the panel empty rather than throwing at the user.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nominate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!handle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/account/recovery/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim().replace(/^@/, '') }),
      });
      const data = (await res.json().catch(() => ({}))) as { contact?: ContactRow; error?: string };
      if (!res.ok || !data.contact) {
        toast.error(
          data.error ?? t('contacts-add-failed', { defaultValue: 'Could not add that person.' }),
        );
        return;
      }
      setContacts((prev) => [...prev, data.contact as ContactRow]);
      setHandle('');
      toast.success(
        t('contacts-added', { defaultValue: 'Invitation sent. They have to accept it.' }),
      );
    } finally {
      setAdding(false);
    }
  };

  const remove = async (row: ContactRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/account/recovery/contacts/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error(t('contacts-remove-failed', { defaultValue: 'Could not remove that.' }));
        return;
      }
      setContacts((prev) => prev.filter((item) => item.id !== row.id));
      setTrustedFor((prev) => prev.filter((item) => item.id !== row.id));
    } finally {
      setBusyId(null);
    }
  };

  const accept = async (row: ContactRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/account/recovery/contacts/${encodeURIComponent(row.id)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        toast.error(t('contacts-accept-failed', { defaultValue: 'Could not accept that.' }));
        return;
      }
      setTrustedFor((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, confirmedAt: new Date().toISOString() } : item,
        ),
      );
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
      const res = await fetch(`/api/account/recovery/requests/${encodeURIComponent(request.id)}`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; approvals?: number };
      if (!res.ok) {
        toast.error(
          data.error ?? t('contacts-approve-failed', { defaultValue: 'Could not approve that.' }),
        );
        return;
      }
      setApprovable((prev) =>
        prev.map((item) =>
          item.id === request.id
            ? { ...item, approvedByMe: true, approvals: data.approvals ?? item.approvals + 1 }
            : item,
        ),
      );
      toast.success(
        t('contacts-approved', { defaultValue: 'Approved.' }) + (who ? ` (${who})` : ''),
      );
    } finally {
      setBusyId(null);
    }
  };

  const atLimit = contacts.length >= MAX_CONTACTS;

  return (
    <section className="glass-pane rounded-site p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldQuestion className="h-5 w-5 text-site-accent" aria-hidden />
        <h2 className="text-base font-bold text-site-text">
          {t('contacts-title', { defaultValue: 'Trusted contacts' })}
        </h2>
      </div>
      <p className="mb-4 text-sm text-site-text-muted">
        {t('contacts-description', {
          defaultValue:
            'Nominate up to three people. If you ever lose access, two of them approving — after a 24-hour wait you can cancel — gets you back in.',
        })}
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <>
          {approvable.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {approvable.map((request) => (
                <li key={request.id} className="glass-fill rounded-site-sm p-3">
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
                    variant="outline"
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

          <h3 className="mb-2 text-sm font-semibold text-site-text">
            {t('contacts-mine-title', { defaultValue: 'People you nominated' })}
          </h3>
          {contacts.length === 0 ? (
            <p className="mb-3 text-sm text-site-text-muted">
              {t('contacts-mine-empty', { defaultValue: 'Nobody yet.' })}
            </p>
          ) : (
            <ul className="mb-3 space-y-2">
              {contacts.map((row) => (
                <li key={row.id} className="glass-fill flex items-center gap-2 rounded-site-sm p-3">
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

          <form onSubmit={nominate} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
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
              <h3 className="mb-2 text-sm font-semibold text-site-text">
                {t('contacts-for-title', { defaultValue: 'People who nominated you' })}
              </h3>
              <ul className="space-y-2">
                {trustedFor.map((row) => (
                  <li
                    key={row.id}
                    className="glass-fill flex items-center gap-2 rounded-site-sm p-3"
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
                        variant="outline"
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
    </section>
  );
}
