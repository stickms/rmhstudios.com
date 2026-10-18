/**
 * Phone-as-controller relay (E3).
 *
 * A game screen opens a short-lived pairing (`controller:host` -> code); phones
 * join with the code (`controller:join`) and their d-pad/button events are
 * relayed to the host socket only. In-memory, no persistence: a pairing dies
 * with the host's socket or after the idle TTL. Anonymous sockets are allowed
 * (a phone on the couch is often not signed in).
 */

import type { Server, Socket } from 'socket.io';
import { randomInt } from 'node:crypto';
import { checkRateLimit } from '../rate-limit';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const MAX_PADS = 4;
const MAX_PAIRINGS = 5000;
const TTL_MS = 2 * 60 * 60 * 1000;
const BUTTONS = new Set(['up', 'down', 'left', 'right', 'a', 'b']);

interface Pairing {
  hostSocketId: string;
  pads: Map<string, number>; // controller socketId -> slot (0-based)
  lastActive: number;
}

const pairings = new Map<string, Pairing>();
const hostOf = new Map<string, string>(); // host socketId -> code
const padOf = new Map<string, string>(); // controller socketId -> code

const gc = setInterval(
  () => {
    const now = Date.now();
    for (const [code, p] of pairings) if (now - p.lastActive > TTL_MS) pairings.delete(code);
  },
  5 * 60 * 1000,
);
if (typeof gc === 'object' && 'unref' in gc) gc.unref();

const room = (code: string) => `controller:${code}`;

function newCode(): string {
  for (let i = 0; i < 20; i++) {
    const c = Array.from({ length: CODE_LEN }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!pairings.has(c)) return c;
  }
  return '';
}

function dropPad(io: Server, socket: Socket) {
  const code = padOf.get(socket.id);
  if (!code) return;
  padOf.delete(socket.id);
  const p = pairings.get(code);
  const slot = p?.pads.get(socket.id);
  if (!p || slot === undefined) return;
  p.pads.delete(socket.id);
  io.to(p.hostSocketId).emit('controller:left', { slot });
}

function closeHost(io: Server, socket: Socket) {
  const code = hostOf.get(socket.id);
  if (!code) return;
  hostOf.delete(socket.id);
  const p = pairings.get(code);
  pairings.delete(code);
  if (p) {
    for (const padId of p.pads.keys()) padOf.delete(padId);
    io.to(room(code)).emit('controller:closed');
    io.in(room(code)).socketsLeave(room(code));
  }
}

export function registerControllerHandlers(io: Server, socket: Socket): void {
  socket.on('controller:host', () => {
    if (!checkRateLimit(socket.id, 'controller:host')) return;
    closeHost(io, socket);
    if (pairings.size >= MAX_PAIRINGS) {
      socket.emit('controller:error', { code: 'BUSY' });
      return;
    }
    const code = newCode();
    if (!code) {
      socket.emit('controller:error', { code: 'BUSY' });
      return;
    }
    pairings.set(code, { hostSocketId: socket.id, pads: new Map(), lastActive: Date.now() });
    hostOf.set(socket.id, code);
    socket.join(room(code));
    socket.emit('controller:hosted', { code });
  });

  socket.on('controller:join', (payload: unknown) => {
    if (!checkRateLimit(socket.id, 'controller:join')) return;
    const code =
      typeof (payload as { code?: unknown })?.code === 'string'
        ? (payload as { code: string }).code.toUpperCase().slice(0, CODE_LEN)
        : '';
    const p = pairings.get(code);
    if (!p) {
      socket.emit('controller:error', { code: 'NOT_FOUND' });
      return;
    }
    dropPad(io, socket);
    let slot = p.pads.get(socket.id);
    if (slot === undefined) {
      const used = new Set(p.pads.values());
      slot = [0, 1, 2, 3].find((s) => !used.has(s));
      if (slot === undefined || p.pads.size >= MAX_PADS) {
        socket.emit('controller:error', { code: 'FULL' });
        return;
      }
      p.pads.set(socket.id, slot);
    }
    padOf.set(socket.id, code);
    p.lastActive = Date.now();
    socket.join(room(code));
    socket.emit('controller:joined', { slot });
    io.to(p.hostSocketId).emit('controller:connected', { slot });
  });

  socket.on('controller:input', (payload: unknown) => {
    if (!checkRateLimit(socket.id, 'controller:input')) return;
    const code = padOf.get(socket.id);
    const p = code ? pairings.get(code) : undefined;
    const slot = p?.pads.get(socket.id);
    if (!p || slot === undefined) return;
    const { b, down } = (payload ?? {}) as { b?: unknown; down?: unknown };
    if (typeof b !== 'string' || !BUTTONS.has(b) || typeof down !== 'boolean') return;
    p.lastActive = Date.now();
    io.to(p.hostSocketId).emit('controller:input', { slot, b, down });
  });

  socket.on('controller:leave', () => dropPad(io, socket));
}

export function handleControllerDisconnect(io: Server, socket: Socket): void {
  dropPad(io, socket);
  closeHost(io, socket);
}
