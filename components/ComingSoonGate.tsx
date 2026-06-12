import { type FormEvent, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, Quote } from "lucide-react";
import steveJobsQuotes from "@/data/steve-jobs-quotes.json";

function getRandomQuote() {
  const index = Math.floor(Math.random() * steveJobsQuotes.length);
  return steveJobsQuotes[index];
}

function useRotatingQuote(intervalMs = 10000) {
  const [quote, setQuote] = useState(getRandomQuote);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuote(getRandomQuote());
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return quote;
}

export function ComingSoonGate() {
  const [message, setMessage] = useState("");
  const quote = useRotatingQuote(10000);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Coming soon.");
  }

  return (
    <main className="coming-soon-gate" aria-labelledby="coming-soon-title">
      <div className="coming-soon-noise" aria-hidden="true" />
      <div className="coming-soon-vignette" aria-hidden="true" />

      <div className="coming-soon-shapes" aria-hidden="true">
        <span className="coming-soon-shape coming-soon-shape-a" />
        <span className="coming-soon-shape coming-soon-shape-b" />
        <span className="coming-soon-shape coming-soon-shape-c" />
        <span className="coming-soon-shape coming-soon-shape-d" />
        <span className="coming-soon-shape coming-soon-shape-e" />
      </div>

      <section className="coming-soon-center">
        <p className="coming-soon-kicker">RMH Studios</p>
        <h1 id="coming-soon-title">COMING SOON</h1>
      </section>

      {/* Steve Jobs Quote Display */}
      <section className="coming-soon-quote" aria-label="Inspirational quote">
        <Quote className="coming-soon-quote-icon" size={20} aria-hidden="true" />
        <blockquote className="coming-soon-quote-text">
          &ldquo;{quote.quote}&rdquo;
        </blockquote>
        <cite className="coming-soon-quote-attribution">
          &mdash; Steve Jobs
          {quote.context && <span className="coming-soon-quote-context">, {quote.context}</span>}
        </cite>
      </section>

      <form className="coming-soon-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="lockdown-password">
          Password
        </label>
        <div className="coming-soon-input-shell">
          <LockKeyhole aria-hidden="true" size={18} />
          <input
            id="lockdown-password"
            name="password"
            type="password"
            autoComplete="off"
            placeholder="Password"
          />
          <button type="submit" aria-label="Submit password">
            <ArrowRight aria-hidden="true" size={20} />
          </button>
        </div>
        <p className="coming-soon-message" aria-live="polite">
          {message}
        </p>
      </form>
    </main>
  );
}
