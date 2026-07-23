'use client';

import { useState } from'react';
import { Sparkles, Loader2 } from'lucide-react';
import { toast } from'sonner';
import { useTranslation } from'react-i18next';

type Action ='improve'|'shorten'|'expand'|'fix'|'casual'|'formal';
const ACTIONS: Action[] = ['improve','fix','shorten','expand','casual','formal'];

/** AI compose-assist chips that rewrite the current draft in place. */
export function ComposeAssist({ value, onChange }: { value: string; onChange: (v: string) => void }) {
 const { t } = useTranslation('feed');
 const [busy, setBusy] = useState<Action | null>(null);

 if (value.trim().length < 3) return null;

 const ACTION_LABELS: Record<Action, string> = {
 improve: t('action-improve', { defaultValue:'Improve'}),
 fix: t('action-fix-grammar', { defaultValue:'Fix grammar'}),
 shorten: t('action-shorten', { defaultValue:'Shorten'}),
 expand: t('action-expand', { defaultValue:'Expand'}),
 casual: t('action-casual', { defaultValue:'Casual'}),
 formal: t('action-formal', { defaultValue:'Formal'}),
 };

 const run = async (action: Action) => {
 setBusy(action);
 try {
 const res = await fetch('/api/ai/transform', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 credentials:'include',
 body: JSON.stringify({ text: value, action }),
 });
 if (res.status === 503) {
 toast.error(t('ai-unavailable', { defaultValue:'AI assist is unavailable right now.'}));
 return;
 }
 const data = await res.json().catch(() => ({}));
 if (res.ok && data.text) onChange(data.text);
 else toast.error(data.error || t('could-not-rewrite', { defaultValue:'Could not rewrite'}));
 } catch {
 toast.error(t('could-not-rewrite', { defaultValue:'Could not rewrite'}));
 } finally {
 setBusy(null);
 }
 };

 return (
 <div className="mt-2 flex flex-wrap items-center gap-1.5"role="group"aria-label={t('ai-writing-assist', { defaultValue:'AI writing assist'})}>
 <span className="flex items-center gap-1 text-xs text-site-text-dim">
 <Sparkles className="h-3.5 w-3.5 text-site-accent"/> AI
 </span>
 {ACTIONS.map((id) => (
 <button
 key={id}
 type="button"
 disabled={busy !== null}
 onClick={() => run(id)}
 className="inline-flex items-center gap-1 rounded-full border border-site-border px-2.5 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text disabled:opacity-50"
 >
 {busy === id ? <Loader2 className="h-3 w-3 animate-spin"/> : null}
 {ACTION_LABELS[id]}
 </button>
 ))}
 </div>
 );
}
