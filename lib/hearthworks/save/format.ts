import { z } from 'zod';
import { BUILDING_IDS, CROP_IDS, ITEM_IDS } from '../content';
import { DEFAULT_SKIN, SKIN_IDS } from '../skins';
import { citySchema, migrateToCity } from './city-schema';
import { officerSchema, playerCrimeFields } from './crime-schema';
import { MAX_LEVEL, MAX_WORLD_SIZE, MIN_WORLD_SIZE, createCity, type World } from '../world';

/** 'HWLD' + a version byte, then the world as UTF-8 JSON. */
const MAGIC = [0x48, 0x57, 0x4c, 0x44] as const;
/** 2 added the city layer (roads, zones, utilities, milestones). Version 1 saves still load, with an empty town. */
export const SAVE_VERSION = 2;
const OLDEST_SAVE_VERSION = 1;
const MAX_SAVE_BYTES = 8 * 1024 * 1024;

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

const int = z.number().int();
const rot = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

/** The walking state shared by customers and farmhands; older saves (before they walked) have only x and z. */
const moverShape = {
  x: z.number().finite(),
  z: z.number().finite(),
  fromX: int.optional(),
  fromZ: int.optional(),
  path: z
    .array(z.object({ x: int, z: int, kind: z.enum(['walk', 'jump', 'fall']) }))
    .max(2048)
    .default([]),
  leg: int.nonnegative().default(0),
  goalX: int.nullable().default(null),
  goalZ: int.nullable().default(null),
  stopWithin: int.nonnegative().default(0),
  yaw: z.number().finite().default(0),
};

function withMoverDefaults<T extends { x: number; z: number; fromX?: number; fromZ?: number }>(
  a: T,
): T & { fromX: number; fromZ: number } {
  return { ...a, fromX: a.fromX ?? Math.round(a.x), fromZ: a.fromZ ?? Math.round(a.z) };
}

const worldSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
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
    crops: z.array(z.object({ id: int, kind: z.enum(CROP_IDS), x: int, z: int, plantedTick: int })),
    // The economy layer (older saves have none of it).
    foraged: z.record(z.string(), int).default({}),
    npcs: z
      .array(
        z
          .object({
            id: int,
            kind: z.literal('customer'),
            ...moverShape,
            want: z.enum(ITEM_IDS),
            qty: int.min(1).max(99),
            patience: int,
            look: z.enum(SKIN_IDS),
            // Customers saved before they walked have none of these: they stand where they were, and head home from there.
            mode: z.enum(['arriving', 'waiting', 'leaving']).default('waiting'),
            stallId: int.default(0),
            serviceX: int.optional(),
            serviceZ: int.optional(),
            gateX: int.optional(),
            gateZ: int.optional(),
            stuck: int.default(0),
          })
          .transform((n) => {
            const m = withMoverDefaults(n);
            const tx = Math.round(n.x);
            const tz = Math.round(n.z);
            return {
              ...m,
              serviceX: n.serviceX ?? tx,
              serviceZ: n.serviceZ ?? tz,
              gateX: n.gateX ?? tx,
              gateZ: n.gateZ ?? tz,
            };
          }),
      )
      .default([]),
    workers: z
      .array(
        z
          .object({
            id: int,
            ownerId: z.string().min(1).max(64),
            role: z.literal('farmer'),
            homeX: int,
            homeZ: int,
            ...moverShape,
            lastCrop: z.enum(CROP_IDS).nullable(),
            nextActTick: int,
            nextWageTick: int,
            state: z.enum(['home', 'toWork', 'working', 'toHome']).default('home'),
            task: z
              .object({ kind: z.enum(['harvest', 'plant']), x: int, z: int })
              .nullable()
              .default(null),
            workLeft: int.default(0),
            stuck: int.default(0),
            avoid: z
              .array(z.object({ x: int, z: int, until: int }))
              .max(32)
              .default([]),
          })
          .transform(withMoverDefaults),
      )
      .default([]),
    officers: z.array(officerSchema).max(16).default([]),
    // The city layer (saves before version 2 have none: they get an empty town, and any road buildings become road tiles).
    city: citySchema.optional(),
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
        ...playerCrimeFields,
      }),
    ),
  })
  .refine((w) => w.terrain.length === w.size * w.size && w.height.length === w.terrain.length, {
    message: 'terrain size mismatch',
  })
  .transform((w) => ({ ...w, version: 2 as const, city: w.city ?? createCity(w.size) }))
  .refine((w) => w.city.cells.length === w.terrain.length && w.city.flags.length === w.terrain.length, {
    message: 'city size mismatch',
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
  if (version < OLDEST_SAVE_VERSION || version > SAVE_VERSION)
    throw new SaveFormatError(`unsupported save version ${version}`);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC.length + 1)));
  } catch {
    throw new SaveFormatError('save data is corrupted');
  }
  const parsed = worldSchema.safeParse(migrateToCity(json));
  if (!parsed.success) throw new SaveFormatError('save data is invalid');
  return parsed.data as World;
}
