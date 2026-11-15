import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { transformTextApi } from '@/lib/feed/compose-assist.contract';
/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useState } from'react';
import { Sparkles, Loader2 } from'lucide-react';
import { toast } from '@/lib/toast';
import { useTranslation } from'react-i18next';

export type AssistAction ='improve'|'shorten'|'expand'|'fix'|'casual'|'formal';
export const ASSIST_ACTIONS: AssistAction[] = ['improve','fix','shorten','expand','casual','formal'];
/** Below this there is nothing to rewrite. */
export const ASSIST_MIN_CHARS = 3;

/**
 * The AI rewrites of the current draft: the labels, which one is running, and the call that replaces the draft with
 * the result. Shared by the chips under the boxed composer and the AI menu of the home composer.
 */
export function useComposeAssist(value: string, onChange: (v: string) => void) {
 const { t } = useTranslation('feed');
 const [busy, setBusy] = useState<AssistAction | null>(null);

 const labels: Record<AssistAction, string> = {
 improve: t('action-improve', { defaultValue:'Improve'}),
 fix: t('action-fix-grammar', { defaultValue:'Fix grammar'}),
 shorten: t('action-shorten', { defaultValue:'Shorten'}),
 expand: t('action-expand', { defaultValue:'Expand'}),
 casual: t('action-casual', { defaultValue:'Casual'}),
 formal: t('action-formal', { defaultValue:'Formal'}),
 };

 const run = async (action: AssistAction) => {
 setBusy(action);
 try {
 const data = await api(transformTextApi, { body: { text: value, action }, timeoutMs: AI_TIMEOUT_MS });
 if (data.text) onChange(data.text);
 else toast.error(t('could-not-rewrite', { defaultValue:'Could not rewrite'}));
 } catch (e) {
 if (e instanceof HttpError && e.status === 503) {
 toast.error(t('ai-unavailable', { defaultValue:'AI assist is unavailable right now.'}));
 } else {
 toast.error(serverError(e) || t('could-not-rewrite', { defaultValue:'Could not rewrite'}));
 }
 } finally {
 setBusy(null);
 }
 };

 return { busy, run, labels, available: value.trim().length >= ASSIST_MIN_CHARS };
}

/** AI compose-assist chips that rewrite the current draft in place. */
export function ComposeAssist({ value, onChange }: { value: string; onChange: (v: string) => void }) {
 const { t } = useTranslation('feed');
 const { busy, run, labels, available } = useComposeAssist(value, onChange);

 if (!available) return null;

 return (
 <div className="mt-2 flex flex-wrap items-center gap-2"role="group"aria-label={t('ai-writing-assist', { defaultValue:'AI writing assist'})}>
 <span className="flex items-center gap-1 text-xs text-site-text-muted">
 <Sparkles className="h-3.5 w-3.5 text-site-accent"/> AI
 </span>
 {ASSIST_ACTIONS.map((id) => (
 <button
 key={id}
 type="button"
 disabled={busy !== null}
 onClick={() => run(id)}
 className="inline-flex items-center gap-1 rounded-full border border-site-border px-3 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text disabled:opacity-50"
 >
 {busy === id ? <Loader2 className="h-3 w-3 animate-spin"/> : null}
 {labels[id]}
 </button>
 ))}
 </div>
 );
}
