import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/contract/client';
import { listChatFoldersApi } from '@/lib/chat-plus/folders.contract';

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
      return (await api(listChatFoldersApi)).folders;
    },
  });
}
