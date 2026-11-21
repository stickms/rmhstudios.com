/**
 * The shape of a Studio project that may be stored on an account (zod).
 *
 * A project saved to the account is opened by the same member on another device, so a crafted upload must not be
 * able to crash that editor: every array is capped and every number sits inside a range the editor already works in.
 * Unknown keys are dropped, not stored. Client-safe: the contract (`projects.contract.ts`) takes its types from here
 * with `import type`, so no zod ships to the browser.
 */
import { z } from 'zod';
import { MAX_BPM, MIN_BPM } from '@/lib/studio/constants';

/** At most this many cloud projects per member. */
export const MAX_CLOUD_PROJECTS = 25;
/** At most this many bytes of project JSON per cloud project (1 MB). */
export const MAX_PROJECT_BYTES = 1_048_576;
/** Headroom on the raw request body for the envelope around `data` (name, id, revision). */
export const MAX_REQUEST_BYTES = MAX_PROJECT_BYTES + 4096;
export const MAX_PROJECT_NAME = 80;

const MAX_TRACKS = 256;
const MAX_CLIPS = 20_000;
const MAX_PATTERNS = 256;
const MAX_BEAT = 1_000_000;

const id = z.string().min(1).max(128);
const shortText = z.string().max(200);
const beats = z.number().min(0).max(MAX_BEAT);
const unit = z.number().min(0).max(1);

/** A project id as the client mints it (a UUID, or `jam-<code>` for a jam session). */
export const projectIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** A project's display name: trimmed, 1–80 characters. */
export const projectNameSchema = z.string().trim().min(1).max(MAX_PROJECT_NAME);

const pluginInstance = z.object({
  id,
  pluginId: id,
  type: z.enum(['instrument', 'effect']),
  params: z.record(z.string().max(128), z.number().min(-1e9).max(1e9)),
  preset: z.string().max(128).nullable(),
  bypassed: z.boolean(),
});

const track = z.object({
  id,
  name: shortText,
  type: z.enum(['audio', 'midi', 'automation']),
  color: z.string().max(40),
  volume: z.number().min(0).max(4),
  pan: z.number().min(-1).max(1),
  muted: z.boolean(),
  soloed: z.boolean(),
  armed: z.boolean(),
  clipIds: z.array(id).max(MAX_CLIPS),
  pluginChain: z.array(pluginInstance).max(32),
  sends: z.array(z.object({ busId: id, level: unit })).max(32),
  height: z.number().min(20).max(400),
});

const clipBase = {
  id,
  trackId: id,
  name: shortText,
  startBeat: beats,
  durationBeats: beats,
  color: z.string().max(40),
};

export const midiNoteSchema = z.object({
  id,
  pitch: z.number().int().min(0).max(127),
  startBeat: z.number().min(-MAX_BEAT).max(MAX_BEAT),
  durationBeats: beats,
  velocity: z.number().min(0).max(127),
});

export const clipSchema = z.discriminatedUnion('type', [
  z.object({
    ...clipBase,
    type: z.literal('audio'),
    // '' is a clip with no sample yet.
    bufferId: z.string().max(128),
    sampleOffset: beats,
    fadeInBeats: beats,
    fadeOutBeats: beats,
  }),
  z.object({ ...clipBase, type: z.literal('midi'), notes: z.array(midiNoteSchema).max(50_000) }),
  z.object({
    ...clipBase,
    type: z.literal('automation'),
    automationParam: z.string().max(128),
    breakpoints: z
      .array(
        z.object({
          beat: beats,
          value: unit,
          curve: z.enum(['linear', 'exponential', 'step']),
        }),
      )
      .max(20_000),
  }),
  z.object({ ...clipBase, type: z.literal('pattern'), patternId: id }),
]);

const pattern = z.object({
  id,
  name: shortText,
  lengthBeats: z.number().min(0).max(4096),
  stepsPerBeat: z.number().int().min(1).max(64),
  tracks: z
    .array(
      z.object({
        instrumentId: id,
        steps: z
          .array(
            z.object({
              active: z.boolean(),
              velocity: z.number().min(0).max(127),
              pitch: z.number().int().min(0).max(127).optional(),
            }),
          )
          .max(4096),
      }),
    )
    .max(64),
});

export const studioProjectSchema = z.object({
  id: projectIdSchema,
  name: projectNameSchema,
  bpm: z.number().min(MIN_BPM).max(MAX_BPM),
  timeSignature: z.tuple([z.number().int().min(1).max(64), z.number().int().min(1).max(64)]),
  tracks: z.array(track).max(MAX_TRACKS),
  clips: z
    .record(z.string().max(128), clipSchema)
    .refine((c) => Object.keys(c).length <= MAX_CLIPS, { message: 'Too many clips' }),
  patterns: z.array(pattern).max(MAX_PATTERNS),
  masterVolume: z.number().min(0).max(4),
  createdAt: z.number().min(0),
  updatedAt: z.number().min(0),
});

/** POST /api/studio/projects: first upload of a project; `data.id` must be `id`. */
export const createProjectBody = z
  .object({
    id: projectIdSchema,
    name: projectNameSchema,
    data: studioProjectSchema,
  })
  .refine((b) => b.data.id === b.id, { message: 'Project id mismatch' });

/** PUT /api/studio/projects/:id: replace the project, naming the revision this edit started from. */
export const updateProjectBody = z.object({
  name: projectNameSchema,
  data: studioProjectSchema,
  baseRevision: z.number().int().min(1).max(2_000_000_000),
});
