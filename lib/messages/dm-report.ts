/**
 * Reporting a message (s13-17): the client-safe half. No Prisma, no `.server` imports.
 */
import { isLineKind } from '@/lib/chat-plus/types';

/** A message other members may report: another member's, not unsent, not a system or tip line. */
export function canReportMessage(
  message: { senderId: string; deletedAt?: string | null | undefined; kind?: string | null | undefined },
  viewerId: string,
): boolean {
  return message.senderId !== viewerId && !message.deletedAt && !isLineKind(message.kind);
}

/** What a message said before an edit replaced it. */
export interface DmPriorVersion {
  content: string;
  /** When this text was replaced (ISO 8601). */
  replacedAt: string;
}

/**
 * The moderator's view of one reported message: its text now, its time, whether it was edited, its earlier versions
 * (newest first, at most 10) and the kind of conversation. Never the conversation around it; an attachment is only
 * a mark and its description.
 */
export interface DmReportView {
  conversation: 'direct' | 'group';
  /** When the message was sent (ISO 8601). */
  at: string;
  edited: boolean;
  /** Unsent by its sender or removed by a moderator. */
  removed: boolean;
  text: string;
  hasImage: boolean;
  imageAlts: string[];
  versions: DmPriorVersion[];
}

/** The one-line text the grouped queue shows for a reported message. */
export function dmPreviewLine(view: DmReportView): string {
  const at = view.at.slice(0, 16).replace('T', ' ');
  const where = view.conversation === 'group' ? 'Group message' : 'Direct message';
  const text = view.text.trim() || (view.hasImage ? '(image)' : '(no text)');
  return `${where} · ${at} UTC${view.edited ? ' (edited)' : ''}: ${text}`;
}
