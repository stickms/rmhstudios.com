/**
 * Profile links with domain verification (J1).
 *
 * The check beside a link means one thing: **the page at that address links
 * back here with `rel="me"`**, so the person controls it. It is not a badge on
 * the account, it never appears next to the display name, and there is no way
 * to buy it. That restraint is the feature — a mark that means "controls this
 * domain" stays useful, and a mark that means "is important" does not.
 *
 * The outbound anchors carry `rel="me"` once verified (`profileLinkRel`), which
 * is the reciprocal half: a Mastodon profile can verify against an RMH profile
 * the same way.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BadgeCheck, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { safeHref } from '@/lib/url-safety';
import { profileLinkRel, profileUrlFor } from '@/lib/profile-links/rel-me';
import {
  MAX_PROFILE_LINKS,
  linkDisplayLabel,
  type ProfileLinkDTO,
} from '@/lib/profile-links/shared';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  addProfileLinkApi,
  deleteProfileLinkApi,
  verifyProfileLinkApi,
} from '@/lib/profile-links/profile-links.contract';
import { profileLinksQuery } from '@/lib/profile-links/profile-links.queries';

interface ProfileLinksPanelProps {
  /** The signed-in user's handle, used to show the exact back-link to copy. */
  handle?: string | null;
}

export function ProfileLinksPanel({ handle }: ProfileLinksPanelProps) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const query = profileLinksQuery();
  // Offline or signed out the list stays empty, which is the honest render.
  const { data, isPending: loading } = useQuery(query);
  const links = data?.links ?? [];
  const setLinks = (update: (prev: ProfileLinkDTO[]) => ProfileLinkDTO[]) =>
    queryClient.setQueryData(query.queryKey, (old) => ({ links: update(old?.links ?? []) }));
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const addLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    try {
      const data = await api(addProfileLinkApi, {
        body: { url: url.trim(), label: label.trim() || undefined },
      });
      setLinks((prev) => [...prev, data.link]);
      setUrl('');
      setLabel('');
    } catch (e) {
      toast.error(
        serverError(e) ?? t('links-add-failed', { defaultValue: 'Could not add that link.' }),
      );
    } finally {
      setAdding(false);
    }
  };

  const verify = async (link: ProfileLinkDTO) => {
    setVerifyingId(link.id);
    try {
      const data = await api(verifyProfileLinkApi, { params: { id: link.id } });
      setLinks((prev) => prev.map((row) => (row.id === data.link.id ? data.link : row)));
      if (data.outcome === 'verified') {
        toast.success(t('links-verified', { defaultValue: 'Domain verified.' }));
      } else if (data.outcome === 'blocked') {
        toast.error(t('links-verify-blocked', { defaultValue: 'That address cannot be checked.' }));
      } else if (data.outcome === 'unreachable') {
        toast.error(t('links-verify-unreachable', { defaultValue: 'That page did not respond.' }));
      } else {
        toast.error(
          t('links-verify-no-match', {
            defaultValue: 'No matching rel="me" link found on that page yet.',
          }),
        );
      }
    } catch (e) {
      toast.error(
        serverError(e) ?? t('links-verify-failed', { defaultValue: 'Verification failed.' }),
      );
    } finally {
      setVerifyingId(null);
    }
  };

  const remove = async (link: ProfileLinkDTO) => {
    const confirmed = await confirm({
      title: t('links-remove-title', { defaultValue: 'Remove this link?' }),
      description: t('links-remove-confirm', {
        defaultValue: 'It disappears from your profile, along with any verification.',
      }),
      confirmLabel: t('links-remove', { defaultValue: 'Remove link' }),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api(deleteProfileLinkApi, { params: { id: link.id } });
    } catch {
      toast.error(t('links-remove-failed', { defaultValue: 'Could not remove that link.' }));
      return;
    }
    setLinks((prev) => prev.filter((row) => row.id !== link.id));
  };

  const backLink = handle ? profileUrlFor(handle) : null;
  const atLimit = links.length >= MAX_PROFILE_LINKS;

  return (
    <SettingsSection
      title={t('links-title', { defaultValue: 'Profile links' })}
      description={t('links-description', {
        defaultValue:
          'Up to five links on your profile. Add a rel="me" link back to your profile from a page you control and we will show a check beside it — it says you control that domain, nothing more.',
      })}
      bodyClassName="space-y-0"
    >
      {backLink ? (
        <div className="glass-inset mb-4 rounded-site-sm p-3">
          <p className="text-xs text-site-text-muted">
            {t('links-backlink-hint', { defaultValue: 'Put this on your own page:' })}
          </p>
          <code className="mt-1 block break-all font-mono text-xs text-site-text">
            {`<a rel="me" href="${backLink}">RMH Studios</a>`}
          </code>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : links.length === 0 ? (
        <p className="py-2 text-sm text-site-text-muted">
          {t('links-empty', { defaultValue: 'No links yet.' })}
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {links.map((link) => {
            const verified = link.verifiedAt !== null;
            return (
              <li
                key={link.id}
                className="glass-fill flex flex-wrap items-center gap-2 rounded-site-sm p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={safeHref(link.url)}
                      target="_blank"
                      rel={profileLinkRel(verified)}
                      className="truncate text-sm font-medium text-site-text hover:underline"
                    >
                      {linkDisplayLabel(link)}
                    </a>
                    {verified ? (
                      <BadgeCheck
                        className="h-4 w-4 shrink-0 text-site-success"
                        aria-label={t('links-verified-label', {
                          defaultValue: 'Domain verified',
                        })}
                      />
                    ) : null}
                    <ExternalLink className="h-3 w-3 shrink-0 text-site-text-muted" aria-hidden />
                  </div>
                  <p className="truncate text-xs text-site-text-muted">{link.url}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => void verify(link)}
                    loading={verifyingId === link.id}
                    disabled={verifyingId !== null}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    {verified
                      ? t('links-recheck', { defaultValue: 'Re-check' })
                      : t('links-verify', { defaultValue: 'Verify' })}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void remove(link)}
                    aria-label={t('links-remove-aria', { defaultValue: 'Remove link' })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={addLink} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="profile-link-url">{t('links-url-label', { defaultValue: 'URL' })}</Label>
          <Input
            id="profile-link-url"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={atLimit}
            className="mt-1"
          />
        </div>
        <div className="min-w-0 sm:w-40">
          <Label htmlFor="profile-link-label">
            {t('links-label-label', { defaultValue: 'Label' })}
          </Label>
          <Input
            id="profile-link-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t('links-label-placeholder', { defaultValue: 'Optional' })}
            disabled={atLimit}
            className="mt-1"
          />
        </div>
        <Button type="submit" loading={adding} disabled={atLimit || !url.trim()}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('links-add', { defaultValue: 'Add link' })}
        </Button>
      </form>
      {atLimit ? (
        <p className="mt-2 text-xs text-site-text-muted">
          {t('links-limit', { defaultValue: 'You have reached the five-link limit.' })}
        </p>
      ) : null}
    </SettingsSection>
  );
}
