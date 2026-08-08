import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

/**
 * The Slice It chart editor.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §2.
 *
 * Nested under `app/routes/slice-it.tsx`, which is a top-level layout route and
 * therefore full-screen — pages under `_site/` get the radial shell, and an
 * editor is not a page you read. That layout already supplies the `.slice-theme`
 * wrapper (the scoped `--slice-*` palette), the Outfit face and the toaster, so
 * this route supplies neither a second time.
 *
 * The editor is lazy because it is a canvas renderer plus a command stack that
 * nobody browsing the library needs in their entry chunk — the same reason
 * `/discord/*` keeps the Discord SDK out of the shared bundle.
 */
const ChartEditor = lazy(() =>
  import('@/components/slice-it/editor/ChartEditor').then((m) => ({ default: m.ChartEditor })),
);

export const Route = createFileRoute('/slice-it/edit/$songId')({
  // Auth-gated and unindexed. The song's own title is not used here: it would
  // need a loader on a route whose entire content is a client-side editor, and
  // the tab is for the person who opened it, not for a crawler.
  head: () => ({ meta: [{ title: 'Chart editor — Slice It! | RMH Studios' }] }),
  component: EditorPage,
});

/**
 * The editor's shape, drawn in the game's own material while its chunk lands.
 *
 * A centred spinner on a bare ground told the author nothing and looked like
 * neither the editor nor the game. The editor is a toolbar over a timeline over
 * an inspector rail, and drawing that now makes the arrival a fill-in.
 */
function EditorSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col gap-3 bg-slice-bg p-4" role="status">
      <span className="sr-only">Loading the chart editor</span>
      <div className="slice-skeleton h-12 w-full shrink-0 rounded-2xl" />
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="slice-skeleton min-h-64 flex-1 rounded-2xl" />
        <div className="hidden w-72 shrink-0 flex-col gap-3 lg:flex">
          <div className="slice-skeleton h-40 w-full rounded-2xl" />
          <div className="slice-skeleton min-h-32 flex-1 rounded-2xl" />
        </div>
      </div>
      <div className="slice-skeleton h-24 w-full shrink-0 rounded-2xl" />
    </div>
  );
}

function EditorPage() {
  const { songId } = Route.useParams();
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <ChartEditor songId={songId} />
    </Suspense>
  );
}
