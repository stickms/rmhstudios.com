'use client';

import { useQuery } from '@tanstack/react-query';

export interface ChatFolder {
  id: string;
  name: string;
  position: number;
  scopeKeys: string[];
}

export const CHAT_FOLDERS_KEY = ['chat-folders'] as const;

export function useChatFolders(enabled = true) {
  return useQuery({
    queryKey: CHAT_FOLDERS_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ChatFolder[]> => {
      const res = await fetch('/api/chat-folders', { credentials: 'include' });
      if (!res.ok) throw new Error('folders failed');
      return (await res.json()).folders;
    },
  });
}
