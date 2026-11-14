/**
 * The group chat's wire types (redesign audit C1, batch 9): what
 * `GET /api/group-chats/$id` and the send route answer, shared by the contracts
 * (`group-chat.contract.ts`) and the thread UI.
 */
import type { ReactionRow } from '@/lib/social/reactions';

export interface Sender {
  id: string;
  name:
    | string
    | null;
  handle:
    | string
    | null;
  image:
    | string
    | null;
}

export interface Poll {
  question: string;
  options: {
    text: string;
    votes: number;
  }[];
  totalVotes: number;
  myVote:
    | number
    | null;
}

export interface Msg {
  id: string;
  content: string;
  createdAt: string;
  sender: Sender;
  gifUrl?:
    | string
    | null;
  imageUrls?: string[];
  poll?: Poll | null;
  reactions?: ReactionRow[];
  /** P04 — message kind (text when absent), structured payload, forward hops, thread replies, expiry. */
  kind?: string;
  meta?: unknown;
  forwardCount?: number;
  replyCount?: number;
  expiresAt?:
    | string
    | null;
}

export interface Group {
  id: string;
  name: string;
  isOwner: boolean;
  members: Sender[];
  messages: Msg[];
}
