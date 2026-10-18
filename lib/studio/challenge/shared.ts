import { z } from 'zod';

export const CHALLENGE_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const CHALLENGE_AUDIO_PREFIX = 'studio-challenge/';
export const MAX_ENTRIES_SHOWN = 100;

export type ChallengePhase = 'upcoming' | 'open' | 'voting' | 'finished';

export function phaseOf(
  c: { startsAt: Date; endsAt: Date; votingEndsAt: Date },
  now = new Date(),
): ChallengePhase {
  if (now < c.startsAt) return 'upcoming';
  if (now < c.endsAt) return 'open';
  if (now < c.votingEndsAt) return 'voting';
  return 'finished';
}

const iso = z.string().datetime();

export const createChallengeSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    brief: z.string().trim().max(1000).default(''),
    sampleKey: z.string().min(1).max(200),
    sampleName: z.string().trim().min(1).max(120),
    startsAt: iso,
    endsAt: iso,
    votingEndsAt: iso,
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'Submissions must close after they open',
  })
  .refine((v) => new Date(v.votingEndsAt) > new Date(v.endsAt), {
    message: 'Voting must end after submissions close',
  });

export const entrySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    linkUrl: z
      .string()
      .trim()
      .url()
      .max(500)
      .refine((u) => /^https:\/\//i.test(u), { message: 'Link must be https' })
      .optional(),
    audioKey: z.string().max(200).optional(),
  })
  .refine((v) => !!v.linkUrl || !!v.audioKey, { message: 'Add a link or an audio file' });

export const voteSchema = z.object({ entryId: z.string().min(1).max(40) });

export interface ChallengeEntryView {
  id: string;
  title: string;
  linkUrl: string | null;
  audioUrl: string | null;
  voteCount: number;
  isWinner: boolean;
  mine: boolean;
  author: { id: string; name: string | null; image: string | null; handle: string | null };
}

export interface ChallengeView {
  id: string;
  title: string;
  brief: string;
  sampleName: string;
  sampleUrl: string;
  startsAt: string;
  endsAt: string;
  votingEndsAt: string;
  phase: ChallengePhase;
  entryCount: number;
  winnerEntryId: string | null;
}

export interface ChallengeDetail extends ChallengeView {
  entries: ChallengeEntryView[];
  myEntryId: string | null;
  myVoteEntryId: string | null;
}

export const challengeAudioUrl = (key: string) =>
  `/api/studio/challenges/audio/${encodeURIComponent(key)}`;

/** Container sniff for the audio the challenge accepts (wav/mp3 on top of the profile-clip containers). */
export function sniffChallengeAudio(b: Uint8Array): { ext: string; type: string } | null {
  if (b.length < 12) return null;
  const ascii = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { ext: 'wav', type: 'audio/wav' };
  if (ascii(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0))
    return { ext: 'mp3', type: 'audio/mpeg' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', type: 'audio/ogg' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return { ext: 'webm', type: 'audio/webm' };
  if (ascii(4, 4) === 'ftyp') return { ext: 'm4a', type: 'audio/mp4' };
  return null;
}

export const AUDIO_TYPE_BY_EXT: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
};
