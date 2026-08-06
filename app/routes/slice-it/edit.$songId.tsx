import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

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
  component: EditorPage,
});

function EditorSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span className="sr-only">Loading the chart editor</span>
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
