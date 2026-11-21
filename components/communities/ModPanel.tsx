/** The mod tools tab: queue, AutoMod, flairs, settings, onboarding, related, and (private communities) requests and invites. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Tabs,
  type TabItem,
} from '@/components/ui/tabs';
import { ModBans } from '@/components/communities/ModBans';
import { ModAutomod } from '@/components/communities/ModAutomod';
import { ModFlairs } from '@/components/communities/ModFlairs';
import { ModLog } from '@/components/communities/ModLog';
import {
  ModInsights,
  useInsightsTabLabel,
} from '@/components/communities/ModInsights';
import { ModInvites } from '@/components/communities/ModInvites';
import { ModRequests } from '@/components/communities/ModRequests';
import { ModOnboarding } from '@/components/communities/ModOnboarding';
import { ModRules } from '@/components/communities/ModRules';
import { ModQueue } from '@/components/communities/ModQueue';
import { ModSettings } from '@/components/communities/ModSettings';
import { HandoverPanel } from '@/components/communities/HandoverPanel';
import { ModSisters } from '@/components/communities/ModSisters';
import type { CommunityExtrasDTO } from '@/lib/communities/plus';

export default function ModPanel({
  slug,
  isPrivate = false,
  isOwner = false,
  extras,
  onExtrasChange,
}: {
  slug: string;
  /** Private communities get the Requests and Invites tabs. */
  isPrivate?: boolean;
  /** The owner also sees the Ownership section under Posting rules. */
  isOwner?: boolean;
  extras: CommunityExtrasDTO | null;
  onExtrasChange: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      [
        'f-communities-plus',
        'community-bans',
      ],
    );
  const {
    t: tr,
  } =
    useTranslation(
      'community-rules',
    );
  const {
    t: tl,
  } =
    useTranslation(
      'community-modlog',
    );
  const insightsLabel =
    useInsightsTabLabel();
  const [
    sub,
    setSub,
  ] =
    useState(
      'queue',
    );
  const tabs: TabItem[] =
    [
      {
        id: 'queue',
        label:
          t(
            'mod-queue',
            {
              defaultValue:
                'Queue',
            },
          ),
      },
      {
        id: 'log',
        label:
          tl(
            'mod-tab',
            {
              defaultValue:
                'Log',
            },
          ),
      },
      {
        id: 'bans',
        label:
          t(
            'mod-tab',
            {
              ns: 'community-bans',
              defaultValue:
                'Bans',
            },
          ),
      },
      {
        id: 'insights',
        label:
          insightsLabel,
      },
      {
        id: 'automod',
        label:
          t(
            'mod-automod',
            {
              defaultValue:
                'AutoMod',
            },
          ),
      },
      {
        id: 'flairs',
        label:
          t(
            'mod-flairs',
            {
              defaultValue:
                'Flairs',
            },
          ),
      },
      {
        id: 'rules',
        label:
          tr(
            'mod-tab',
            {
              defaultValue:
                'Rules',
            },
          ),
      },
      {
        id: 'settings',
        label:
          t(
            'mod-settings',
            {
              defaultValue:
                'Posting rules',
            },
          ),
      },
      {
        id: 'onboarding',
        label:
          t(
            'mod-onboarding',
            {
              defaultValue:
                'Onboarding',
            },
          ),
      },
      {
        id: 'related',
        label:
          t(
            'mod-related',
            {
              defaultValue:
                'Related',
            },
          ),
      },
      ...(isPrivate
        ? [
            {
              id: 'requests',
              label:
                t(
                  'mod-requests',
                  {
                    defaultValue:
                      'Requests',
                  },
                ),
            },
            {
              id: 'invites',
              label:
                t(
                  'mod-invites',
                  {
                    defaultValue:
                      'Invites',
                  },
                ),
            },
          ]
        : []),
    ];
  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      <Tabs
        tabs={
          tabs
        }
        value={
          sub
        }
        onChange={
          setSub
        }
        aria-label={t(
          'mod-tools',
          {
            defaultValue:
              'Mod tools',
          },
        )}
      />
      {sub ===
        'queue' && (
        <ModQueue
          slug={
            slug
          }
          rules={
            extras?.rules ??
            []
          }
          onOpenLog={() =>
            setSub(
              'log',
            )
          }
        />
      )}
      {sub ===
        'log' && (
        <ModLog
          slug={
            slug
          }
        />
      )}
      {sub ===
        'bans' && (
        <ModBans
          slug={
            slug
          }
        />
      )}
      {sub ===
        'insights' && (
        <ModInsights
          slug={
            slug
          }
        />
      )}
      {sub ===
        'automod' && (
        <ModAutomod
          slug={
            slug
          }
        />
      )}
      {sub ===
        'flairs' && (
        <ModFlairs
          slug={
            slug
          }
          flairs={
            extras?.flairs ??
            []
          }
          onChange={
            onExtrasChange
          }
        />
      )}
      {sub ===
        'rules' && (
        <ModRules
          slug={
            slug
          }
          onChange={
            onExtrasChange
          }
        />
      )}
      {sub ===
        'settings' &&
        extras && (
          <ModSettings
            slug={
              slug
            }
            extras={
              extras
            }
            onChange={
              onExtrasChange
            }
          />
        )}
      {sub ===
        'settings' &&
        isOwner && (
          <HandoverPanel
            slug={
              slug
            }
          />
        )}
      {sub ===
        'onboarding' && (
        <ModOnboarding
          slug={
            slug
          }
          flairs={
            extras?.flairs ??
            []
          }
          onChange={
            onExtrasChange
          }
        />
      )}
      {sub ===
        'requests' &&
        isPrivate && (
          <ModRequests
            slug={
              slug
            }
          />
        )}
      {sub ===
        'invites' &&
        isPrivate && (
          <ModInvites
            slug={
              slug
            }
          />
        )}
      {sub ===
        'related' &&
        extras && (
          <ModSisters
            slug={
              slug
            }
            sisters={
              extras.sisters
            }
            onChange={
              onExtrasChange
            }
          />
        )}
    </div>
  );
}
