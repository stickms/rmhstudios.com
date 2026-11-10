/** Contracts for the targeted-notice banner (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export interface NoticeView {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
}

/** The newest undismissed notice this member matches. */
export const getActiveNoticeApi = endpoint<{
  query: { locale?: string };
  res: { notice: NoticeView | null };
}>()({ method: 'GET', path: '/api/notices/active' });

/** 404 `{ error: 'Not found' }` for a notice that is not theirs. */
export const dismissNoticeApi = endpoint<{
  body: { id: string };
  res: { ok: true };
}>()({ method: 'POST', path: '/api/notices/dismiss' });
