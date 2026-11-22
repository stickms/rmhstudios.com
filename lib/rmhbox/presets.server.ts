/**
 * RMHBox host presets: the database half. Every call is scoped to the caller's own rows.
 * Values are fitted to the minigame's settings schema on save and again on read, so a
 * stored preset is never trusted as-is (the schema may have changed since).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { MINIGAME_REGISTRY } from '@/lib/rmhbox/minigame-registry';
import {
  PRESETS_PER_GAME,
  PRESETS_TOTAL,
  normalizePresetValues,
  type PresetErrorCode,
  type RmhboxPreset,
} from '@/lib/rmhbox/presets';
import type { GameSettingValues } from '@/lib/rmhbox/types';

export type PresetResult<T> =
  { ok: true; value: T } | { ok: false; status: number; code: PresetErrorCode; error: string };

const FAIL = {
  'name-taken': { status: 409, error: 'You already have a preset with that name' },
  'game-limit': { status: 422, error: `You can keep ${PRESETS_PER_GAME} presets per game` },
  'total-limit': { status: 422, error: `You can keep ${PRESETS_TOTAL} presets in total` },
  'unknown-game': { status: 400, error: 'Unknown game' },
  'not-found': { status: 404, error: 'Not found' },
} as const;

function fail(code: PresetErrorCode): { ok: false; status: number; code: PresetErrorCode; error: string } {
  return { ok: false, code, ...FAIL[code] };
}

interface PresetRow {
  id: string;
  minigameId: string;
  name: string;
  values: Prisma.JsonValue;
  isDefault: boolean;
  updatedAt: Date;
}

/** The schema a minigame's settings are validated with, or null when it has none. */
function schemaOf(minigameId: string) {
  return MINIGAME_REGISTRY[minigameId]?.settingsSchema ?? null;
}

/** A row as the client sees it, with values fitted to the schema as it is now. */
export function toPreset(row: PresetRow): RmhboxPreset {
  const schema = schemaOf(row.minigameId);
  const fitted = schema ? normalizePresetValues(schema, row.values) : { values: {}, reset: true };
  return {
    id: row.id,
    minigameId: row.minigameId,
    name: row.name,
    values: fitted.values,
    isDefault: row.isDefault,
    reset: fitted.reset,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const select = { id: true, minigameId: true, name: true, values: true, isDefault: true, updatedAt: true } as const;

export async function listPresets(userId: string, minigameId?: string): Promise<RmhboxPreset[]> {
  const rows = await prisma.rmhboxSettingsPreset.findMany({
    where: { userId, ...(minigameId ? { minigameId } : {}) },
    orderBy: [{ minigameId: 'asc' }, { name: 'asc' }],
    select,
  });
  return rows.map(toPreset);
}

export async function createPreset(
  userId: string,
  input: { minigameId: string; name: string; values: Record<string, unknown>; isDefault?: boolean | undefined },
): Promise<PresetResult<RmhboxPreset>> {
  const schema = schemaOf(input.minigameId);
  if (!schema) return fail('unknown-game');
  const values = normalizePresetValues(schema, input.values).values;

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `rmhbox-presets:${userId}`);
    const [total, inGame, same] = await Promise.all([
      tx.rmhboxSettingsPreset.count({ where: { userId } }),
      tx.rmhboxSettingsPreset.count({ where: { userId, minigameId: input.minigameId } }),
      tx.rmhboxSettingsPreset.findUnique({
        where: { userId_minigameId_name: { userId, minigameId: input.minigameId, name: input.name } },
        select: { id: true },
      }),
    ]);
    if (same) return fail('name-taken');
    if (inGame >= PRESETS_PER_GAME) return fail('game-limit');
    if (total >= PRESETS_TOTAL) return fail('total-limit');
    if (input.isDefault) {
      await tx.rmhboxSettingsPreset.updateMany({
        where: { userId, minigameId: input.minigameId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const row = await tx.rmhboxSettingsPreset.create({
      data: {
        userId,
        minigameId: input.minigameId,
        name: input.name,
        values: values as Prisma.InputJsonObject,
        isDefault: input.isDefault ?? false,
      },
      select,
    });
    return { ok: true as const, value: toPreset(row) };
  });
}

export async function updatePreset(
  userId: string,
  id: string,
  input: { name?: string | undefined; values?: Record<string, unknown> | undefined; isDefault?: boolean | undefined },
): Promise<PresetResult<RmhboxPreset>> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `rmhbox-presets:${userId}`);
    const current = await tx.rmhboxSettingsPreset.findFirst({
      where: { id, userId },
      select: { id: true, minigameId: true, name: true },
    });
    if (!current) return fail('not-found');

    const data: Prisma.RmhboxSettingsPresetUpdateInput = {};
    if (input.name !== undefined && input.name !== current.name) {
      const clash = await tx.rmhboxSettingsPreset.findUnique({
        where: { userId_minigameId_name: { userId, minigameId: current.minigameId, name: input.name } },
        select: { id: true },
      });
      if (clash) return fail('name-taken');
      data.name = input.name;
    }
    if (input.values !== undefined) {
      const schema = schemaOf(current.minigameId);
      if (!schema) return fail('unknown-game');
      data.values = normalizePresetValues(schema, input.values).values as Prisma.InputJsonObject;
    }
    if (input.isDefault !== undefined) {
      if (input.isDefault) {
        await tx.rmhboxSettingsPreset.updateMany({
          where: { userId, minigameId: current.minigameId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      data.isDefault = input.isDefault;
    }
    const row = await tx.rmhboxSettingsPreset.update({ where: { id }, data, select });
    return { ok: true as const, value: toPreset(row) };
  });
}

export async function deletePreset(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.rmhboxSettingsPreset.deleteMany({ where: { id, userId } });
  return count > 0;
}

/** The account export: the member's saved presets, values as stored. */
export async function exportRmhboxPresets(userId: string) {
  const rows = await prisma.rmhboxSettingsPreset.findMany({
    where: { userId },
    orderBy: [{ minigameId: 'asc' }, { name: 'asc' }],
    select: { minigameId: true, name: true, values: true, isDefault: true, createdAt: true, updatedAt: true },
  });
  return rows.map((r) => ({
    minigameId: r.minigameId,
    name: r.name,
    values: r.values as GameSettingValues,
    isDefault: r.isDefault,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
