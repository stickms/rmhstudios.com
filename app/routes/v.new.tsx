/**
 * /v/new — Vibe generation route.
 *
 * Reads ?prompt from the URL, streams generation from /api/vibe/stream (the
 * selected Kimi/DeepSeek model), shows the model's live "thinking", and redirects to the
 * permanent /v/$slug when done. Generation is kicked off from a client effect so
 * the loading UI is guaranteed to render immediately.
 *
 * No auth required — anyone can generate a vibe page.
 */

import { useEffect, useRef, useState } from 'react';
import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router';
import { streamVibe } from '@/lib/rmhvibe/vibe-stream';
import { asVibeModel } from '@/lib/rmhvibe/vibe-types';
import { ThinkingStream } from '@/components/rmhvibe/ThinkingStream';
import '@/components/rmhvibe/vibe.css';

export const Route = createFileRoute('/v/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : '',
    model: asVibeModel(search.model),
  }),
  beforeLoad: ({ search }) => {
    if (!search.prompt.trim()) throw redirect({ to: '/v' });
  },
  component: VibeNew,
});

function VibeNew() {
  const { prompt, model } = Route.useSearch();
  const navigate = useNavigate();
  const started = useRef(false);
  const [thinking, setThinking] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guard against React StrictMode's double-invoke in dev.
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    streamVibe({ prompt: prompt.trim(), model }, (event) => {
      if (cancelled) return;
      if (event.type === 'thinking') {
        setThinking((t) => t + event.text);
      } else if (event.type === 'done') {
        navigate({ to: '/v/$slug', params: { slug: event.slug }, replace: true });
      } else if (event.type === 'error') {
        setFailed(true);
      }
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [prompt, model, navigate]);

  if (failed) return <VibeError />;

  return (
    <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="vibe-spinner" aria-hidden="true" />
      <div className="text-center">
        <p className="vibe-rise text-lg font-semibold tracking-tight">Creating your vibe…</p>
        <p className="vibe-rise-2 vibe-hint mt-2">
          {thinking ? 'Thinking it through.' : 'Warming up the model.'}
        </p>
      </div>
      <ThinkingStream text={thinking} className="vibe-think--lg" />
    </div>
  );
}

function VibeError() {
  return (
    <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-4">
      <p className="vibe-rise text-2xl font-bold tracking-tight">Couldn&apos;t create that vibe</p>
      <p className="vibe-rise-2 vibe-hint">Something went wrong while generating. Give it another go.</p>
      <Link to="/v" className="vibe-rise-3 vibe-toolbar__cta mt-3">
        Back to pages
      </Link>
    </div>
  );
}
