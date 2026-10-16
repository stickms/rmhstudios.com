'use client';

/**
 * Studio live jam client (F13). Mirrors the shared project to the local Studio
 * store, and sends this member's edits as whole-track replacements.
 *
 * `mirror` holds, per track, the last state the server and this client agreed on.
 * A local change is "a track whose current state differs from its mirror". A track
 * is only sent while this member holds its lock; if the lock is taken the change is
 * rolled back to the mirror, so the room never diverges.
 */
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { useStudioStore } from '@/lib/studio/store';
import { saveProject } from '@/lib/studio/project-store';
import type { Clip, Pattern, Track } from '@/lib/studio/types';
import { useJamStore } from './store';
import {
  JAM_C2S,
  JAM_S2C,
  type JamJoinAck,
  type JamLocks,
  type JamOp,
  type JamPeer,
  type JamProject,
  type JamTrack,
} from './shared';

interface Mirrored {
  key: string;
  payload: JamTrack;
}

const FLUSH_MS = 150;
/** A track frees up this long after its editor's last change. */
const LOCK_IDLE_MS = 8_000;

let rt: RealtimeClient | null = null;
const mirror = new Map<string, Mirrored>();
const patternMirror = new Map<string, string>();
let metaKey = '';
const inflight = new Set<string>();
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
let unsubscribe: (() => void) | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let applying = false;

const jam = () => useJamStore.getState();
const studio = () => useStudioStore.getState();

// ─── Project <-> store ──────────────────────────────────────────────────────

/** Audio clips point at buffers that only exist in one browser, so audio tracks are not shared. */
function sharedTrack(track: Track, clips: Record<string, Clip>): JamTrack {
  return {
    track,
    clips: track.clipIds.map((id) => clips[id]).filter((c): c is Clip => !!c && c.type !== 'audio'),
  } as unknown as JamTrack;
}
const keyOf = (t: JamTrack) => JSON.stringify(t);

function localTracks(): JamTrack[] {
  const s = studio();
  return s.tracks.filter((t) => t.type !== 'audio').map((t) => sharedTrack(t, s.clips));
}

export function snapshotProject(): JamProject {
  const s = studio();
  return {
    name: s.projectName,
    bpm: s.bpm,
    timeSignature: s.timeSignature,
    masterVolume: s.masterVolume,
    tracks: localTracks(),
    patterns: s.patterns,
  } as unknown as JamProject;
}

function readMeta() {
  const s = studio();
  return JSON.stringify({ n: s.projectName, b: s.bpm, t: s.timeSignature, v: s.masterVolume });
}

/** Save the current local project into the member's Studio library (host snapshot, or guest backup before joining). */
export async function saveLocalProject(): Promise<void> {
  const s = studio();
  const now = Date.now();
  await saveProject({
    id: s.projectId ?? crypto.randomUUID(),
    name: s.projectName,
    bpm: s.bpm,
    timeSignature: s.timeSignature,
    tracks: s.tracks,
    clips: s.clips,
    patterns: s.patterns,
    masterVolume: s.masterVolume,
    createdAt: now,
    updatedAt: now,
  });
}

function resetMirror() {
  mirror.clear();
  patternMirror.clear();
  for (const p of studio().patterns) patternMirror.set(p.id, JSON.stringify(p));
  for (const t of localTracks()) mirror.set(t.track.id, { key: keyOf(t), payload: t });
  metaKey = readMeta();
}

function loadProjectIntoStore(project: JamProject, code: string) {
  const tracks: Track[] = [];
  const clips: Record<string, Clip> = {};
  for (const jt of project.tracks) {
    tracks.push(jt.track as unknown as Track);
    for (const c of jt.clips) clips[c.id as string] = c as unknown as Clip;
  }
  applying = true;
  studio().setProject(
    `jam-${code}`,
    project.name,
    tracks,
    clips,
    project.patterns as unknown as Pattern[],
    project.bpm,
    project.timeSignature,
    project.masterVolume,
  );
  applying = false;
}

function putTrackLocally(jt: JamTrack) {
  const s = studio();
  const id = jt.track.id as string;
  const existing = s.tracks.find((t) => t.id === id);
  const clips = { ...s.clips };
  for (const cid of existing?.clipIds ?? []) delete clips[cid];
  for (const c of jt.clips) clips[c.id as string] = c as unknown as Clip;
  const track = jt.track as unknown as Track;
  applying = true;
  useStudioStore.setState({
    tracks: existing ? s.tracks.map((t) => (t.id === id ? track : t)) : [...s.tracks, track],
    clips,
  });
  applying = false;
}

function removeTrackLocally(trackId: string) {
  const s = studio();
  const existing = s.tracks.find((t) => t.id === trackId);
  if (!existing) return;
  const clips = { ...s.clips };
  for (const cid of existing.clipIds) delete clips[cid];
  applying = true;
  useStudioStore.setState({
    tracks: s.tracks.filter((t) => t.id !== trackId),
    clips,
    selectedTrackId: s.selectedTrackId === trackId ? null : s.selectedTrackId,
  });
  applying = false;
}

// ─── Incoming ───────────────────────────────────────────────────────────────

function applyOp(op: JamOp) {
  if (op.type === 'track_set') {
    putTrackLocally({ track: op.track, clips: op.clips });
    const local = localTracks().find((t) => t.track.id === op.track.id);
    if (local) mirror.set(op.track.id as string, { key: keyOf(local), payload: local });
  } else if (op.type === 'track_remove') {
    removeTrackLocally(op.trackId);
    mirror.delete(op.trackId);
  } else if (op.type === 'pattern_set') {
    const s = studio();
    const p = op.pattern as unknown as Pattern;
    const patterns = s.patterns.some((x) => x.id === p.id)
      ? s.patterns.map((x) => (x.id === p.id ? p : x))
      : [...s.patterns, p];
    applying = true;
    useStudioStore.setState({ patterns });
    applying = false;
    patternMirror.set(p.id, JSON.stringify(studio().patterns.find((x) => x.id === p.id)));
  } else {
    const m = op.meta;
    applying = true;
    useStudioStore.setState({
      ...(m.name !== undefined ? { projectName: m.name } : {}),
      ...(m.bpm !== undefined ? { bpm: m.bpm } : {}),
      ...(m.timeSignature !== undefined ? { timeSignature: m.timeSignature } : {}),
      ...(m.masterVolume !== undefined ? { masterVolume: m.masterVolume } : {}),
    });
    applying = false;
    metaKey = readMeta();
  }
}

function bind(socket: Socket) {
  socket.on(JAM_S2C.OP, (op: JamOp) => applyOp(op));
  socket.on(JAM_S2C.PEERS, (peers: JamPeer[]) => jam().set({ peers }));
  socket.on(JAM_S2C.LOCKS, (locks: JamLocks) => jam().set({ locks }));
  socket.on(JAM_S2C.CLOSED, () => {
    toast.info('The jam ended because the host left. Your copy stays open.');
    stopSync();
  });
  socket.on('disconnect', () => {
    if (jam().status === 'live') {
      toast.error('Jam connection lost. Rejoin with the room code.');
      stopSync();
    }
  });
}

// ─── Outgoing ───────────────────────────────────────────────────────────────

type Ack = { ok: boolean; error?: string; holder?: string };

function call(event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    if (!rt) return resolve({ ok: false, error: 'Not connected' });
    rt.socket.timeout(8_000).emit(event, payload, (err: Error | null, res: Ack) => {
      resolve(err ? { ok: false, error: 'No response' } : res);
    });
  });
}

function scheduleRelease(trackId: string) {
  clearTimeout(idleTimers.get(trackId));
  idleTimers.set(
    trackId,
    setTimeout(() => {
      idleTimers.delete(trackId);
      if (jam().locks[trackId] === jam().myId) void call(JAM_C2S.UNLOCK, { trackId });
    }, LOCK_IDLE_MS),
  );
}

function rollback(trackId: string, reason: string) {
  const m = mirror.get(trackId);
  if (m) putTrackLocally(m.payload);
  else removeTrackLocally(trackId);
  jam().set({ notice: reason });
  toast.error(reason);
}

async function pushTrack(trackId: string, next: JamTrack | null) {
  if (inflight.has(trackId)) return;
  inflight.add(trackId);
  try {
    const known = mirror.has(trackId);
    if (known && jam().locks[trackId] !== jam().myId) {
      const lock = await call(JAM_C2S.LOCK, { trackId });
      if (!lock.ok) {
        return rollback(
          trackId,
          lock.holder ? `${lock.holder} is editing that track` : 'That track is locked',
        );
      }
    }
    const res = next
      ? await call(JAM_C2S.TRACK_SET, next)
      : await call(JAM_C2S.TRACK_REMOVE, { trackId });
    if (!res.ok) return rollback(trackId, res.error ?? 'Change rejected');
    if (next) mirror.set(trackId, { key: keyOf(next), payload: next });
    else mirror.delete(trackId);
    scheduleRelease(trackId);
  } finally {
    inflight.delete(trackId);
    // The track may have changed again while the request was in flight.
    scheduleFlush();
  }
}

function flush() {
  flushTimer = null;
  if (jam().status !== 'live' || applying) return;
  const seen = new Set<string>();
  for (const jt of localTracks()) {
    const id = jt.track.id as string;
    seen.add(id);
    if (mirror.get(id)?.key !== keyOf(jt)) void pushTrack(id, jt);
  }
  for (const id of mirror.keys()) if (!seen.has(id)) void pushTrack(id, null);

  for (const p of studio().patterns) {
    const key = JSON.stringify(p);
    if (patternMirror.get(p.id) === key) continue;
    patternMirror.set(p.id, key);
    void call(JAM_C2S.PATTERN_SET, { pattern: p });
  }

  const meta = readMeta();
  if (meta !== metaKey && jam().myId === jam().hostUserId) {
    metaKey = meta;
    const s = studio();
    void call(JAM_C2S.META, {
      name: s.projectName,
      bpm: s.bpm,
      timeSignature: s.timeSignature,
      masterVolume: s.masterVolume,
    });
  }
}

function scheduleFlush() {
  if (flushTimer || jam().status !== 'live') return;
  flushTimer = setTimeout(flush, FLUSH_MS);
}

function startSync() {
  resetMirror();
  let prev = { t: studio().tracks, c: studio().clips, p: studio().patterns, n: readMeta() };
  unsubscribe = useStudioStore.subscribe((s) => {
    // Playback ticks rewrite unrelated fields many times a second; only react to the shared ones.
    const n = readMeta();
    if (s.tracks === prev.t && s.clips === prev.c && s.patterns === prev.p && n === prev.n) return;
    prev = { t: s.tracks, c: s.clips, p: s.patterns, n };
    if (!applying) scheduleFlush();
  });
}

function stopSync() {
  unsubscribe?.();
  unsubscribe = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  for (const t of idleTimers.values()) clearTimeout(t);
  idleTimers.clear();
  inflight.clear();
  mirror.clear();
  patternMirror.clear();
  rt?.destroy();
  rt = null;
  jam().reset();
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function connect(): Promise<void> {
  const session = await authClient.getSession();
  const myId = session?.data?.user?.id;
  if (!myId) throw new Error('Sign in to jam');
  jam().set({ status: 'connecting', myId });
  rt = createRealtimeClient({
    name: 'StudioJam',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => ({ token: (await authClient.getSession())?.data?.session?.token }),
    bind,
  });
}

function enter(ack: Extract<JamJoinAck, { ok: true }>) {
  jam().set({
    status: 'live',
    code: ack.code,
    hostUserId: ack.hostUserId,
    peers: ack.peers,
    locks: ack.locks,
    notice: null,
  });
  startSync();
}

export async function startJam(): Promise<string> {
  if (jam().status !== 'off') throw new Error('Already in a jam');
  await connect();
  const ack = (await call(JAM_C2S.CREATE, { project: snapshotProject() })) as unknown as JamJoinAck;
  if (!ack.ok) {
    stopSync();
    throw new Error(ack.error);
  }
  enter(ack);
  return ack.code;
}

export async function joinJam(code: string): Promise<void> {
  if (jam().status !== 'off') throw new Error('Already in a jam');
  await connect();
  const ack = (await call(JAM_C2S.JOIN, {
    code: code.trim().toUpperCase(),
  })) as unknown as JamJoinAck;
  if (!ack.ok) {
    stopSync();
    throw new Error(ack.error);
  }
  // Joining replaces the open project, so keep a copy of the member's own work first.
  if (studio().tracks.length > 0) await saveLocalProject().catch(() => {});
  loadProjectIntoStore(ack.project, ack.code);
  enter(ack);
}

export function leaveJam(): void {
  rt?.socket.emit(JAM_C2S.LEAVE);
  stopSync();
}
