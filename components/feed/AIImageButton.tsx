'use client';

import { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AIImageButtonProps {
  /** Current composer text — used to theme the generated image. */
  draft: string;
  /** Receives the generated image URL so the composer can append it. */
  onGenerated: (url: string) => void;
  /** Disable (e.g. when the image slots are full). */
  disabled?: boolean;
  title?: string;
}

/**
 * A wand button that asks xAI to generate an image for the post and hands the
 * resulting feed URL back to the composer. Starter+ only — the composer decides
 * whether to render it; the server re-checks the tier.
 */
export function AIImageButton({
  draft,
  onGenerated,
  disabled = false,
  title,
}: AIImageButtonProps) {
  const { t } = useTranslation('feed');
  const resolvedTitle = title ?? t('ai-image-generate', { defaultValue: 'Generate an image with AI' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading || disabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rmharks/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t('ai-image-failed', { defaultValue: 'Failed to generate image' }));
        return;
      }
      if (typeof data?.url === 'string' && data.url) {
        onGenerated(data.url);
      }
    } catch {
      setError(t('ai-image-failed', { defaultValue: 'Failed to generate image' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || disabled}
      title={error || resolvedTitle}
      aria-label={resolvedTitle}
      className={`p-1.5 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
        error
          ? 'text-site-danger hover:bg-site-danger/10'
          : 'text-site-text-dim hover:text-site-accent hover:bg-site-accent/10'
      }`}
    >
      {loading ? (
        <Loader2 className="w-4.5 h-4.5 animate-spin" />
      ) : (
        <Wand2 className="w-4.5 h-4.5" />
      )}
    </button>
  );
}
