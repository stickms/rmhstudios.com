/**
 * /v/new — Vibe generation route.
 *
 * Reads ?prompt from the URL, generates a page via DeepSeek, persists it, and
 * redirects to the permanent /v/$slug.
 *
 * The loading screen is the route's own component (not a loader pendingComponent):
 * generation is kicked off from a client effect so the "Creating your vibe…" UI is
 * guaranteed to render immediately. Doing the slow work in a redirecting loader
 * keeps the previous route mounted and never shows a loading state.
 *
 * No auth required — anyone can generate a vibe page.
 */

import { useEffect, useRef, useState } from 'react';
import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { createVibePage } from '@/lib/rmhvibe/vibe.server';
import '@/components/rmhvibe/vibe.css';

const generate = createServerFn({ method: 'POST' })
  .validator((prompt: string) => prompt)
  .handler(async ({ data: prompt }) => {
    const slug = await createVibePage(prompt);
    return { slug };
  });

export const Route = createFileRoute('/v/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : '',
  }),
  beforeLoad: ({ search }) => {
    if (!search.prompt.trim()) throw redirect({ to: '/' });
  },
  component: VibeNew,
});

function VibeNew() {
  const { prompt } = Route.useSearch();
  const navigate = useNavigate();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guard against React StrictMode's double-invoke in dev.
    if (started.current) return;
    started.current = true;

    generate({ data: prompt.trim() })
      .then(({ slug }) => navigate({ to: '/v/$slug', params: { slug }, replace: true }))
      .catch(() => setFailed(true));
  }, [prompt, navigate]);

  if (failed) return <VibeError />;
  return <VibeLoading />;
}

function VibeLoading() {
  return (
    <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-7">
      <div className="vibe-spinner" aria-hidden="true" />
      <div className="text-center">
        <p className="vibe-rise text-lg font-semibold tracking-tight">Creating your vibe…</p>
        <p className="vibe-rise-2 vibe-hint mt-2">Generating a one-of-a-kind page just for you.</p>
      </div>
    </div>
  );
}

function VibeError() {
  return (
    <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-4">
      <p className="vibe-rise text-2xl font-bold tracking-tight">Couldn&apos;t create that vibe</p>
      <p className="vibe-rise-2 vibe-hint">Something went wrong while generating. Give it another go.</p>
      <Link to="/" className="vibe-rise-3 vibe-toolbar__cta mt-3">
        Back home
      </Link>
    </div>
  );
}
