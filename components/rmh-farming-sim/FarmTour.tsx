'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PostcardBox } from '@/components/worlds/PostcardBox';
import { ShareWorldDialog } from '@/components/worlds/ShareWorldDialog';
import { useVisitedWorld } from '@/components/worlds/useWorld';
import { codeFromLocation, type FarmTourPayload } from '@/lib/worlds/schema';

/** R8: HUD button that publishes a read-only tour of the member's own farm. */
export function FarmTourShare() {
  const { t } = useTranslation('f-worlds');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="rfs-btn" onClick={() => setOpen(true)}>
        {t('tour-button', { defaultValue: 'Tour' })}
      </button>
      {open && (
        <ShareWorldDialog
          kind="farm"
          open={open}
          onOpenChange={setOpen}
          title={t('tour-share-title', { defaultValue: 'Share a tour of your farm' })}
        />
      )}
    </>
  );
}

const CROP_COLOR: Record<string, string> = {
  parsnip: '#e8d39a',
  potato: '#c9a26b',
  cauliflower: '#f3f0e0',
  strawberry: '#e8485f',
  tomato: '#e0452f',
  blueberry: '#4a5fc4',
  melon: '#7bc96a',
  corn: '#e6c84a',
  pumpkin: '#e8872f',
  cranberry: '#a8273b',
  wheat: '#d8b860',
};

/** R8: read-only 2D view of a published farm (?tour=CODE). No socket needed. */
export function FarmTourViewer() {
  const { t } = useTranslation('f-worlds');
  const [code] = useState(() => codeFromLocation('farm'));
  const { world, error, reload } = useVisitedWorld(code);
  if (!code) return null;

  const farm = world?.kind === 'farm' ? (world.payload as FarmTourPayload) : null;
  return (
    <div
      data-floating="feature-overlay"
      className="rfs-modal-backdrop"
      style={{ zIndex: 60, overflowY: 'auto' }}
    >
      <div className="rfs-modal" style={{ maxWidth: 520 }}>
        <div className="rfs-modal-head">
          <h2>
            {farm
              ? t('tour-title', { defaultValue: 'Touring {{name}}', name: farm.name })
              : t('tour-loading', { defaultValue: 'Farm tour' })}
          </h2>
          <a
            className="rfs-x"
            href="/rmh-farming-sim"
            aria-label={t('tour-close', { defaultValue: 'Close tour' })}
          >
            x
          </a>
        </div>
        <div className="rfs-modal-body">
          {error && (
            <div className="rfs-empty">
              {t('tour-missing', { defaultValue: 'That tour is not available any more.' })}
            </div>
          )}
          {farm && world && (
            <>
              <div className="rfs-row-sub" style={{ marginBottom: 8 }}>
                {t('tour-sub', {
                  defaultValue: 'Day {{day}}, {{season}}. View only.',
                  day: farm.day,
                  season: farm.season,
                })}
              </div>
              <div
                role="img"
                aria-label={farm.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${farm.grid}, 1fr)`,
                  gap: 1,
                  marginBottom: 12,
                }}
              >
                {farm.tiles.map(([terrain, crop, stage], i) => (
                  <span
                    key={i}
                    style={{
                      aspectRatio: '1',
                      background: crop
                        ? (CROP_COLOR[crop] ?? '#8fbf6a')
                        : terrain
                          ? '#6b4a2a'
                          : '#4f7a3a',
                      opacity: crop ? 0.45 + Math.min(stage, 5) * 0.11 : 1,
                    }}
                  />
                ))}
              </div>
              <PostcardBox world={world} onSent={reload} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
