import {
  useEffect,
  useState,
} from 'react';
import type { ChatMessage } from '@/lib/elections/chat';

const KEEP_MESSAGES = 200;
const KEEP_REACTIONS = 60;

export interface ReactionBurst {
  id: string;
  emoji: string;
  /** Epoch ms the reaction was sent. */
  at: number;
  /** 0–100: where across the screen it floats up from (random, stable per burst). */
  x: number;
}

export type StreamStatus =
  | 'connecting'
  | 'live'
  | 'offline';

/**
 * One Server-Sent-Events connection to a chat channel (a watch room, or the election's main room):
 * messages (with history), reactions and — for hosted rooms — live config pushes from the host.
 * `onConfig` is held in a ref-free closure by the caller; it is invoked for every `config` event.
 */
export function useRoomStream(
  /** Pass null to stay disconnected (a parent already owns the stream). */
  cycle:
    | string
    | null,
  room:
    | string
    | null,
  onConfig?: (
    config: unknown,
  ) => void,
): {
  messages: ChatMessage[];
  reactions: ReactionBurst[];
  status: StreamStatus;
} {
  const [
    messages,
    setMessages,
  ] =
    useState<
      ChatMessage[]
    >(
      [],
    );
  const [
    reactions,
    setReactions,
  ] =
    useState<
      ReactionBurst[]
    >(
      [],
    );
  const [
    status,
    setStatus,
  ] =
    useState<StreamStatus>(
      'connecting',
    );

  useEffect(() => {
    if (
      cycle ===
      null
    )
      return;
    if (
      typeof EventSource ===
      'undefined'
    ) {
      setStatus(
        'offline',
      );
      return;
    }
    setMessages(
      [],
    );
    setReactions(
      [],
    );
    setStatus(
      'connecting',
    );
    const qs = `cycle=${encodeURIComponent(cycle)}${room ? `&room=${encodeURIComponent(room)}` : ''}`;
    const es =
      new EventSource(
        `/api/elections/chat/stream?${qs}`,
      );
    es.onopen =
      () =>
        setStatus(
          'live',
        );
    es.onerror =
      () =>
        setStatus(
          es.readyState ===
            EventSource.CLOSED
            ? 'offline'
            : 'connecting',
        );

    const parse =
      <
        T,
      >(
        e: Event,
      ): T | null => {
        try {
          return JSON.parse(
            (
              e as MessageEvent
            )
              .data,
          ) as T;
        } catch {
          return null; // a malformed frame is ignored, never thrown
        }
      };
    es.addEventListener(
      'history',
      (
        e,
      ) => {
        const h =
          parse<
            ChatMessage[]
          >(
            e,
          );
        if (
          h
        )
          setMessages(
            h,
          );
      },
    );
    es.addEventListener(
      'msg',
      (
        e,
      ) => {
        const m =
          parse<ChatMessage>(
            e,
          );
        if (
          m
        )
          setMessages(
            (
              cur,
            ) =>
              cur.some(
                (
                  x,
                ) =>
                  x.id ===
                  m.id,
              )
                ? cur
                : [
                    ...cur,
                    m,
                  ].slice(
                    -KEEP_MESSAGES,
                  ),
          );
      },
    );
    es.addEventListener(
      'del',
      (
        e,
      ) => {
        const d =
          parse<{
            id: string;
          }>(
            e,
          );
        if (
          d
        )
          setMessages(
            (
              cur,
            ) =>
              cur.filter(
                (
                  x,
                ) =>
                  x.id !==
                  d.id,
              ),
          );
      },
    );
    es.addEventListener(
      'react',
      (
        e,
      ) => {
        const r =
          parse<{
            emoji: string;
            at: number;
          }>(
            e,
          );
        if (
          !r
        )
          return;
        const burst: ReactionBurst =
          {
            id: `${r.at}-${Math.random().toString(36).slice(2, 7)}`,
            emoji:
              r.emoji,
            at: r.at,
            x:
              8 +
              Math.random() *
                84,
          };
        setReactions(
          (
            cur,
          ) =>
            [
              ...cur,
              burst,
            ].slice(
              -KEEP_REACTIONS,
            ),
        );
      },
    );
    es.addEventListener(
      'config',
      (
        e,
      ) => {
        const c =
          parse<unknown>(
            e,
          );
        if (
          c !==
            null &&
          onConfig
        )
          onConfig(
            c,
          );
      },
    );
    return () =>
      es.close();
    // `onConfig` is intentionally not a dependency: it is a callback, not a reason to reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cycle,
    room,
  ]);

  return {
    messages,
    reactions,
    status,
  };
}
