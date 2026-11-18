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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { streamVibe, VibeStreamError } from '@/lib/rmhvibe/vibe-stream';
import { asVibeModel } from '@/lib/rmhvibe/vibe-types';
import { ThinkingStream } from '@/components/rmhvibe/ThinkingStream';
import { VibeProgress } from '@/components/rmhvibe/VibeProgress';
import { VibeFrame } from '@/components/rmhvibe/VibeFrame';
import { LiveBuildPanel, useLiveBuildView } from '@/components/rmhvibe/LiveBuildPanel';
import { parsePartialProject } from '@/lib/rmhvibe/vibe-project';
import { ChevronUp } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { VibeStyles } from '@/components/rmhvibe/VibeStyles';

const GENERIC_ERROR = 'Something went wrong while generating. Give it another go.';

export const Route = createFileRoute('/v/new')({
  head: () => noindexHead('New Vibe'),
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : '',
    model: asVibeModel(search.model),
    kind: search.kind === 'widget' ? ('widget' as const) : ('page' as const),
  }),
  beforeLoad: ({ search }) => {
    if (!search.prompt.trim()) throw redirect({ to: '/v' });
  },
  component: VibeNew,
});

function VibeNew() {
  const { t } = useTranslation("pages");
  const { prompt, model, kind } = Route.useSearch();
  const navigate = useNavigate();
  const started = useRef(false);
  const [thinking, setThinking] = useState('');
  // Accumulated answer text (metadata + files) — drives the live "what's being
  // built" panel so the long code-writing phase shows real progress, not a spinner.
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Latest live preview (Task 4's `preview` event): the page as built so far.
  const [preview, setPreview] = useState<{ html: string; done: number; total: number } | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    // Guard against React StrictMode's double-invoke in dev.
    if (started.current) return;
    started.current = true;

    // `cancelled` only stops this view from REACTING to the stream once it has
    // unmounted (e.g. after we navigate to the page). We deliberately do NOT abort
    // the underlying request: if the user leaves /v/new mid-build, generation keeps
    // running and persisting server-side (the API route is detached from the
    // connection), so the page still finishes in the background.
    let cancelled = false;
    // The server reserves the page's slug up front (the `created` event) and persists
    // it as "generating", so we don't depend on the long-lived stream surviving to the
    // final `done` to know where to go. We navigate on `done` for the smooth case;
    // if the stream is cut first (timeout / tab throttling / network), we still
    // navigate to the reserved slug — the page exists and shows its own generating
    // state until the background build finishes.
    let reservedSlug: string | null = null;
    let navigated = false;
    let errored = false;
    const goTo = (slug: string) => {
      if (cancelled || navigated) return;
      navigated = true;
      navigate({ to: '/v/$slug', params: { slug }, replace: true });
    };
    const fail = (message: string) => {
      if (cancelled || navigated || errored) return;
      errored = true;
      setError(message);
    };

    streamVibe({ prompt: prompt.trim(), model, kind }, (event) => {
      if (cancelled) return;
      if (event.type === 'created') {
        reservedSlug = event.slug;
      } else if (event.type === 'thinking') {
        setThinking((t) => t + event.text);
      } else if (event.type === 'content') {
        setContent((c) => c + event.text);
      } else if (event.type === 'preview') {
        setPreview({
          html: event.html,
          done: event.done.length,
          total: event.done.length + event.pending.length,
        });
      } else if (event.type === 'done') {
        goTo(event.slug);
      } else if (event.type === 'error') {
        // Generation failed server-side and told us why — show that specific reason
        // here rather than bouncing to a generic failed page. (The reserved row, if
        // any, is marked "error" server-side and stays out of the gallery.)
        fail(event.message || GENERIC_ERROR);
      }
    })
      .then(() => {
        // Stream ended cleanly. `done`/`error` already handled it. But a silent cut
        // (no terminal event) with a reserved slug means generation is still
        // finishing server-side — head to the page anyway; it polls until ready.
        if (cancelled || navigated || errored) return;
        if (reservedSlug) goTo(reservedSlug);
        else fail(GENERIC_ERROR);
      })
      .catch((err: unknown) => {
        // The request itself failed (HTTP error / network) before any usable event.
        if (cancelled || navigated || errored) return;
        if (reservedSlug) goTo(reservedSlug);
        else fail(err instanceof VibeStreamError ? err.message : GENERIC_ERROR);
      });

    return () => {
      cancelled = true;
    };
  }, [prompt, model, kind, navigate]);

  const wide = useMediaQuery('(min-width: 900px)');
  // Lifted so crossing the breakpoint (or collapsing the sheet) keeps the tab and the picked file.
  const buildView = useLiveBuildView();
  const writing = useMemo(() => parsePartialProject(content).writing, [content]);

  if (error) return <VibeError message={error} />;

  if (preview) {
    const status = writing
      ? t('live-status-writing', {
          defaultValue: 'Writing {{file}} · {{done}} of {{total}} files',
          file: writing,
          done: preview.done,
          total: preview.total,
        })
      : content
        ? t('live-status-finishing', { defaultValue: 'Finishing up' })
        : t('thinking-it-through', { defaultValue: 'Thinking it through.' });
    const phase = content ? 'writing' : 'thinking';
    return (
      <>
        <VibeStyles />
        <div className="vibe-live">
          <div className="vibe-live__stage">
            <VibeFrame
              html={preview.html}
              title={t('vibe-frame-title', { defaultValue: 'Vibe page' })}
            />
            {!wide && (
            <div className="vibe-live__sheet">
              <button
                type="button"
                className="vibe-live__sheet-bar"
                aria-expanded={sheetOpen}
                aria-label={
                  sheetOpen
                    ? t('live-sheet-collapse', { defaultValue: 'Hide build details' })
                    : t('live-sheet-expand', { defaultValue: 'Show build details' })
                }
                onClick={() => setSheetOpen((v) => !v)}
              >
                <span className="flex-1 truncate" aria-hidden="true">
                  {status}
                </span>
                <ChevronUp size={16} aria-hidden="true" className={sheetOpen ? 'rotate-180' : ''} />
              </button>
              <p className="sr-only" aria-live="polite">
                {status}
              </p>
              {sheetOpen && (
                <div className="vibe-live__sheet-body">
                  <LiveBuildPanel thinking={thinking} content={content} phase={phase} view={buildView} />
                </div>
              )}
            </div>
            )}
          </div>
          {wide && (
          <aside className="vibe-live__side">
            <LiveBuildPanel thinking={thinking} content={content} phase={phase} view={buildView} />
          </aside>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <VibeStyles />
      <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 py-12">
        <div className="vibe-spinner" aria-hidden="true" />
        <div className="text-center">
          <p className="vibe-rise text-lg font-semibold tracking-tight">{t("creating-your-vibe", { defaultValue: "Creating your vibe…" })}</p>
          <p className="vibe-rise-2 vibe-hint mt-2">
            {content
              ? t("writing-the-code", { defaultValue: "Writing the code." })
              : thinking
                ? t("thinking-it-through", { defaultValue: "Thinking it through." })
                : t("warming-up-the-model", { defaultValue: "Warming up the model." })}
          </p>
        </div>
        {/* Show the thinking until code starts, then swap to the live file list so the
            long writing phase isn't a blank spinner. */}
        {content ? (
          <VibeProgress content={content} />
        ) : (
          <ThinkingStream text={thinking} className="vibe-think--lg" />
        )}
      </div>
    </>
  );
}

function VibeError({ message }: { message: string }) {
  const { t } = useTranslation("pages");
  return (
    <div className="vibe-screen fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="vibe-rise text-2xl font-bold tracking-tight">{t("couldnt-create-that-vibe", { defaultValue: "Couldn't create that vibe" })}</p>
      <p className="vibe-rise-2 vibe-hint max-w-md">{message}</p>
      <Link to="/v" className="vibe-rise-3 vibe-toolbar__cta">
        {t("back-to-pages", { defaultValue: "Back to pages" })}
      </Link>
    </div>
  );
}
