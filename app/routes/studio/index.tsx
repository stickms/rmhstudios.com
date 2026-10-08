import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useTranslation } from "react-i18next";

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import StudioShell from '@/components/studio/StudioShell';

export const Route = createFileRoute('/studio/')({
  component: StudioPage,
});

function StudioPage() {
  const { t } = useTranslation("r-studio");
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[var(--site-bg)]">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
            <p className="text-sm text-[var(--site-muted)]">{t("loading", { defaultValue: "Loading RMH Studio..." })}</p>
          </div>
        </div>
      }
    >
      <StudioShell />
    </Suspense>
  );
}
