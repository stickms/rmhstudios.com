import { z } from 'zod';
import { BUILDING_IDS, CROP_IDS, ITEM_IDS } from '../content';
import { DEFAULT_SKIN, SKIN_IDS } from '../skins';
import { MAX_LEVEL, MAX_WORLD_SIZE, MIN_WORLD_SIZE, type World } from '../world';

/** 'HWLD' + a version byte, then the world as UTF-8 JSON. */
const MAGIC = [0x48, 0x57, 0x4c, 0x44] as const;
export const SAVE_VERSION = 1;
const MAX_SAVE_BYTES = 8 * 1024 * 1024;

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

const int = z.number().int();
const rot = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const worldSchema = z
  .object({
    version: z.literal(1),
    seed: int.nonnegative(),
    size: int.min(MIN_WORLD_SIZE).max(MAX_WORLD_SIZE),
    tick: int.nonnegative(),
    accMs: z.number().min(0).finite(),
    rng: int.nonnegative(),
    nextId: int.positive(),
    terrain: z.array(z.enum(['water', 'sand', 'grass', 'forest', 'rock'])),
    height: z.array(int.min(0).max(MAX_LEVEL)),
    buildings: z.array(
      z.object({
        id: int,
        kind: z.enum(BUILDING_IDS),
        x: int,
        z: int,
        rot,
        storage: z.partialRecord(z.enum(ITEM_IDS), int.nonnegative()).optional(),
      }),
    ),
    crops: z.array(
      z.object({ id: int, kind: z.enum(CROP_IDS), x: int, z: int, plantedTick: int }),
    ),
    // The economy layer (older saves have none of it).
    foraged: z.record(z.string(), int).default({}),
    npcs: z
      .array(
        z.object({
          id: int,
          kind: z.literal('customer'),
          x: z.number().finite(),
          z: z.number().finite(),
          want: z.enum(ITEM_IDS),
          qty: int.min(1).max(99),
          patience: int,
          look: z.enum(SKIN_IDS),
        }),
      )
      .default([]),
    workers: z
      .array(
        z.object({
          id: int,
          ownerId: z.string().min(1).max(64),
          role: z.literal('farmer'),
          homeX: int,
          homeZ: int,
          x: z.number().finite(),
          z: z.number().finite(),
          lastCrop: z.enum(CROP_IDS).nullable(),
          nextActTick: int,
          nextWageTick: int,
        }),
      )
      .default([]),
    players: z.record(
      z.string().min(1).max(64),
      z.object({
        id: z.string().min(1).max(64),
        x: z.number().finite(),
        z: z.number().finite(),
        money: int.nonnegative(),
        inventory: z.partialRecord(z.enum(ITEM_IDS), int.nonnegative()),
        // Saves from before skins existed carry neither field.
        skin: z.enum(SKIN_IDS).default(DEFAULT_SKIN),
        ownedSkins: z.array(z.enum(SKIN_IDS)).default([DEFAULT_SKIN]),
      }),
    ),
  })
  .refine((w) => w.terrain.length === w.size * w.size && w.height.length === w.terrain.length, {
    message: 'terrain size mismatch',
  });

export function encodeWorld(world: World): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(world));
  const out = new Uint8Array(MAGIC.length + 1 + body.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = SAVE_VERSION;
  out.set(body, MAGIC.length + 1);
  return out;
}

export function decodeWorld(bytes: Uint8Array): World {
  if (bytes.length > MAX_SAVE_BYTES) throw new SaveFormatError('save is too large');
  if (bytes.length < MAGIC.length + 2 || MAGIC.some((b, i) => bytes[i] !== b))
    throw new SaveFormatError('not a Hearthworks save');
  const version = bytes[MAGIC.length];
  if (version !== SAVE_VERSION) throw new SaveFormatError(`unsupported save version ${version}`);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC.length + 1)));
  } catch {
    throw new SaveFormatError('save data is corrupted');
  }
  const parsed = worldSchema.safeParse(json);
  if (!parsed.success) throw new SaveFormatError('save data is invalid');
  return parsed.data as World;
}
