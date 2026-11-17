/** Play view of the Vibes Activity: the vibe's frame, bridged to the room (`room.*`) and the KV store (`store.*`). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { VibeFrame } from '@/components/rmhvibe/VibeFrame';
import { VibeStyles } from '@/components/rmhvibe/VibeStyles';
import { useVibeBridge, type VibeBridgeHost } from '@/components/rmhvibe/useVibeBridge';
import { createVibeHostHandlers } from '@/components/rmhvibe/vibe-host-handlers';
import { BridgeError, type BridgeArgs } from '@/lib/rmhvibe/bridge';
import type { VibeRoomClient } from '@/lib/rmhvibe/room-socket';
import type { VibeRoomMember } from '@/lib/rmhvibe/room-events';
import { resolveTweakValues, type TweakSpec, type TweakValue } from '@/lib/rmhvibe/tweaks';

/** What `RMHVibe.room.members()` and the `room:members` event carry to the frame. */
function memberPayload(members: VibeRoomMember[], hostSid: string | null, selfSid: string | null) {
  return members.map((m) => ({
    name: m.name,
    avatarUrl: m.avatarUrl,
    away: m.away,
    host: m.sid === hostSid,
    self: m.sid === selfSid,
  }));
}

export function VibePlayer({
  slug,
  html,
  title,
  tweakSpec,
  tweakValues,
  client,
  members,
  hostSid,
  hidden,
  sandbox,
}: {
  slug: string;
  html: string;
  title: string;
  tweakSpec: TweakSpec[];
  tweakValues: Record<string, TweakValue>;
  client: VibeRoomClient;
  members: VibeRoomMember[];
  hostSid: string | null;
  /** Discord's picture-in-picture tile: the frame stays mounted but hidden. */
  hidden: boolean;
  sandbox: string;
}) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const handlers = useMemo(() => createVibeHostHandlers(slug), [slug]);
  const payload = useMemo(
    () => memberPayload(members, hostSid, client.selfSid()),
    [members, hostSid, client],
  );
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const host = useMemo<VibeBridgeHost>(
    () => ({
      kind: 'discord',
      handle: (op, args) => {
        if (op === 'room.send') {
          client.send((args as BridgeArgs['room.send']).data);
          return Promise.resolve(undefined);
        }
        if (op === 'room.members') return Promise.resolve(payloadRef.current);
        if (op.startsWith('store.')) return handlers.handle(op, args);
        return Promise.reject(new BridgeError('unavailable'));
      },
    }),
    [client, handlers],
  );
  const { post } = useVibeBridge(frame, host);
  const values = useMemo(() => resolveTweakValues(tweakSpec, tweakValues), [tweakSpec, tweakValues]);

  useEffect(() => {
    if (frame && tweakSpec.length) post('tweaks', values);
  }, [frame, tweakSpec, values, post]);

  useEffect(() => {
    if (frame) post('room:members', payload);
  }, [frame, payload, post]);

  useEffect(
    () => client.onMessage((m) => post('room:message', m.data)),
    [client, post],
  );

  useEffect(() => {
    if (frame) post('visibility', { hidden });
  }, [frame, hidden, post]);

  return (
    <div className="relative flex-1 min-h-0" style={{ visibility: hidden ? 'hidden' : 'visible' }}>
      <VibeStyles />
      <VibeFrame html={html} title={title} sandbox={sandbox} onFrame={setFrame} />
    </div>
  );
}
