'use client';

/** Invite links for a private community: create, copy, see usage, revoke. */
import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import type { InviteDTO } from '@/lib/communities/invites.server';

/** Expiry choices, in days; `''` = never. Mirrors INVITE_LIMITS.maxExpiryDays (90). */
const EXPIRY_OPTIONS = ['1', '7', '30', '90'] as const;

/** Mirrors INVITE_LIMITS.maxUsesCap (1000) — invites.server.ts is server-only, so it can't be imported here. */
const MAX_USES_CAP = 1000;

export function ModInvites({ slug }: { slug: string }) {
  const { t } = useTranslation('f-communities-plus');
  const confirm = useConfirm();
  const [invites, setInvites] = useState<InviteDTO[] | null>(null);
  const [maxUses, setMaxUses] = useState('');
  const [expiry, setExpiry] = useState('7');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await plusFetch<{ invites: InviteDTO[] }>(communityApi(slug, '/invites'));
    setInvites(res.data?.invites ?? []);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    const uses = Number.parseInt(maxUses, 10);
    const res = await plusFetch<{ invite: InviteDTO }>(communityApi(slug, '/invites'), 'POST', {
      maxUses: Number.isFinite(uses) && uses > 0 ? Math.min(uses, MAX_USES_CAP) : null,
      expiresInDays: expiry ? Number.parseInt(expiry, 10) : null,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(
        res.error || t('invite-create-error', { defaultValue: "Couldn't create the link" }),
      );
      return;
    }
    setInvites((cur) => [res.data!.invite, ...(cur ?? [])]);
  };

  const revoke = async (invite: InviteDTO) => {
    const ok = await confirm({
      title: t('invite-revoke-title', { defaultValue: 'Revoke this invite link?' }),
      description: t('invite-revoke-body', {
        defaultValue: 'Anyone holding it will no longer be able to join with it.',
      }),
      confirmLabel: t('invite-revoke', { defaultValue: 'Revoke' }),
      danger: true,
    });
    if (!ok) return;
    const res = await plusFetch(communityApi(slug, `/invites/${invite.id}`), 'DELETE');
    if (!res.ok) {
      toast.error(t('invite-revoke-error', { defaultValue: "Couldn't revoke the link" }));
      return;
    }
    setInvites((cur) => cur?.filter((i) => i.id !== invite.id) ?? null);
  };

  const linkFor = (code: string) =>
    `${typeof window === 'undefined' ? '' : window.location.origin}/c/${encodeURIComponent(slug)}/invite/${code}`;

  const stateLabel = (i: InviteDTO) =>
    i.state === 'expired'
      ? t('invite-state-expired', { defaultValue: 'Expired' })
      : i.state === 'exhausted'
        ? t('invite-state-exhausted', { defaultValue: 'Used up' })
        : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-fill flex flex-wrap items-end gap-3 p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="invite-max-uses">
            {t('invite-max-uses', { defaultValue: 'Max uses (optional)' })}
          </Label>
          <Input
            id="invite-max-uses"
            inputMode="numeric"
            value={maxUses}
            maxLength={4}
            className="w-32"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              // Clamp as typed so the field can never hold a value the server would 400.
              setMaxUses(digits && Number(digits) > MAX_USES_CAP ? String(MAX_USES_CAP) : digits);
            }}
            placeholder={t('invite-unlimited', { defaultValue: 'Unlimited' })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="invite-expiry">{t('invite-expires', { defaultValue: 'Expires' })}</Label>
          <Select id="invite-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXPIRY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {t('invite-expires-days', {
                  count: Number(d),
                  defaultValue_one: '{{count}} day',
                  defaultValue: '{{count}} days',
                })}
              </option>
            ))}
            <option value="">{t('invite-expires-never', { defaultValue: 'Never' })}</option>
          </Select>
        </div>
        <Button variant="accent" onClick={create} disabled={busy}>
          {t('invite-create', { defaultValue: 'Create link' })}
        </Button>
      </div>

      {!invites ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : invites.length === 0 ? (
        <EmptyState
          icon={Link2}
          title={t('invite-empty', { defaultValue: 'No invite links yet' })}
          description={t('invite-empty-hint', {
            defaultValue: 'Create a link to let people join without asking.',
          })}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {invites.map((i) => {
            const label = stateLabel(i);
            return (
              <li key={i.id} className="glass-fill flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-site-sm glass-inset px-2 py-1 text-xs text-site-text">
                    {linkFor(i.code)}
                  </code>
                  <CopyButton
                    value={linkFor(i.code)}
                    label={t('invite-copy', { defaultValue: 'Copy invite link' })}
                    disabled={i.state !== 'active'}
                  />
                  <Button size="sm" variant="outline" onClick={() => revoke(i)}>
                    {t('invite-revoke', { defaultValue: 'Revoke' })}
                  </Button>
                </div>
                <p className="flex flex-wrap gap-x-2 text-xs text-site-text-muted">
                  <span>
                    {i.maxUses === null
                      ? t('invite-uses-unlimited', {
                          count: i.uses,
                          defaultValue_one: '{{count}} use',
                          defaultValue: '{{count}} uses',
                        })
                      : t('invite-uses-limited', {
                          uses: i.uses,
                          max: i.maxUses,
                          defaultValue: '{{uses}} of {{max}} uses',
                        })}
                  </span>
                  <span>·</span>
                  <span>
                    {i.expiresAt
                      ? t('invite-expires-on', {
                          date: format(new Date(i.expiresAt), 'PP'),
                          defaultValue: 'Expires {{date}}',
                        })
                      : t('invite-never-expires', { defaultValue: 'Never expires' })}
                  </span>
                  <span>·</span>
                  <span>
                    {t('invite-created-by', {
                      name:
                        i.createdBy.name ||
                        i.createdBy.handle ||
                        t('someone', { defaultValue: 'Someone' }),
                      when: formatDistanceToNow(new Date(i.createdAt), { addSuffix: true }),
                      defaultValue: 'Created by {{name}} {{when}}',
                    })}
                  </span>
                  {label && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-site-text">{label}</span>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
