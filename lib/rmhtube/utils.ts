/**
 * RmhTube — Shared Utility Functions
 */

import { customAlphabet } from 'nanoid';
import { ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from './constants';
import type { MediaType } from './types';

const generateCode = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

/**
 * Sanitize a raw string input by trimming, stripping HTML chars,
 * and truncating to maxLength.
 */
export function sanitizeString(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/[<>&"']/g, '')
    .slice(0, maxLength);
}

/**
 * Generate a 6-character room code.
 */
export function generateRoomCode(): string {
  return generateCode();
}

/**
 * Detect the media type from a URL.
 * Returns null if the URL is not a supported media source.
 */
export function detectMediaType(url: string): MediaType | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    // YouTube
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
      return 'youtube';
    }

    // Twitch
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
      return 'twitch';
    }

    // Direct video files
    if (/\.(mp4|webm|ogg|m3u8|mpd)(\?|$)/i.test(parsed.pathname)) {
      return 'direct';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Format seconds into mm:ss or h:mm:ss.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Extract a YouTube video ID from a URL.
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.slice(1) || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return parsed.searchParams.get('v') || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a YouTube thumbnail URL from a video ID.
 */
export function youtubeThumbUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * Format a timestamp as a relative time string.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Format seconds into a human-readable total duration string.
 */
export function formatTotalDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '< 1m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
