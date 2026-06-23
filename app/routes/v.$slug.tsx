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
import {
  ArrowLeft,
  Pencil,
  Share2,
  Check,
  Loader2,
  X,
  CornerDownLeft,
  History,
  RotateCcw,
} from 'lucide-react';
import {
  getVibePage,
  listVibeVersions,
  getVibeVersion,
  type VibeVersionSummary,
} from '@/lib/rmhvibe/vibe.server';
import { streamVibe, VibeStreamError } from '@/lib/rmhvibe/vibe-stream';
import { DEFAULT_VIBE_MODEL, type VibeModel } from '@/lib/rmhvibe/vibe-types';
import { ModelSelect } from '@/components/rmhvibe/ModelSelect';
import { ThinkingStream } from '@/components/rmhvibe/ThinkingStream';
import { VibeProgress } from '@/components/rmhvibe/VibeProgress';
import '@/components/rmhvibe/vibe.css';

// Background-build polling cadence + guards (see the generating-status effect).
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_FAILURES = 12; // ~18s of solid failures → treat the page as gone
const BUILD_SLOW_AFTER_MS = 60_000; // reassure the user it's still working
const BUILD_HARD_CAP_MS = 18 * 60_000; // beyond the server's worst-case build time

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
      // "generating" | "ready" | "error" — drives the still-building overlay below.
      status: page.status,
    };
  });

const fetchVibeVersions = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(({ data: slug }) => listVibeVersions(slug));

const fetchVibeVersion = createServerFn({ method: 'GET' })
  .validator((data: { slug: string; versionId: string }) => data)
  .handler(({ data }) => getVibeVersion(data.slug, data.versionId));

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
  const { slug, html: initialHtml, status: initialStatus, title: initialTitle } = Route.useLoaderData();

  // Generation lifecycle for the page itself: a freshly-reserved page arrives here
  // as "generating" (the user was navigated over before the build finished), so we
  // show a building overlay and poll until it flips to "ready" (or "error").
  const [status, setStatus] = useState(initialStatus);
  const [html, setHtml] = useState(initialHtml);
  // The page's current (latest) HTML — what "Back to latest" returns to. Diverges
  // from `html` while previewing an older version, and advances on each customize.
  const [latestHtml, setLatestHtml] = useState(initialHtml);
  // Bumped on every html change so the iframe fully remounts — without this,
  // backdrop-filter overlays (toolbar/panel) leave stale composite "ghosts"
  // each time the iframe repaints, stacking up as the user customizes.
  const [renderKey, setRenderKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<VibeModel>(DEFAULT_VIBE_MODEL);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState('');
  // Streamed answer (metadata + files) for the live build-progress panel.
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Version history. `versions` is loaded lazily when the panel first opens.
  // `activeVersionId` is the version currently shown in the iframe; null means the
  // page's latest version. Customizing branches off whatever version is active.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<VibeVersionSummary[] | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const latestVersionId = versions && versions.length ? versions[versions.length - 1].id : null;
  // We're viewing an earlier variant when an older version is explicitly selected.
  const viewingOlder = activeVersionId !== null && activeVersionId !== latestVersionId;

  // Loader data is per-slug; reset local state when navigating between pages.
  useEffect(() => {
    setHtml(initialHtml);
    setLatestHtml(initialHtml);
    setStatus(initialStatus);
    setRenderKey((k) => k + 1);
    setVersions(null);
    setActiveVersionId(null);
    setHistoryOpen(false);
  }, [slug, initialHtml, initialStatus]);

  // True once a background build has been running a while, so the overlay can
  // reassure the user it's still working rather than looking stuck.
  const [buildSlow, setBuildSlow] = useState(false);

  // While the page is still building in the background, poll until it's ready. The
  // generation runs server-side independently of any stream connection, so this
  // reliably resolves even though the original /v/new stream may be long gone.
  useEffect(() => {
    if (status !== 'generating') return;
    setBuildSlow(false);
    let stop = false;
    const startedAt = Date.now();
    let failures = 0; // consecutive fetch failures (page deleted / network)
    const poll = async () => {
      // Safety net: the server caps a build at a few minutes per attempt (×retries);
      // if we're still "generating" well past that, the build was lost (e.g. a server
      // restart) — stop spinning forever and surface a failure.
      if (Date.now() - startedAt > BUILD_HARD_CAP_MS) {
        if (!stop) setStatus('error');
        return;
      }
      if (Date.now() - startedAt > BUILD_SLOW_AFTER_MS) setBuildSlow(true);
      try {
        const data = await fetchVibe({ data: slug });
        if (stop) return;
        failures = 0;
        if (data.status === 'ready') {
          setHtml(data.html);
          setLatestHtml(data.html);
          setRenderKey((k) => k + 1);
          if (data.title) document.title = `${data.title} | RMH Studios`;
          setStatus('ready');
        } else if (data.status === 'error') {
          setStatus('error');
        }
      } catch {
        // A transient blip is fine, but a sustained failure (most likely the page was
        // deleted, or a persistent network problem) shouldn't poll forever.
        if (stop) return;
        if (++failures >= POLL_MAX_FAILURES) setStatus('error');
      }
    };
    void poll(); // check immediately, don't wait a full interval
    const id = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [status, slug]);

  async function loadVersions() {
    setLoadingVersions(true);
    try {
      const list = await fetchVibeVersions({ data: slug });
      setVersions(list);
    } catch {
      /* leave versions null — the panel shows an empty state */
    } finally {
      setLoadingVersions(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) {
      setPanelOpen(false);
      if (versions === null && !loadingVersions) void loadVersions();
    }
  }

  // Preview a specific version: swap the iframe to its HTML and mark it active.
  async function previewVersion(versionId: string) {
    if (busy) return;
    setError(null);
    try {
      const version = await fetchVibeVersion({ data: { slug, versionId } });
      if (!version) {
        setError('That version is no longer available.');
        return;
      }
      setHtml(version.html);
      setRenderKey((k) => k + 1);
      setActiveVersionId(versionId);
      if (version.title) document.title = `${version.title} | RMH Studios`;
    } catch {
      setError('Could not load that version.');
    }
  }

  function backToLatest() {
    if (busy) return;
    setHtml(latestHtml);
    setRenderKey((k) => k + 1);
    setActiveVersionId(null);
  }

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
    setContent('');

    let finalHtml = '';
    let finalTitle = '';
    let hadError = false;
    try {
      // When viewing an older variant, branch the customization off it; otherwise
      // continue from the page's latest version.
      const fromVersionId = viewingOlder ? (activeVersionId ?? undefined) : undefined;
      await streamVibe({ slug, prompt: trimmed, fromVersionId, model }, (event) => {
        if (event.type === 'thinking') {
          setThinking((t) => t + event.text);
        } else if (event.type === 'content') {
          setContent((c) => c + event.text);
        } else if (event.type === 'done') {
          finalHtml = event.html;
          finalTitle = event.title;
        } else if (event.type === 'error') {
          hadError = true;
          setError(event.message);
        }
      });
    } catch (err) {
      hadError = true;
      setError(
        err instanceof VibeStreamError ? err.message : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }

    // Stream ended without a result and without an explicit error — most likely the
    // connection dropped. The customize runs to completion server-side regardless, so
    // re-fetch and pick up the new content if it already landed; otherwise tell the
    // user plainly rather than silently doing nothing.
    if (!finalHtml && !hadError) {
      try {
        const latest = await fetchVibe({ data: slug });
        if (latest.html && latest.html !== latestHtml) {
          finalHtml = latest.html;
          finalTitle = latest.title;
        } else {
          hadError = true;
          setError('Lost the connection before the update finished. Please try again.');
        }
      } catch {
        hadError = true;
        setError('Lost the connection before the update finished. Please try again.');
      }
    }

    if (finalHtml && !hadError) {
      setHtml(finalHtml);
      setLatestHtml(finalHtml);
      setRenderKey((k) => k + 1);
      if (finalTitle) document.title = `${finalTitle} | RMH Studios`;
      setPrompt('');
      setThinking('');
      setContent('');
      setPanelOpen(false);
      // The new version is now the latest; drop any older-variant selection and
      // refresh the history list so the new entry shows up.
      setActiveVersionId(null);
      if (historyOpen || versions !== null) void loadVersions();
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

  // Still building (or failed) — show a status screen instead of the empty iframe.
  // Hooks above always run; these early returns only gate the rendered output.
  if (status === 'generating') return <VibeGenerating title={initialTitle} slow={buildSlow} />;
  if (status === 'error') return <VibeGenerationFailed />;

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
        <Link to="/v" aria-label="Back to pages" className="vibe-toolbar__icon">
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
        <button
          type="button"
          onClick={toggleHistory}
          aria-label="Version history"
          aria-pressed={historyOpen}
          className="vibe-toolbar__icon"
        >
          <History size={17} />
        </button>
        <button type="button" onClick={() => setPanelOpen((v) => !v)} className="vibe-toolbar__cta">
          <Pencil size={15} />
          Customize
        </button>
      </div>

      {/* Banner shown while previewing an earlier variant */}
      {viewingOlder && (
        <div className="vibe-version-banner fixed left-1/2 top-3 z-40 -translate-x-1/2">
          <span>Viewing an earlier version</span>
          <button type="button" onClick={backToLatest} className="vibe-version-banner__btn">
            <RotateCcw size={13} />
            Back to latest
          </button>
        </div>
      )}

      {/* Version history panel — slides in from the right */}
      <div
        className={`vibe-history-dock fixed right-0 top-0 z-40 h-full transition-transform duration-300 ease-out ${
          historyOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <div className="vibe-history flex h-full flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="vibe-panel__title">Version history</p>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close history"
              className="vibe-panel__close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="vibe-history__list flex-1 overflow-y-auto">
            {loadingVersions && (
              <div className="vibe-history__empty">
                <Loader2 size={18} className="animate-spin" />
              </div>
            )}
            {!loadingVersions && versions && versions.length === 0 && (
              <p className="vibe-history__empty">No history yet.</p>
            )}
            {!loadingVersions &&
              versions &&
              versions
                .map((v, i) => ({ v, label: i + 1 }))
                .reverse()
                .map(({ v, label }) => {
                  const isActive =
                    activeVersionId === v.id || (activeVersionId === null && v.id === latestVersionId);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => void previewVersion(v.id)}
                      disabled={busy}
                      className={`vibe-history__item ${isActive ? 'vibe-history__item--active' : ''}`}
                    >
                      <div className="vibe-history__item-head">
                        <span className="vibe-history__ver">
                          v{label}
                          {v.id === latestVersionId && (
                            <span className="vibe-history__badge">latest</span>
                          )}
                        </span>
                        <time className="vibe-history__time">{formatVersionDate(v.createdAt)}</time>
                      </div>
                      <p className="vibe-history__prompt">{v.title || v.prompt}</p>
                    </button>
                  );
                })}
          </div>

          {viewingOlder && (
            <p className="vibe-history__hint">
              Hit <strong>Customize</strong> to branch a new version from the one you&apos;re viewing.
            </p>
          )}
        </div>
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
              <ModelSelect value={model} onChange={setModel} disabled={busy} />
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

          {busy &&
            (content ? (
              <VibeProgress content={content} className="vibe-progress--sm mb-3" />
            ) : (
              <ThinkingStream text={thinking} className="vibe-think--sm mb-3" />
            ))}

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

/** Compact, locale-aware "Jun 13, 2026, 2:41 PM" style stamp for a version. */
function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Shown when the page is still being generated in the background; the viewer polls
 *  the loader until it flips to "ready", then swaps in the real page. Generation
 *  continues server-side even if the user navigated here mid-build (or left and came
 *  back), so this resolves on its own. */
function VibeGenerating({ title, slow }: { title: string; slow: boolean }) {
  return (
    <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="vibe-spinner" aria-hidden="true" />
      <div>
        <p className="vibe-rise text-lg font-semibold tracking-tight">Building your vibe…</p>
        <p className="vibe-rise-2 vibe-hint mt-2 max-w-md">
          {title
            ? `“${title}” is coming together. This page updates on its own — you can safely wait here.`
            : 'This page updates on its own when it’s ready — you can safely wait here.'}
        </p>
        {slow && (
          <p className="vibe-rise-3 vibe-hint mt-2 max-w-md opacity-80">
            Still working — a detailed build can take a couple of minutes.
          </p>
        )}
      </div>
    </div>
  );
}

/** Shown when a background generation failed (the reserved page was marked errored). */
function VibeGenerationFailed() {
  return (
    <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-4">
      <p className="vibe-rise text-2xl font-bold tracking-tight">Couldn&apos;t finish this vibe</p>
      <p className="vibe-rise-2 vibe-hint">Generation didn&apos;t complete. Give it another go.</p>
      <Link to="/v" className="vibe-rise-3 vibe-toolbar__cta mt-3">
        Back to pages
      </Link>
    </div>
  );
}

function VibeNotFound() {
  return (
    <div className="vibe-screen fixed inset-0 flex flex-col items-center justify-center gap-4">
      <p className="vibe-rise text-3xl font-bold tracking-tight">Vibe not found</p>
      <p className="vibe-rise-2 vibe-hint">This page doesn&apos;t exist (or never did).</p>
      <Link to="/v" className="vibe-rise-3 vibe-toolbar__cta mt-3">
        Make your own
      </Link>
    </div>
  );
}
