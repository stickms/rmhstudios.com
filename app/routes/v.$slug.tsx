/**
 * /v/$slug — Vibe page viewer.
 *
 * Renders a saved vibe page full-screen (outside the _site sidebar layout) inside
 * a sandboxed iframe, with a minimal floating toolbar to Customize, Share, or go
 * Back home. Customizing streams the model's live "thinking" and updates the page
 * in place. Anyone can customize — last write wins, no auth.
 */

import { useEffect, useRef, useState } from 'react';
import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowLeft, Pencil, Share2, Check, Loader2, X, CornerDownLeft } from 'lucide-react';
import { getVibePage } from '@/lib/rmhvibe/vibe.server';
import { streamVibe } from '@/lib/rmhvibe/vibe-stream';
import { DEFAULT_VIBE_MODEL, type VibeModel } from '@/lib/rmhvibe/vibe-types';
import { ModelToggle } from '@/components/rmhvibe/ModelToggle';
import { ThinkingStream } from '@/components/rmhvibe/ThinkingStream';
import '@/components/rmhvibe/vibe.css';

const fetchVibe = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const page = await getVibePage(slug);
    if (!page) throw notFound();
    return {
      slug: page.slug,
      html: page.html,
      title: page.title || page.prompt,
      description: page.description || `A vibe page about "${page.prompt}".`,
    };
  });

export const Route = createFileRoute('/v/$slug')({
  loader: ({ params }) => fetchVibe({ data: params.slug }),
  head: ({ loaderData }) => {
    const title = loaderData?.title ?? 'Vibe';
    const description = loaderData?.description ?? 'A vibe page generated on RMH Studios.';
    return {
      meta: [
        { title: `${title} | RMH Studios` },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:site_name', content: 'RMH Studios' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
    };
  },
  notFoundComponent: VibeNotFound,
  component: VibeViewer,
});

function VibeViewer() {
  const { slug, html: initialHtml } = Route.useLoaderData();

  const [html, setHtml] = useState(initialHtml);
  // Bumped on every html change so the iframe fully remounts — without this,
  // backdrop-filter overlays (toolbar/panel) leave stale composite "ghosts"
  // each time the iframe repaints, stacking up as the user customizes.
  const [renderKey, setRenderKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<VibeModel>(DEFAULT_VIBE_MODEL);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Loader data is per-slug; reset local HTML when navigating between pages.
  useEffect(() => {
    setHtml(initialHtml);
    setRenderKey((k) => k + 1);
  }, [initialHtml]);

  useEffect(() => {
    if (panelOpen) {
      inputRef.current?.focus();
    } else {
      // Hand keyboard focus back to the page when the panel closes.
      iframeRef.current?.contentWindow?.focus();
    }
  }, [panelOpen]);

  async function handleCustomize() {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setThinking('');

    let finalHtml = '';
    let finalTitle = '';
    let hadError = false;
    try {
      await streamVibe({ slug, prompt: trimmed, model }, (event) => {
        if (event.type === 'thinking') {
          setThinking((t) => t + event.text);
        } else if (event.type === 'done') {
          finalHtml = event.html;
          finalTitle = event.title;
        } else if (event.type === 'error') {
          hadError = true;
          setError(event.message);
        }
      });
    } catch {
      hadError = true;
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }

    if (finalHtml && !hadError) {
      setHtml(finalHtml);
      setRenderKey((k) => k + 1);
      if (finalTitle) document.title = `${finalTitle} | RMH Studios`;
      setPrompt('');
      setThinking('');
      setPanelOpen(false);
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
        key={renderKey}
        ref={iframeRef}
        title="Vibe page"
        srcDoc={html}
        sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"
        className="h-full w-full border-0"
        onLoad={(e) => {
          // Move focus into the iframe so keyboard-driven pages (spacebar, arrow
          // keys, WASD, etc.) receive input immediately without a manual click.
          try {
            e.currentTarget.contentWindow?.focus();
          } catch {
            /* cross-origin focus call — safe to ignore */
          }
        }}
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
        className={`vibe-panel-dock fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
      >
        <div className="vibe-panel mx-auto">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="vibe-panel__title">Customize this page</p>
            <div className="flex items-center gap-2">
              <ModelToggle value={model} onChange={setModel} disabled={busy} />
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="vibe-panel__close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {busy && <ThinkingStream text={thinking} className="vibe-think--sm mb-3" />}

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
