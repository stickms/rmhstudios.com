'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PostcardBox } from '@/components/worlds/PostcardBox';
import { useVisitedWorld } from '@/components/worlds/useWorld';
import type { SavedCity } from '@/lib/isleworks/save-format';
import { useIsleworks } from '@/lib/isleworks/store';

export type IsleVisitState = ReturnType<typeof useIsleVisit>;

/**
 * Load a shared island and hand it to the store as a view-only visit. Lives in
 * the game shell (not in the overlay) so the phone HUD can show the same visit
 * inside its sheet instead of floating a second panel over the map.
 */
export function useIsleVisit(code: string | null) {
  const { world, error, reload } = useVisitedWorld(code);
  const visiting = useIsleworks((s) => s.visiting);

  useEffect(() => {
    if (code && world && world.kind === 'isleworks' && !useIsleworks.getState().visiting) {
      useIsleworks.getState().startVisit(world.payload as SavedCity, { code, title: world.title });
    }
  }, [world, code]);

  const missing =
    Boolean(code) && (error !== null || (world !== null && world.kind !== 'isleworks'));
  return { world, reload, missing, ready: Boolean(world && visiting) };
}

/** The visit's content: what this is, the postcard form, the way home. */
export function VisitPanel({
  visit,
  compact = false,
}: {
  visit: IsleVisitState;
  compact?: boolean;
}) {
  const { t } = useTranslation('f-worlds');
  const { world, reload } = visit;
  if (!world) return null;
  return (
    <>
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
        {t('visit-title', { defaultValue: 'Visiting {{name}}', name: world.title })}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.8 }}>
        {t('visit-readonly', { defaultValue: 'View only. Nothing you do here is saved.' })}
      </p>
      <PostcardBox world={world} onSent={reload} />
      <a
        className="isw-btn"
        style={{ marginTop: 8, width: '100%', ...(compact ? { height: 44 } : null) }}
        href="/isleworks"
      >
        {t('visit-home', { defaultValue: 'Go to my island' })}
      </a>
    </>
  );
}

/**
 * R6: view-only visit to a published island, with a postcard form. Desktop
 * floats it bottom-left; on the phone HUD (`compact`) it is not an overlay at
 * all — CompactHud shows the same panel in its sheet — so only the
 * "not available" card remains here.
 */
export function IsleVisit({ visit, compact }: { visit: IsleVisitState; compact: boolean }) {
  const { t } = useTranslation('f-worlds');

  if (visit.missing) {
    return (
      <div className="isw-title">
        <div className="isw-panel isw-title-card">
          <p className="isw-title-tag">
            {t('visit-missing', { defaultValue: 'That island is not available any more.' })}
          </p>
          <a
            className="isw-btn isw-btn--primary"
            style={{ height: 40, padding: '0 18px' }}
            href="/isleworks"
          >
            {t('visit-home', { defaultValue: 'Go to my island' })}
          </a>
        </div>
      </div>
    );
  }
  if (compact || !visit.ready) return null;

  return (
    <div
      data-floating="feature-overlay"
      className="isw-panel"
      style={{
        position: 'fixed',
        left: 'calc(12px + var(--safe-left, 0px))',
        bottom: 'calc(12px + var(--safe-bottom, 0px))',
        width: 'min(340px, calc(100vw - 24px - var(--safe-left, 0px) - var(--safe-right, 0px)))',
        zIndex: 30,
        padding: 12,
      }}
    >
      <VisitPanel visit={visit} />
    </div>
  );
}
