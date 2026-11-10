/**
 * Contract for sending a voice note (redesign audit C1, batch 10). Multipart: `audio` (Opus in
 * WebM / Ogg, or MP4 / AAC from Safari), `durationMs`, `peaks` (a JSON array) and an optional
 * `note`. The server names the caller's own ceiling in a 400's `error`, so show that text.
 * Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface SentVoiceMessage {
  id: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
  audioUrl: string | null;
  audioDurationMs: number | null;
  audioPeaks: number[];
}

export const sendVoiceMessageApi = endpoint<{
  body: FormData;
  res: { message: SentVoiceMessage };
}>()({ method: 'POST', path: '/api/messages/$conversationId/voice' });
