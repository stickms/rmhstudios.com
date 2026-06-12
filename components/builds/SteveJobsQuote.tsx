import { useMemo } from 'react';
import { getRandomSteveJobsQuote } from '@/data/steve-jobs-quotes';
import { Quote } from 'lucide-react';

export function SteveJobsQuote() {
  const quote = useMemo(() => getRandomSteveJobsQuote(), []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-site-border bg-gradient-to-br from-zinc-900/90 to-neutral-900/90 p-6 sm:p-8 my-8">
      {/* Decorative background elements */}
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-site-accent/5 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-cyan-500/5 blur-3xl" aria-hidden="true" />

      <div className="relative flex gap-4">
        <div className="hidden sm:flex shrink-0">
          <div className="w-10 h-10 rounded-full bg-site-accent/10 flex items-center justify-center">
            <Quote className="w-5 h-5 text-site-accent/60" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <blockquote className="text-sm sm:text-base leading-relaxed text-site-text/90 font-medium italic">
            &ldquo;{quote.text}&rdquo;
          </blockquote>
          <footer className="mt-3 flex items-center gap-2 text-xs text-site-text-muted">
            <span className="inline-block w-4 h-px bg-site-border" aria-hidden="true" />
            <span>Steve Jobs</span>
            {quote.context && (
              <>
                <span className="text-site-text-dim" aria-hidden="true">&middot;</span>
                <span className="text-site-text-dim">{quote.context}</span>
              </>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
