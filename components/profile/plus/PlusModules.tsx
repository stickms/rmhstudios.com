'use client';

import { lazy, Suspense } from 'react';
import type { ProfileModule, PlusModuleKind } from '@/lib/profile/modules';

/**
 * The P05 profile showcase modules (Top Four, /now, stamp wall, webrings,
 * skills, visitor counter). `ProfileShowcase` lazy-loads THIS file the first
 * time a profile actually has one of these modules, and each module is its own
 * chunk beyond that — a profile with only a /now block does not download the
 * stamp wall or the report dialog.
 */
const TopFourModule = lazy(() => import('./TopFourModule'));
const NowModule = lazy(() => import('./NowModule'));
const StampWallModule = lazy(() => import('./StampWallModule'));
const WebringStripModule = lazy(() => import('./WebringStripModule'));
const EndorsementsModule = lazy(() => import('./EndorsementsModule'));
const VisitorCounterModule = lazy(() => import('./VisitorCounterModule'));

export type PlusModule = Extract<ProfileModule, { kind: PlusModuleKind }>;

export default function PlusModules({
  module,
  title,
  userId,
  isOwner,
}: {
  module: PlusModule;
  title: string;
  userId: string;
  isOwner: boolean;
}) {
  return (
    <Suspense fallback={null}>
      {module.kind === 'top-four' ? (
        <TopFourModule title={title} items={module.config.items} isOwner={isOwner} />
      ) : module.kind === 'now' ? (
        <NowModule title={title} userId={userId} isOwner={isOwner} />
      ) : module.kind === 'stamps' ? (
        <StampWallModule title={title} userId={userId} isOwner={isOwner} />
      ) : module.kind === 'webrings' ? (
        <WebringStripModule title={title} userId={userId} isOwner={isOwner} />
      ) : module.kind === 'endorsements' ? (
        <EndorsementsModule title={title} userId={userId} isOwner={isOwner} />
      ) : (
        <VisitorCounterModule title={title} userId={userId} />
      )}
    </Suspense>
  );
}
