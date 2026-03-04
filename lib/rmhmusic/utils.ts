import { customAlphabet } from 'nanoid';
import { ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from './constants';

const generateCode = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

export function generateRoomCode(): string {
  return generateCode();
}

export function sanitizeString(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/[<>&"']/g, '').slice(0, maxLength);
}

export function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
