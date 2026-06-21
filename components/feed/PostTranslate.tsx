'use client';

import { useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';

/** Detect a friendly target-language name from the browser locale. */
function browserLanguage(): string {
  const map: Record<string, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
    it: 'Italian', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
    ru: 'Russian', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', pl: 'Polish',
  };
  if (typeof navigator === 'undefined') return 'English';
  const code = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return map[code] ?? 'English';
}

/** "Translate" affordance shown under a post's content. */
export function PostTranslate({ postId }: { postId: string }) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (translated) {
      setShowing((s) => !s);
      return;
    }
    setLoading(true);
    try {
      const to = browserLanguage();
      const res = await fetch(`/api/rmharks/${postId}/translate?to=${encodeURIComponent(to)}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.text) {
        setTranslated(data.text);
        setShowing(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); run(); }}
        className="inline-flex items-center gap-1 text-xs text-site-text-dim hover:text-site-accent transition-colors"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
        {translated ? (showing ? 'Show original' : 'Show translation') : 'Translate'}
      </button>
      {showing && translated && (
        <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-site-surface/50 p-2 text-[15px] text-site-text">
          {translated}
        </p>
      )}
    </div>
  );
}
