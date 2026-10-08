import { Suspense } from 'react';
import { useTranslation } from "react-i18next";
// Static, not `lazy()`: this already rides in the /versecraft route's own chunk,
// which Start loads before hydrating. A second `lazy()` here was still pending at
// hydration often enough that the server-rendered game blanked to "Loading..."
// and came back (docs/fouc-audit-2026-10-06.md §13).
import { VersecraftGame } from '@/components/versecraft/VersecraftGame';

export function VersecraftClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t } = useTranslation("c-versecraft");
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#1a1520' }}>
        <p style={{ color: '#a89888', fontFamily: 'serif' }}>{t("loading", { defaultValue: "Loading..." })}</p>
      </div>
    }>
      <VersecraftGame isLoggedIn={isLoggedIn} />
    </Suspense>
  );
}
