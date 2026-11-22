/**
 * A community's wiki list (s09-04): pinned pages first, then by last edit, as rows on rules. Moderators also get the
 * way to add a page.
 */
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { DocEditor, type DocDraft } from '@/components/communities/DocEditor';
import { useWikiText } from '@/components/communities/wiki/useWikiText';
import { createCommunityPageApi } from '@/lib/communities/pages.contract';
import { MAX_PAGE_BODY, MAX_PAGE_TITLE, isEditPolicy, type EditPolicy } from '@/lib/communities/page-policy';
import type { CommunityPageSummary } from '@/lib/communities/pages.server';

interface WikiIndexProps {
  communityId: string;
  communitySlug: string;
  communityName: string;
  pages: CommunityPageSummary[];
  /** A moderator (or site admin) who is not refused by a timeout or ban. */
  canCreate: boolean;
  signedIn: boolean;
}

export function WikiIndex({ communityId, communitySlug, communityName, pages, canCreate, signedIn }: WikiIndexProps) {
  const { t } = useTranslation('community-wiki');
  const fmt = useLocaleFormat();
  const navigate = useNavigate();
  const { failureText } = useWikiText();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<EditPolicy>('mods');

  const create = async (draft: DocDraft) => {
    setBusy(true);
    try {
      const page = await api(createCommunityPageApi, {
        body: { communityId, title: draft.title, body: draft.body, editPolicy: policy },
      });
      toast.success(t('created', { defaultValue: 'Page created' }));
      void navigate({ to: `/c/${communitySlug}/wiki/${page.slug}` as string });
    } catch (error) {
      toast.error(failureText(error));
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-12">
      <p className="t-meta">
        <Link to={`/c/${communitySlug}` as string} className="underline">
          <bdi>{communityName}</bdi>
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="t-title text-site-text">{t('title', { defaultValue: 'Wiki' })}</h1>
        {canCreate && !creating ? (
          <Button variant="default" onClick={() => setCreating(true)}>
            {t('new-page', { defaultValue: 'New page' })}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <section className="mt-6 border-t border-site-border pt-4" aria-labelledby="wiki-new-heading">
          <h2 id="wiki-new-heading" className="t-heading mb-3 text-site-text">
            {t('new-page-heading', { defaultValue: 'New page' })}
          </h2>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="wiki-new-policy" className="t-body">
              {t('policy-label', { defaultValue: 'Who can edit' })}
            </label>
            <Select
              id="wiki-new-policy"
              value={policy}
              onChange={(e) => {
                if (isEditPolicy(e.target.value)) setPolicy(e.target.value);
              }}
            >
              <option value="mods">{t('policy-mods', { defaultValue: 'Moderators' })}</option>
              <option value="members">{t('policy-members', { defaultValue: 'Members' })}</option>
              <option value="trusted">
                {t('policy-trusted-long', { defaultValue: 'Members for 30 days with no strikes' })}
              </option>
            </Select>
          </div>
          <DocEditor
            initialTitle=""
            initialBody=""
            maxBody={MAX_PAGE_BODY}
            maxTitle={MAX_PAGE_TITLE}
            askSummary={false}
            busy={busy}
            saveLabel={t('create-page', { defaultValue: 'Create page' })}
            onSave={create}
            onCancel={() => setCreating(false)}
          />
        </section>
      ) : null}

      {pages.length === 0 ? (
        <EmptyState
          title={t('empty-title', { defaultValue: 'No pages yet' })}
          description={
            canCreate
              ? t('empty-body-mod', { defaultValue: 'Add a FAQ, a reading list or how the weekly thread works.' })
              : signedIn
                ? t('empty-body-member', { defaultValue: 'Moderators add the pages; members can improve them.' })
                : t('empty-body-signed-out', { defaultValue: 'This community has not written any pages yet.' })
          }
        />
      ) : (
        <ul className="mt-4 border-t border-site-border">
          {pages.map((page) => (
            <li key={page.id} className="border-b border-site-border">
              <Link
                to={`/c/${communitySlug}/wiki/${page.slug}` as string}
                className="flex flex-wrap items-baseline justify-between gap-x-4 py-3"
              >
                <span className="t-body font-medium">
                  <bdi>{page.title}</bdi>
                  {page.pinned ? <span className="t-meta ml-2">{t('pinned', { defaultValue: 'Pinned' })}</span> : null}
                </span>
                <time className="t-meta" dateTime={page.updatedAt}>
                  {t('edited-at', { date: fmt.dateTime(page.updatedAt), defaultValue: 'Last edited {{date}}' })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
