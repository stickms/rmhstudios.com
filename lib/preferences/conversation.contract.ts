/**
 * Contracts for /api/preferences/conversation (s07-05 uses it for a group's Notifications choice). Client-safe: the
 * types come from the server module by `import type`, so nothing server-side ships.
 */
import type {
  ConversationPrefInput,
  ConversationPrefView,
} from '@/lib/notify/conversation-prefs.server';
import { endpoint } from '@/lib/contract/endpoint';

export const getConversationPrefApi = endpoint<{
  query: { scopeKey: string };
  res: ConversationPrefView;
}>()({ method: 'GET', path: '/api/preferences/conversation' });

export const setConversationPrefApi = endpoint<{
  body: ConversationPrefInput;
  res: ConversationPrefView;
}>()({ method: 'PUT', path: '/api/preferences/conversation' });
