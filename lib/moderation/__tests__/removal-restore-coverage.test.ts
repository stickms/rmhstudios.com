import { describe, expect, it, vi } from 'vitest';
import { shapeChecked } from '@/lib/db/query-shape';
import { REMOVABLE_REPORT_ENTITY_TYPES } from '@/lib/moderation/report-schema';
import { REVERSIBLE_REMOVAL_TYPES } from '@/lib/moderation/removal-reviews';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
import { restoreRemovedItem } from '@/lib/moderation/removal-restore.server';

/**
 * Sprint 15, feature 16: every type a member may ask a second look at has a restore branch, is a type a report can
 * remove, and the restore writes only what undoes the takedown (never a visibility switch).
 */

/** The model each reversible type's restore writes to, and the extra column its takedown also stamped. */
const MODEL: Record<(typeof REVERSIBLE_REMOVAL_TYPES)[number], { accessor: string; data: Record<string, null> }> = {
  'study-deck': { accessor: 'flashcardDeck', data: { moderatedAt: null } },
  persona: { accessor: 'aiPersona', data: { moderatedAt: null } },
  'home-listing': { accessor: 'homeListing', data: { moderatedAt: null } },
  'rmhbox-pack': { accessor: 'rmhboxPack', data: { moderatedAt: null, autoHiddenAt: null } },
  'game-review': { accessor: 'gameReview', data: { moderatedAt: null } },
  'game-guide': { accessor: 'gameGuide', data: { moderatedAt: null } },
  'achievement-tip': { accessor: 'achievementTip', data: { moderatedAt: null } },
  'tf2-hud': { accessor: 'tf2Hud', data: { moderatedAt: null } },
  'tf2-loadout': { accessor: 'tf2Loadout', data: { moderatedAt: null } },
  'versecraft-seed': { accessor: 'versecraftSeedListing', data: { moderatedAt: null } },
};

describe('REVERSIBLE_REMOVAL_TYPES', () => {
  it('is exactly the specified list', () => {
    expect([...REVERSIBLE_REMOVAL_TYPES].sort()).toEqual(
      [
        'study-deck',
        'persona',
        'home-listing',
        'rmhbox-pack',
        'game-review',
        'game-guide',
        'achievement-tip',
        'tf2-hud',
        'tf2-loadout',
        'versecraft-seed',
      ].sort(),
    );
    for (const never of ['tube-room', 'lights-out-board', 'connections-grid', 'studio-share', 'webring', 'stamp']) {
      expect(REVERSIBLE_REMOVAL_TYPES as readonly string[]).not.toContain(never);
    }
  });

  it('is a subset of the removable report types', () => {
    for (const type of REVERSIBLE_REMOVAL_TYPES) {
      expect(REMOVABLE_REPORT_ENTITY_TYPES as readonly string[], `${type} is not removable`).toContain(type);
    }
  });

  it('has a restore branch per type that clears the stamp and nothing else', async () => {
    for (const type of REVERSIBLE_REMOVAL_TYPES) {
      const { accessor, data } = MODEL[type];
      const updateMany = vi.fn(async () => ({ count: 1 }));
      const db = shapeChecked({ [accessor]: { updateMany } });
      expect(await restoreRemovedItem(db as never, type, 'item-1'), type).toBe(true);
      expect(updateMany, type).toHaveBeenCalledTimes(1);
      expect(updateMany, type).toHaveBeenCalledWith({ where: { id: 'item-1', moderatedAt: { not: null } }, data });
    }
  });

  it('changes nothing for an item that is not stamped (or was deleted)', async () => {
    const db = shapeChecked({ flashcardDeck: { updateMany: vi.fn(async () => ({ count: 0 })) } });
    expect(await restoreRemovedItem(db as never, 'study-deck', 'gone')).toBe(false);
  });
});
