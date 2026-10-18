'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PostcardBox } from '@/components/worlds/PostcardBox';
import { useVisitedWorld } from '@/components/worlds/useWorld';
import type { SavedCity } from '@/lib/isleworks/save-format';
import { useIsleworks } from '@/lib/isleworks/store';

/** R6: view-only visit to a published island, with a postcard form. */
export function IsleVisit({ code }: { code: string }) {
  const { t } = useTranslation('f-worlds');
  const { world, error, reload } = useVisitedWorld(code);
  const visiting = useIsleworks((s) => s.visiting);

  useEffect(() => {
    if (world && world.kind === 'isleworks' && !useIsleworks.getState().visiting) {
      useIsleworks.getState().startVisit(world.payload as SavedCity, { code, title: world.title });
    }
  }, [world, code]);

  if (error || (world && world.kind !== 'isleworks')) {
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
  if (!world || !visiting) return null;

  return (
    <div
      data-floating="feature-overlay"
      className="isw-panel"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        width: 'min(340px, calc(100vw - 24px))',
        zIndex: 30,
        padding: 12,
      }}
    >
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
        {t('visit-title', { defaultValue: 'Visiting {{name}}', name: world.title })}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.8 }}>
        {t('visit-readonly', { defaultValue: 'View only. Nothing you do here is saved.' })}
      </p>
      <PostcardBox world={world} onSent={reload} />
      <a className="isw-btn" style={{ marginTop: 8, width: '100%' }} href="/isleworks">
        {t('visit-home', { defaultValue: 'Go to my island' })}
      </a>
    </div>
  );
}
