import { createFileRoute } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';

import { useTranslation } from "react-i18next";
import { Spinner } from '@/components/ui/spinner';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import StudioShell from '@/components/studio/StudioShell';
import StudioAppShell from '@/components/studio/StudioAppShell';
import { ArrivalSuspense } from '@/components/ui/arrive';

export const Route = createFileRoute('/studio/')({
  head: () => appRouteHead('studio'),
  component: StudioPage,
});

function StudioPage() {
  const { t } = useTranslation("r-studio");
  return (
    <StudioAppShell>
    <ArrivalSuspense
      fallback={
        <div className="app-viewport items-center justify-center bg-app-bg">
          <div className="flex flex-col items-center gap-4">
            <Spinner size={32} label={t("loading", { defaultValue: "Loading RMH Studio..." })} />
            <p className="text-sm text-app-text-muted">{t("loading", { defaultValue: "Loading RMH Studio..." })}</p>
          </div>
        </div>
      }
    >
      <StudioShell />
    </ArrivalSuspense>
    </StudioAppShell>
  );
}
