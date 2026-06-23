import { lazy, Suspense } from 'react';
import { useTranslation } from "react-i18next";

const VersecraftGame = lazy(
  () => import('@/components/versecraft/VersecraftGame').then(m => ({ default: m.VersecraftGame })),
);

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
