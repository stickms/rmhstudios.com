/**
 * Socket Server — Shared Utilities
 */

import { config } from './config';

export function sanitizeLobbyId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9-]/g, '').slice(0, config.MAX_LOBBY_ID_LENGTH) || 'default';
}

export function sanitizeUserName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Player';
  return raw.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, config.MAX_USER_NAME_LENGTH) || 'Player';
}

export function generateRoomCode(length = config.ROOM_CODE_LENGTH): string {
  const alphabet = config.ROOM_CODE_ALPHABET;
  let code = '';
  for (let i = 0; i < length; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function sanitizeString(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/[<>&"']/g, '').slice(0, maxLength);
}
