import { useTranslation } from "react-i18next";
// Static, not `lazy()`: this already rides in the /versecraft route's own chunk,
// which Start loads before hydrating. A second `lazy()` here was still pending at
// hydration often enough that the server-rendered game blanked to "Loading..."
// and came back (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { VersecraftGame } from '@/components/versecraft/VersecraftGame';
import { ArrivalSuspense } from '@/components/ui/arrive';

export function VersecraftClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t } = useTranslation("c-versecraft");
  return (
    <ArrivalSuspense fallback={
      <div className="flex items-center justify-center app-ground" style={{ backgroundColor: '#1a1520' }}>
        <p style={{ color: '#a89888', fontFamily: 'serif' }}>{t("loading", { defaultValue: "Loading..." })}</p>
      </div>
    }>
      <VersecraftGame isLoggedIn={isLoggedIn} />
    </ArrivalSuspense>
  );
}
