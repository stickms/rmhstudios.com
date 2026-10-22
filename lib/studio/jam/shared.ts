import { z } from 'zod';

/** Studio live jam (F13): 2–4 members edit one project; one editor per track. */
export const JAM_MAX_MEMBERS = 4;
export const JAM_MAX_TRACKS = 24;
export const JAM_MAX_CLIPS_PER_TRACK = 200;
export const JAM_MAX_PATTERNS = 40;
/** A whole-project payload (create) and a single-track payload (op), in JSON characters. */
export const JAM_MAX_PROJECT_CHARS = 600_000;
export const JAM_MAX_TRACK_CHARS = 120_000;

export const JAM_C2S = {
  CREATE: 'studio:jam:create',
  JOIN: 'studio:jam:join',
  LEAVE: 'studio:jam:leave',
  LOCK: 'studio:jam:lock',
  UNLOCK: 'studio:jam:unlock',
  TRACK_SET: 'studio:jam:track_set',
  TRACK_REMOVE: 'studio:jam:track_remove',
  PATTERN_SET: 'studio:jam:pattern_set',
  META: 'studio:jam:meta',
} as const;

export const JAM_S2C = {
  OP: 'studio:jam:op',
  PEERS: 'studio:jam:peers',
  LOCKS: 'studio:jam:locks',
  CLOSED: 'studio:jam:closed',
  RESYNC: 'studio:jam:resync',
} as const;

const id = z.string().min(1).max(64);
const obj = z.object({ id }).passthrough();

export const jamTrackSchema = z.object({
  track: z.object({ id }).passthrough(),
  clips: z.array(z.object({ id, trackId: id }).passthrough()).max(JAM_MAX_CLIPS_PER_TRACK),
});
export type JamTrack = z.infer<typeof jamTrackSchema>;

export const jamMetaSchema = z.object({
  name: z.string().max(120).optional(),
  bpm: z.number().min(20).max(400).optional(),
  timeSignature: z
    .tuple([z.number().int().min(1).max(32), z.number().int().min(1).max(32)])
    .optional(),
  masterVolume: z.number().min(0).max(2).optional(),
});

export const jamProjectSchema = z.object({
  name: z.string().max(120),
  bpm: z.number().min(20).max(400),
  timeSignature: z.tuple([z.number().int().min(1).max(32), z.number().int().min(1).max(32)]),
  masterVolume: z.number().min(0).max(2),
  tracks: z.array(jamTrackSchema).max(JAM_MAX_TRACKS),
  patterns: z.array(obj).max(JAM_MAX_PATTERNS),
});
export type JamProject = z.infer<typeof jamProjectSchema>;

export const jamCodeSchema = z.object({
  code: z
    .string()
    .min(4)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/),
});
export const jamCreateSchema = z.object({ project: jamProjectSchema });
export const jamTrackIdSchema = z.object({ trackId: id });
export const jamPatternSchema = z.object({ pattern: obj });

export type JamOp =
  | { type: 'track_set'; by: string; track: JamTrack['track']; clips: JamTrack['clips'] }
  | { type: 'track_remove'; by: string; trackId: string }
  | { type: 'pattern_set'; by: string; pattern: z.infer<typeof obj> }
  | { type: 'meta'; by: string; meta: z.infer<typeof jamMetaSchema> };

export interface JamPeer {
  userId: string;
  name: string;
  isHost: boolean;
}

export type JamLocks = Record<string, string>; // trackId → userId

export type JamJoinAck =
  | {
      ok: true;
      code: string;
      hostUserId: string;
      project: JamProject;
      peers: JamPeer[];
      locks: JamLocks;
    }
  | { ok: false; error: string };
