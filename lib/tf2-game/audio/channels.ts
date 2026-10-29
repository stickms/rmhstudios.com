/**
 * Sound channels (soundflags.h) and the engine's rules for them, plus the mixer's volume groups.
 *
 * The engine (snd_dma.cpp S_StartSound → SND_PickDynamicChannel / SND_PickStaticChannel):
 *  - CHAN_STATIC and CHAN_STREAM sounds, and every looping sound, take a static channel: they
 *    never replace anything and are never replaced by a new sound, only stopped.
 *  - A dynamic sound on any channel but CHAN_AUTO replaces whatever its entity is playing on the
 *    same channel ("always override sound from same entity"); CHAN_REPLACE (-1) matches every
 *    channel of the entity. CHAN_AUTO never replaces.
 *  - With every channel busy, the sound closest to finishing is reused, never one of the local
 *    player's for a sound from someone else ("don't let monster sounds override player sounds").
 *    The browser has no fixed channel table, so the mixer steals the quietest voice instead.
 *
 * Pure: no Web Audio here.
 */

export const CHAN_REPLACE = -1;
export const CHAN_AUTO = 0;
export const CHAN_WEAPON = 1;
export const CHAN_VOICE = 2;
export const CHAN_ITEM = 3;
export const CHAN_BODY = 4;
export const CHAN_STREAM = 5;
export const CHAN_STATIC = 6;
export const CHAN_VOICE2 = 7;
export const CHAN_VOICE_BASE = 8;
export const CHAN_USER_BASE = CHAN_VOICE_BASE + 128;

export const VOLUME_GROUPS = ['master', 'sfx', 'voice', 'music', 'ui'] as const;
export type VolumeGroup = (typeof VOLUME_GROUPS)[number];
/** The groups a sound can play in (master scales them all). */
export type SoundGroup = Exclude<VolumeGroup, 'master'>;

/** What the replacement rules need to know about a playing sound. */
export interface ChannelSlot {
  /** Entity the sound belongs to; null for a sound from a bare position (never replaced). */
  entity: number | null;
  channel: number;
  /** Looping sounds always hold a static channel. */
  looping: boolean;
}

/** Whether a sound on this channel takes a static channel (never replaces, never replaced). */
export function isStaticChannel(channel: number, looping = false): boolean {
  return looping || channel === CHAN_STATIC || channel === CHAN_STREAM;
}

/**
 * Whether starting `incoming` replaces (stops) the playing sound `existing` — the per-entity
 * channel rule of SND_PickDynamicChannel.
 */
export function replacesOnChannel(existing: ChannelSlot, incoming: ChannelSlot): boolean {
  if (incoming.entity === null || existing.entity !== incoming.entity) return false;
  if (incoming.channel === CHAN_AUTO) return false;
  if (isStaticChannel(incoming.channel, incoming.looping)) return false;
  if (isStaticChannel(existing.channel, existing.looping)) return false;
  return incoming.channel === CHAN_REPLACE || existing.channel === incoming.channel;
}

/** Whether a stop request (entity, channel) matches a playing sound (S_StopSound). */
export function stopMatches(slot: ChannelSlot, entity: number, channel: number): boolean {
  if (slot.entity !== entity) return false;
  return channel === CHAN_REPLACE || channel === CHAN_AUTO || slot.channel === channel;
}

export function isVoiceChannel(channel: number): boolean {
  return channel === CHAN_VOICE || channel === CHAN_VOICE2;
}

/**
 * The volume group of a sound: music by its folder (`sound/music/`), voice by channel or folder
 * (`vo/`), UI by folder (`sound/ui/`), everything else effects.
 */
export function soundGroupOf(channel: number, path: string | null): SoundGroup {
  const p = path ?? '';
  if (p.startsWith('sound/music/')) return 'music';
  if (isVoiceChannel(channel) || p.startsWith('sound/vo/') || p.includes('/vo/')) return 'voice';
  if (p.startsWith('sound/ui/')) return 'ui';
  return 'sfx';
}
