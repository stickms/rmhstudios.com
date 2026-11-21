import { useState } from 'react';
import {
  Link,
  useNavigate,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Link2,
  Lock,
} from 'lucide-react';
import { PageFrame } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/Providers';
import { joinGroupInvite } from '@/lib/group-chat/invites.queries';
import { invitePath } from '@/lib/group-chat/invites';
import type { InvitePreview } from '@/lib/group-chat/invites.server';

/** The page behind `/groups/join/$code`: one titled page, one ink primary. */
export function GroupInvitePage({
  code,
  preview,
}: {
  code: string;
  preview: InvitePreview;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-invites',
    );
  const {
    data: session,
  } =
    useSession();
  const navigate =
    useNavigate();
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const [
    refused,
    setRefused,
  ] =
    useState(
      false,
    );

  if (
    preview.state ===
      'invalid' ||
    refused
  ) {
    // One message for every reason a link cannot be used.
    return (
      <PageFrame>
        <EmptyState
          icon={
            Lock
          }
          title={t(
            'invalid-title',
            {
              defaultValue:
                "This invite can't be used",
            },
          )}
          description={t(
            'invalid-body',
            {
              defaultValue:
                'Ask the person who sent it for a new link.',
            },
          )}
          action={
            <Button
              asChild
              variant="default"
            >
              <Link
                to="/messages"
                search={{
                  tab: 'groups',
                }}
              >
                {t(
                  'back-to-groups',
                  {
                    defaultValue:
                      'Your groups',
                  },
                )}
              </Link>
            </Button>
          }
        />
      </PageFrame>
    );
  }

  if (
    preview.state ===
    'member'
  ) {
    return (
      <PageFrame>
        <EmptyState
          icon={
            Link2
          }
          title={t(
            'member-title',
            {
              defaultValue:
                'You are already in this group',
            },
          )}
          action={
            <Button
              asChild
              variant="primary"
            >
              <Link
                to={
                  `/groups/${preview.chatId}` as string
                }
              >
                {t(
                  'open-group',
                  {
                    defaultValue:
                      'Open the group',
                  },
                )}
              </Link>
            </Button>
          }
        />
      </PageFrame>
    );
  }

  async function join() {
    setBusy(
      true,
    );
    try {
      const res =
        await joinGroupInvite(
          code,
        );
      void navigate(
        {
          to: `/groups/${res.chatId}` as string,
        },
      );
    } catch {
      setRefused(
        true,
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <PageFrame>
      <div className="flex flex-col gap-4 px-4 pt-6 pb-12">
        <p className="t-label">
          {t(
            'you-are-invited',
            {
              defaultValue:
                'You are invited to a group chat',
            },
          )}
        </p>
        <h1 className="t-title">
          {preview.name ||
            t(
              'unnamed',
              {
                defaultValue:
                  'Group chat',
              },
            )}
        </h1>
        {preview.state ===
          'valid' && (
          <div className="flex flex-col gap-1">
            <p className="t-body">
              {t(
                'member-count',
                {
                  count:
                    preview.memberCount,
                  defaultValue_one:
                    '{{count}} member',
                  defaultValue_other:
                    '{{count}} members',
                },
              )}
            </p>
            {preview
              .memberNames
              .length >
              0 && (
              <p className="t-meta">
                {preview.memberNames.join(
                  ', ',
                )}
              </p>
            )}
          </div>
        )}
        {preview.state ===
          'valid' &&
        session ? (
          <Button
            variant="primary"
            className="self-start"
            onClick={() =>
              void join()
            }
            loading={
              busy
            }
          >
            {t(
              'join',
              {
                defaultValue:
                  'Join group',
              },
            )}
          </Button>
        ) : (
          <Button
            asChild
            variant="primary"
            className="self-start"
          >
            <Link
              to="/login"
              search={{
                callbackURL:
                  invitePath(
                    code,
                  ),
              }}
            >
              {t(
                'sign-in-to-join',
                {
                  defaultValue:
                    'Sign in to join',
                },
              )}
            </Link>
          </Button>
        )}
      </div>
    </PageFrame>
  );
}
