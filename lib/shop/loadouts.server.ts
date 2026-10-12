/**
 * Loadout presets — server side (C6).
 *
 * A preset is a *full* look: applying it equips exactly the items it names
 * (that the member still owns) and unequips everything else. Anything weaker
 * would make "switch to my streaming look" depend on what you happened to be
 * wearing before.
 *
 * Presets store catalog ids rather than inventory row ids, so they survive a
 * market sale and re-purchase of the same item, and a preset whose item is no
 * longer owned degrades to "apply the rest" instead of failing.
 */
import { prisma } from '@/lib/prisma.server';
import { getShopItem } from '@/lib/shop/catalog';
import { invalidateUserDisplay } from '@/lib/user-display.server';
import { LOADOUT_MAX_PRESETS, type LoadoutView } from '@/lib/shop/loadouts';

export class LoadoutError extends Error {
  constructor(readonly code: 'NOTHING_EQUIPPED' | 'TOO_MANY' | 'NOT_FOUND' | 'NOTHING_OWNED') {
    super(code);
    this.name = 'LoadoutError';
  }
}

export async function listLoadouts(userId: string): Promise<LoadoutView[]> {
  const [presets, inventory] = await Promise.all([
    prisma.loadoutPreset.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: LOADOUT_MAX_PRESETS,
    }),
    prisma.userInventory.findMany({
      where: { userId },
      select: { itemId: true, equipped: true },
    }),
  ]);
  const owned = new Set(inventory.map((i) => i.itemId));
  const equipped = new Set(inventory.filter((i) => i.equipped).map((i) => i.itemId));

  return presets.map((p) => {
    const ownedIds = p.itemIds.filter((id) => owned.has(id));
    const active =
      ownedIds.length > 0 &&
      ownedIds.length === equipped.size &&
      ownedIds.every((id) => equipped.has(id));
    return {
      id: p.id,
      name: p.name,
      active,
      items: p.itemIds.map((id) => ({
        id,
        name: getShopItem(id)?.name ?? id,
        kind: getShopItem(id)?.kind ?? 'UNKNOWN',
        owned: owned.has(id),
      })),
    };
  });
}

/** Save what the member is wearing right now under `name` (replacing a same-named preset). */
export async function saveCurrentLoadout(userId: string, name: string): Promise<string> {
  const equipped = await prisma.userInventory.findMany({
    where: { userId, equipped: true },
    select: { itemId: true },
    take: 16,
  });
  if (equipped.length === 0) throw new LoadoutError('NOTHING_EQUIPPED');
  const itemIds = equipped.map((e) => e.itemId);

  const existing = await prisma.loadoutPreset.findUnique({
    where: { userId_name: { userId, name } },
    select: { id: true },
  });
  if (existing) {
    await prisma.loadoutPreset.update({ where: { id: existing.id }, data: { itemIds } });
    return existing.id;
  }
  const count = await prisma.loadoutPreset.count({ where: { userId } });
  if (count >= LOADOUT_MAX_PRESETS) throw new LoadoutError('TOO_MANY');
  try {
    const row = await prisma.loadoutPreset.create({
      data: { userId, name, itemIds },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // Two taps on Save: the second loses the unique race — treat it as an update.
    if ((err as { code?: string })?.code === 'P2002') {
      const row = await prisma.loadoutPreset.update({
        where: { userId_name: { userId, name } },
        data: { itemIds },
        select: { id: true },
      });
      return row.id;
    }
    throw err;
  }
}

export async function deleteLoadout(userId: string, id: string): Promise<void> {
  const res = await prisma.loadoutPreset.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new LoadoutError('NOT_FOUND');
}

/** Equip a preset in one transaction. Returns how many items were equipped / skipped. */
export async function applyLoadout(
  userId: string,
  id: string,
): Promise<{ equipped: number; skipped: number }> {
  const preset = await prisma.loadoutPreset.findFirst({
    where: { id, userId },
    select: { itemIds: true },
  });
  if (!preset) throw new LoadoutError('NOT_FOUND');

  const result = await prisma.$transaction(async (tx) => {
    const owned = await tx.userInventory.findMany({
      where: { userId, itemId: { in: preset.itemIds } },
      select: { itemId: true },
    });
    if (owned.length === 0) throw new LoadoutError('NOTHING_OWNED');
    await tx.userInventory.updateMany({
      where: { userId, equipped: true },
      data: { equipped: false },
    });
    await tx.userInventory.updateMany({
      where: { userId, itemId: { in: owned.map((o) => o.itemId) } },
      data: { equipped: true },
    });
    return { equipped: owned.length, skipped: preset.itemIds.length - owned.length };
  });

  // The equipped set feeds the cached feed author display (same as /api/shop/equip).
  invalidateUserDisplay(userId);
  return result;
}
