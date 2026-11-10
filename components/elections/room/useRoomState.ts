import { readJson, writeJson } from '@/lib/core/persist';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultRoomConfig,
  sanitizeRoomConfig,
  type RoomConfig,
} from '@/lib/elections/room-config';
import type { RoomView } from '@/lib/elections/rooms';
import { api } from '@/lib/contract/client';
import { getElectionRoomApi, updateElectionRoomApi } from '@/lib/elections/elections.contract';
import { HttpError } from '@/lib/http';

export type RoomSource = { kind: 'solo' } | { kind: 'hosted'; code: string };

export interface RoomMeta {
  name: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'SOLO';
  mine: boolean;
  owner: RoomView['owner'];
}

const soloKey = (cycle: string) => `rmh-elections-room:solo:${cycle}`;

export function readSolo(cycle: string): RoomConfig {
  const raw = readJson<unknown>(soloKey(cycle), null);
  return raw ? sanitizeRoomConfig(raw) : defaultRoomConfig();
}

export function writeSolo(cycle: string, config: RoomConfig): void {
  writeJson(soloKey(cycle), config); // private mode: the room lasts for this visit only
}

/**
 * A room's shared screen. Solo: lives in this browser. Hosted: loaded from the server, kept current by the
 * host's pushes (`applyRemote`), and — for the host only — saved back (debounced) on every change.
 */
export function useRoomState(cycle: string, source: RoomSource) {
  const code = source.kind === 'hosted' ? source.code : null;
  const [config, setConfigState] = useState<RoomConfig>(defaultRoomConfig());
  const [meta, setMeta] = useState<RoomMeta | null>(
    source.kind === 'solo'
      ? { name: 'Solo room', visibility: 'SOLO', mine: true, owner: null }
      : null,
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    source.kind === 'solo' ? 'ready' : 'loading',
  );
  const save = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (source.kind === 'solo') {
      setConfigState(readSolo(cycle));
      setMeta({ name: 'Solo room', visibility: 'SOLO', mine: true, owner: null });
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    api(getElectionRoomApi, { params: { code: source.code }, retries: 0 })
      .then(({ room }) => {
        if (cancelled) return;
        setConfigState(sanitizeRoomConfig(room.config));
        setMeta({
          name: room.name,
          visibility: room.visibility,
          mine: room.mine,
          owner: room.owner,
        });
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(err instanceof HttpError && err.status === 404 ? 'not-found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [cycle, source.kind, code]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A config pushed by the host over the stream. */
  const applyRemote = useCallback((c: unknown) => setConfigState(sanitizeRoomConfig(c)), []);

  const canEdit = source.kind === 'solo' || Boolean(meta?.mine);

  const setConfig = useCallback(
    (next: RoomConfig) => {
      if (!canEdit) return;
      setConfigState(next);
      if (source.kind === 'solo') return writeSolo(cycle, next);
      // Host: keep the screen responsive, save at most once per half second.
      if (save.current) clearTimeout(save.current);
      save.current = setTimeout(() => {
        api(updateElectionRoomApi, {
          params: { code: source.code },
          body: { config: next },
        }).catch(() => undefined);
      }, 500);
    },
    [canEdit, cycle, source],
  );

  useEffect(
    () => () => {
      if (save.current) clearTimeout(save.current);
    },
    [],
  );

  return { config, setConfig, meta, status, canEdit, applyRemote };
}
