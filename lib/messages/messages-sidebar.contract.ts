/** Contracts for the DM sidebar and unread counter (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export interface MessagesSidebarUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

export const messagesSidebarApi = endpoint<{
  res: { recent: MessagesSidebarUser[]; suggested: MessagesSidebarUser[] };
}>()({ method: 'GET', path: '/api/messages/sidebar' });

export const unreadCountApi = endpoint<{ res: { count: number } }>()({
  method: 'GET',
  path: '/api/messages/unread-count',
});
