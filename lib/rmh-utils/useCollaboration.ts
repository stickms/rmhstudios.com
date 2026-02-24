'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { getCollabColor } from './types';

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL || 'ws://localhost:7002';

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: unknown;
}

interface UseCollaborationOptions {
  documentId: string;
  roomPrefix: string; // 'doc' | 'sheet' | 'slide'
  user: { id: string; name: string | null; image: string | null };
  sessionToken: string;
}

export function useCollaboration({ documentId, roomPrefix, user, sessionToken }: UseCollaborationOptions) {
  const [connected, setConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<CollabUser[]>([]);
  const yDocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  const getOrCreateDoc = useCallback(() => {
    if (!yDocRef.current) {
      yDocRef.current = new Y.Doc();
    }
    return yDocRef.current;
  }, []);

  useEffect(() => {
    // Don't connect until we have a session token
    if (!sessionToken) return;

    const yDoc = getOrCreateDoc();
    const roomName = `${roomPrefix}-${documentId}`;

    const provider = new WebsocketProvider(COLLAB_URL, roomName, yDoc, {
      params: { token: sessionToken },
    });
    providerRef.current = provider;

    // Set local awareness state
    const userIndex = Math.abs(hashCode(user.id)) % 15;
    provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name || 'Anonymous',
      color: getCollabColor(userIndex),
    });

    provider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    // Track collaborators via awareness
    const updateCollaborators = () => {
      const states = provider.awareness.getStates();
      const users: CollabUser[] = [];
      states.forEach((state, clientId) => {
        if (clientId === yDoc.clientID) return;
        if (state.user) {
          users.push(state.user as CollabUser);
        }
      });
      setCollaborators(users);
    };

    provider.awareness.on('change', updateCollaborators);
    updateCollaborators();

    return () => {
      provider.awareness.off('change', updateCollaborators);
      provider.disconnect();
      provider.destroy();
      providerRef.current = null;
      setConnected(false);
    };
  }, [documentId, roomPrefix, user.id, user.name, sessionToken, getOrCreateDoc]);

  return {
    yDoc: getOrCreateDoc(),
    provider: providerRef.current,
    connected,
    collaborators,
  };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
