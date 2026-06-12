import { useMemo } from 'react';
import quotes from '@/data/steve-jobs-quotes.json';

interface QuoteEntry {
  quote: string;
  context: string;
}

export function SteveJobsQuote() {
  const entry = useMemo<QuoteEntry>(() => {
    const idx = Math.floor(Math.random() * quotes.length);
    return quotes[idx];
  }, []);

  return (
    <blockquote className="steve-jobs-quote">
      <p className="steve-jobs-quote-text">&ldquo;{entry.quote}&rdquo;</p>
      <footer className="steve-jobs-quote-attribution">
        &mdash; Steve Jobs, <cite>{entry.context}</cite>
      </footer>
      <style>{`
        .steve-jobs-quote {
          max-width: 540px;
          margin: 1.5rem auto 0;
          padding: 1.5rem 2rem 1.25rem;
          border-left: 3px solid rgba(155, 122, 216, 0.5);
          background: rgba(255, 255, 255, 0.03);
          border-radius: 0 12px 12px 0;
          backdrop-filter: blur(2px);
          animation: quote-fade-in 0.8s ease-out both;
        }
        .steve-jobs-quote-text {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.55;
          color: var(--site-text-muted, #9a9ba4);
          font-style: italic;
          letter-spacing: 0.01em;
        }
        .steve-jobs-quote-attribution {
          margin-top: 0.6rem;
          font-size: 0.75rem;
          color: var(--site-text-dim, #6a6b74);
        }
        .steve-jobs-quote-attribution cite {
          font-style: normal;
        }
        @keyframes quote-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </blockquote>
  );
}
