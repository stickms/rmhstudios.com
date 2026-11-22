/**
 * One community wiki page (s09-04): read, edit, history and the moderator controls.
 *
 * The page arrives from the route loader (`/c/$slug/wiki/$page`); a save, a restore or a settings change re-runs the
 * loader (`router.invalidate`), so what is shown is always the server's copy and its `updatedAt` is the base of the
 * next write (a stale base is a 409, "Someone else edited this page").
 */
import { useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { DocBody } from '@/components/communities/DocEditor';
import { WikiHistory } from '@/components/communities/wiki/WikiHistory';
import { WikiPageEditor } from '@/components/communities/wiki/WikiPageEditor';
import { readDraft } from '@/components/communities/wiki/draft-store';
import { useWikiText } from '@/components/communities/wiki/useWikiText';
import { deleteCommunityPageApi, updateCommunityPageApi } from '@/lib/communities/pages.contract';
import { EDIT_POLICIES, isEditPolicy } from '@/lib/communities/page-policy';
import type { CommunityPageDTO } from '@/lib/communities/pages.server';

interface WikiPageProps {
  communitySlug: string;
  communityName: string;
  page: CommunityPageDTO;
  /** A moderator (or site admin) who is not refused by a timeout or ban: sees the page settings and delete. */
  canModerate: boolean;
}

type PageTab = 'page' | 'history';

const noopSubscribe = () => () => {};

export function WikiPage({ communitySlug, communityName, page, canModerate }: WikiPageProps) {
  const { t } = useTranslation('community-wiki');
  const fmt = useLocaleFormat();
  const router = useRouter();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { refusalLine, failureText, policyLabel } = useWikiText();
  const [tab, setTab] = useState<PageTab>('page');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // An unsaved edit from before a reload. Read from the browser only: the server render and hydration say "none",
  // and the next render (opening or closing the editor re-renders this) says what the browser holds.
  const hasDraft = useSyncExternalStore(
    noopSubscribe,
    () => readDraft(page.id) !== null,
    () => false,
  );

  const tabs: TabItem[] = [
    { id: 'page', label: t('tab-page', { defaultValue: 'Page' }) },
    { id: 'history', label: t('tab-history', { defaultValue: 'History' }) },
  ];

  const refusal = refusalLine(page.refusal, page.refusalEndsAt);

  const change = async (patch: { editPolicy?: (typeof EDIT_POLICIES)[number]; pinned?: boolean }) => {
    setSaving(true);
    try {
      await api(updateCommunityPageApi, {
        params: { id: page.id },
        body: { ...patch, baseUpdatedAt: page.updatedAt },
      });
      toast.success(t('settings-saved', { defaultValue: 'Page settings saved' }));
      await router.invalidate();
    } catch (error) {
      toast.error(failureText(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('delete-confirm-title', { defaultValue: 'Delete this page?' }),
      description: t('delete-confirm-body', { defaultValue: 'The page and its history are removed for everyone.' }),
      confirmLabel: t('delete-confirm', { defaultValue: 'Delete page' }),
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api(deleteCommunityPageApi, { params: { id: page.id } });
      toast.success(t('deleted', { defaultValue: 'Page deleted' }));
      void navigate({ to: `/c/${communitySlug}/wiki` as string });
    } catch (error) {
      toast.error(failureText(error));
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-12">
      <p className="t-meta">
        <Link to={`/c/${communitySlug}/wiki` as string} className="underline">
          {t('back-to-wiki', { name: communityName, defaultValue: '{{name}} wiki' })}
        </Link>
      </p>
      <h1 className="t-title mt-2 text-site-text">
        <bdi>{page.title}</bdi>
      </h1>
      <p className="t-meta mt-1">
        {page.pinned ? `${t('pinned', { defaultValue: 'Pinned' })} · ` : ''}
        {t('edited-at', { date: fmt.dateTime(page.updatedAt), defaultValue: 'Last edited {{date}}' })}
        {' · '}
        {t('editable-by', {
          who: policyLabel(page.editPolicy),
          defaultValue: 'Editable by: {{who}}',
        })}
      </p>

      <Tabs
        className="mt-4"
        sheet={false}
        tabs={tabs}
        value={tab}
        onChange={(id) => setTab(id === 'history' ? 'history' : 'page')}
        aria-label={t('tabs-label', { defaultValue: 'Page sections' })}
      />

      <div className="pt-4">
        {tab === 'history' ? (
          <WikiHistory pageId={page.id} updatedAt={page.updatedAt} canEdit={page.canEdit} />
        ) : editing ? (
          <WikiPageEditor page={page} onDone={() => setEditing(false)} />
        ) : (
          <>
            <DocBody body={page.body} />
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-site-border pt-4">
              {page.canEdit ? (
                <Button variant="default" onClick={() => setEditing(true)}>
                  {hasDraft
                    ? t('continue-editing', { defaultValue: 'Continue your edit' })
                    : t('edit-page', { defaultValue: 'Edit page' })}
                </Button>
              ) : null}
              {refusal ? <p className="t-body text-site-text-muted">{refusal}</p> : null}
            </div>
          </>
        )}
      </div>

      {canModerate && tab === 'page' && !editing ? (
        <section className="mt-8 border-t border-site-border pt-4" aria-labelledby="wiki-page-settings">
          <h2 id="wiki-page-settings" className="t-heading text-site-text">
            {t('settings-heading', { defaultValue: 'Page settings' })}
          </h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-site-border pb-3">
            <label htmlFor="wiki-policy" className="t-body">
              {t('policy-label', { defaultValue: 'Who can edit' })}
            </label>
            <Select
              id="wiki-policy"
              value={page.editPolicy}
              disabled={saving}
              onChange={(e) => {
                if (isEditPolicy(e.target.value)) void change({ editPolicy: e.target.value });
              }}
            >
              <option value="mods">{t('policy-mods', { defaultValue: 'Moderators' })}</option>
              <option value="members">{t('policy-members', { defaultValue: 'Members' })}</option>
              <option value="trusted">
                {t('policy-trusted-long', { defaultValue: 'Members for 30 days with no strikes' })}
              </option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-site-border py-3">
            <span id="wiki-pin-label" className="t-body">
              {t('pin-label', { defaultValue: 'Pin to the top of the list' })}
            </span>
            <Switch
              checked={page.pinned}
              disabled={saving}
              aria-labelledby="wiki-pin-label"
              onCheckedChange={(pinned) => void change({ pinned })}
            />
          </div>
          <div className="pt-3">
            <Button variant="danger" disabled={saving} onClick={() => void remove()}>
              {t('delete-page', { defaultValue: 'Delete page' })}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
