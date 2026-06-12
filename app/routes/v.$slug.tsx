/**
 * /v/$slug — Vibe page viewer.
 *
 * Renders a saved vibe page full-screen (outside the _site sidebar layout) inside
 * a sandboxed iframe, with a minimal floating toolbar to Customize, Share, or go
 * Back home. Anyone can customize — last write wins, no auth.
 */

import { useEffect, useRef, useState } from 'react';
import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowLeft, Pencil, Share2, Check, Loader2, X, CornerDownLeft } from 'lucide-react';
import { getVibePage, customizeVibePage } from '@/lib/rmhvibe/vibe.server';
import '@/components/rmhvibe/vibe.css';

const fetchVibe = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const page = await getVibePage(slug);
    if (!page) throw notFound();
    return { slug: page.slug, prompt: page.prompt, html: page.html };
  });

const customize = createServerFn({ method: 'POST' })
  .validator((data: { slug: string; prompt: string }) => data)
  .handler(async ({ data }) => {
    const html = await customizeVibePage(data.slug, data.prompt);
    return { html };
  });

export const Route = createFileRoute('/v/$slug')({
  loader: ({ params }) => fetchVibe({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.prompt ?? 'Vibe'} | RMH Studios` },
      { name: 'description', content: loaderData?.prompt ?? 'A vibe page generated on RMH Studios.' },
    ],
  }),
  notFoundComponent: VibeNotFound,
  component: VibeViewer,
});

function VibeViewer() {
  const { slug, html: initialHtml } = Route.useLoaderData();

  const [html, setHtml] = useState(initialHtml);
  const [panelOpen, setPanelOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Loader data is per-slug; reset local HTML when navigating between pages.
  useEffect(() => {
    setHtml(initialHtml);
  }, [initialHtml]);

  useEffect(() => {
    if (panelOpen) inputRef.current?.focus();
  }, [panelOpen]);

  async function handleCustomize() {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { html: nextHtml } = await customize({ data: { slug, prompt: trimmed } });
      setHtml(nextHtml);
      setPrompt('');
      setPanelOpen(false);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        title="Vibe page"
        srcDoc={html}
        sandbox="allow-scripts allow-popups allow-forms"
        className="h-full w-full border-0"
      />

      {/* Floating toolbar — top-right */}
      <div className="vibe-toolbar fixed right-3 top-3 z-40">
        <Link to="/" aria-label="Back to home" className="vibe-toolbar__icon">
          <ArrowLeft size={17} />
        </Link>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Copy share link"
          className="vibe-toolbar__icon"
        >
          {copied ? <Check size={17} /> : <Share2 size={16} />}
        </button>
        <button type="button" onClick={() => setPanelOpen((v) => !v)} className="vibe-toolbar__cta">
          <Pencil size={15} />
          Customize
        </button>
      </div>

      {/* Slide-up customize panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
      >
        <div className="vibe-panel mx-auto mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="vibe-panel__title">Customize this page</p>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="Close"
              className="vibe-panel__close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleCustomize();
                }
              }}
              rows={2}
              placeholder="Make it darker, add a pricing section, more neon…"
              disabled={busy}
              className="vibe-panel__input min-h-11 flex-1"
            />
            <button
              type="button"
              onClick={() => void handleCustomize()}
              disabled={busy || !prompt.trim()}
              aria-label="Apply customization"
              className="vibe-panel__submit"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <CornerDownLeft size={18} />}
            </button>
          </div>

          {busy && <p className="vibe-panel__hint mt-2">Reimagining your page…</p>}
          {error && <p className="vibe-panel__error mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function VibeNotFound() {
  return (
    <div className="vibe-screen fixed inset-0 flex flex-col items-center justify-center gap-4">
      <p className="vibe-rise text-3xl font-bold tracking-tight">Vibe not found</p>
      <p className="vibe-rise-2 vibe-hint">This page doesn&apos;t exist (or never did).</p>
      <Link to="/" className="vibe-rise-3 vibe-toolbar__cta mt-3">
        Make your own
      </Link>
    </div>
  );
}
