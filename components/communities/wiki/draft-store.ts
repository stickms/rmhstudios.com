/**
 * An unsaved wiki edit, kept in sessionStorage per page so a reload does not lose it (s09-04).
 * Every read and write is wrapped: storage can be blocked or full, and the editor works without it.
 */
import type { DocDraft } from '@/components/communities/DocEditor';
import { readJson, removeKey, writeJson } from '@/lib/core/persist';

const draftKey = (pageId: string) => `rmh-wiki-draft:${pageId}`;

function asDraft(value: unknown): DocDraft | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Partial<DocDraft>;
  if (typeof v.title !== 'string' || typeof v.body !== 'string') return undefined;
  return { title: v.title, body: v.body, summary: typeof v.summary === 'string' ? v.summary : '' };
}

export function readDraft(pageId: string): DocDraft | null {
  return readJson<DocDraft | null>(draftKey(pageId), null, { storage: 'session', validate: asDraft });
}

export function writeDraft(pageId: string, draft: DocDraft): void {
  // storage unavailable: the edit just is not kept across a reload
  writeJson(draftKey(pageId), draft, { storage: 'session' });
}

export function clearDraft(pageId: string): void {
  removeKey(draftKey(pageId), { storage: 'session' });
}
