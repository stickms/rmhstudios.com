import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { aiGeneratePostApi } from '@/lib/feed/compose-assist.contract';
/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useState } from'react';
import { Sparkles, Loader2 } from'lucide-react';
import { useTranslation } from'react-i18next';

/**
 * Request shapes accepted by POST /api/rmharks/ai-generate.
 * `draft`carries whatever the user has already typed so the model builds on it.
 */
export type AIGenerateRequest =
 | { mode:'post'; draft?: string }
 | { mode:'reply'; rmharkId: string; parentId?: string; draft?: string }
 | { mode:'announcement-title'; title?: string; body?: string }
 | { mode:'announcement-body'; title?: string; body?: string };

interface AIGenerateButtonProps {
 request: AIGenerateRequest;
 /** Receives the generated draft so the caller can drop it into its textarea. */
 onGenerated: (text: string) => void;
 size?:'sm'|'md';
 title?: string;
 className?: string;
}

/**
 * Ask the model for a draft. `generate` hands the text to `onGenerated`, and resolves to the error message when the
 * request fails (also kept in `error`), or to null.
 */
export function useAiGenerate(request: AIGenerateRequest, onGenerated: (text: string) => void) {
 const { t } = useTranslation('feed');
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const generate = async (): Promise<string | null> => {
 if (loading) return null;
 setLoading(true);
 setError(null);
 try {
 const data = await api(aiGeneratePostApi, { body: request, timeoutMs: AI_TIMEOUT_MS });
 if (typeof data?.content ==='string'&& data.content.trim()) {
 onGenerated(data.content);
 }
 return null;
 } catch (e) {
 const message = serverError(e) || t('ai-generate-failed', { defaultValue:'Failed to generate'});
 setError(message);
 return message;
 } finally {
 setLoading(false);
 }
 };

 return { loading, error, generate };
}

/**
 * A sparkle button that asks DeepSeek to draft a post or reply and hands the
 * result back to the parent composer. Purely a drafting aid — the user still
 * reviews and submits the text themselves.
 */
export function AIGenerateButton({
 request,
 onGenerated,
 size ='md',
 title,
 className ='',
}: AIGenerateButtonProps) {
 const { t } = useTranslation('feed');
 const { loading, error, generate } = useAiGenerate(request, onGenerated);
 const resolvedTitle = title ?? t('ai-generate-button-title', { defaultValue:'Generate with AI'});
 const handleClick = () => void generate();

 const iconSize = size ==='sm'?'w-3.5 h-3.5':'w-4.5 h-4.5';
 const pad = size ==='sm'?'p-1':'p-1.5';

 return (
 <button
 type="button"
 onClick={handleClick}
 disabled={loading}
 title={error || resolvedTitle}
 aria-label={resolvedTitle}
 className={`${pad} rounded-full transition-colors disabled:opacity-60 ${
 error
 ?'text-site-danger hover:bg-site-danger/10'
 :'text-site-text-muted hover:text-site-accent hover:bg-site-accent/10'
 } ${className}`}
 >
 {loading ? (
 <Loader2 className={`${iconSize} animate-spin`} />
 ) : (
 <Sparkles className={iconSize} />
 )}
 </button>
 );
}
