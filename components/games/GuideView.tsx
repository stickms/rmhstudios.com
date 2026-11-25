import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Edit, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { GuideHistoryLink } from '@/components/games/GuideHistory';
import { DocBody, DocEditor, type DocDraft } from '@/components/communities/DocEditor';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession } from '@/components/Providers';
import { RemovedByModerator, ReportItemButton } from '@/components/steam/ReportItem';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { createGuideApi, deleteGuideApi, publishGuideApi, updateGuideApi } from '@/lib/games/guides.contract';

export interface GuideData {
  id: string;
  gameId: string;
  title: string;
  body: string;
  published: boolean;
  isAuthor: boolean;
  /** A moderator removed this guide; only its author is sent it (s14-08). */
  removed?: boolean;
  author: {
    name: string | null;
    handle: string | null;
    image: string | null;
  };
}

/**
 * GuideView (§6) — a player guide reader with library-style typography, plus
 * an author edit mode and a create ("new") mode. Markdown renders through the
 * same react-markdown path as builds/blog (no raw HTML).
 */
export function GuideView({ gameId, guide }: { gameId: string; guide: GuideData | null }) {
  const { t } = useTranslation('games-hub');
  const navigate = useNavigate();
  const session = useSession();
  const confirm = useConfirm();
  const isNew = guide === null;
  const [editing, setEditing] = useState(isNew);
  // What the page shows after a save: the loader's copy is not refetched.
  const [shown, setShown] = useState({ title: guide?.title ?? '', body: guide?.body ?? '' });
  const [published, setPublished] = useState(guide?.published ?? false);
  const [busy, setBusy] = useState(false);

  async function save({ title, body, summary }: DocDraft) {
    if (title.trim().length < 3 || body.trim().length < 1) {
      toast.error(
        t('guide-incomplete', {
          defaultValue: 'Add a title and some content',
        }),
      );
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const { id } = await api(createGuideApi, {
          body: {
            gameId,
            title,
            body,
          },
        });
        toast.success(
          t('guide-created', {
            defaultValue: 'Draft saved',
          }),
        );
        void navigate({
          to: '/games/$gameId/guides/$guideId',
          params: {
            gameId,
            guideId: id,
          },
        });
      } else {
        await api(updateGuideApi, {
          params: {
            id: guide.id,
          },
          body: {
            title,
            body,
            // The revision note: the history lists it beside this edit.
            ...(summary ? { note: summary } : {}),
          },
        });
        setShown({ title, body });
        setEditing(false);
        toast.success(
          t('guide-saved', {
            defaultValue: 'Guide saved',
          }),
        );
      }
    } catch {
      toast.error(
        t('error', {
          defaultValue: 'Something went wrong',
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (isNew || !guide) return;
    const next = !published;
    setPublished(next);
    const ok = await api(publishGuideApi, {
      params: {
        id: guide.id,
      },
      body: {
        published: next,
      },
    }).then(
      () => true,
      () => false,
    );
    if (!ok) setPublished(!next);
    else
      toast.success(
        next
          ? t('published', {
              defaultValue: 'Published',
            })
          : t('unpublished', {
              defaultValue: 'Unpublished',
            }),
      );
  }

  async function remove() {
    if (isNew || !guide) return;
    const ok = await confirm({
      title: t('delete-guide', {
        defaultValue: 'Delete this guide?',
      }),
      danger: true,
    });
    if (!ok) return;
    const deleted = await api(deleteGuideApi, {
      params: {
        id: guide.id,
      },
    }).then(
      () => true,
      () => false,
    );
    if (deleted)
      void navigate({
        to: '/games/$gameId',
        params: {
          gameId,
        },
      });
  }

  if (editing) {
    return (
      <div className="px-4 pt-4 pb-12">
        <DocEditor
          initialTitle={shown.title}
          initialBody={shown.body}
          maxTitle={120}
          maxBody={40_000}
          minTitle={3}
          maxSummary={120}
          askSummary={!isNew}
          busy={busy}
          saveLabel={t('save', {
            defaultValue: 'Save',
          })}
          onSave={save}
          onCancel={isNew ? undefined : () => setEditing(false)}
          labels={{
            title: t('guide-title', {
              defaultValue: 'Guide title',
            }),
            body: t('guide-body', {
              defaultValue: 'Guide content',
            }),
            bodyPlaceholder: t('guide-body-guide-view', {
              defaultValue: 'Write your guide in Markdown…',
            }),
          }}
          leading={
            !isNew ? (
              <>
                <Button variant="default" size="sm" onClick={togglePublish}>
                  {published
                    ? t('unpublish', {
                        defaultValue: 'Unpublish',
                      })
                    : t('publish', {
                        defaultValue: 'Publish',
                      })}
                </Button>
                <IconButton
                  icon={Trash2}
                  onClick={remove}
                  className="text-site-danger"
                  label={t('delete', {
                    defaultValue: 'Delete',
                  })}
                />
              </>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <article className="pt-4 pb-12">
      {/* The title is the page's h1 (PageLayout), so it is not repeated here. */}
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <UserAvatar
              src={guide!.author.image ?? undefined}
              alt={guide!.author.name ?? 'User'}
              size={28}
              fallbackName={guide!.author.name ?? undefined}
            />
            <span className="text-sm text-site-text-muted">{guide!.author.name ?? guide!.author.handle}</span>
          </span>
          {guide!.removed ? null : guide!.isAuthor ? (
            <span className="flex items-center gap-1">
              <GuideHistoryLink gameId={gameId} guideId={guide!.id} />
              <IconButton
                icon={Edit}
                onClick={() => setEditing(true)}
                label={t('edit', {
                  defaultValue: 'Edit',
                })}
              />
            </span>
          ) : (
            <ReportItemButton
              entityType="game-guide"
              entityId={guide!.id}
              signedIn={!!session.data?.user}
              isOwn={guide!.isAuthor || !guide!.published}
              className="text-sm text-site-text-muted underline"
            />
          )}
        </div>
        {guide!.removed ? <RemovedByModerator className="text-sm text-site-text-muted" /> : null}
      </header>
      <DocBody body={shown.body} />
    </article>
  );
}
