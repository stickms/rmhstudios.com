import { useTranslation } from "react-i18next";

export function GameLoadingFallback() {
  const { t } = useTranslation("shared");
  return (
    <div className="flex h-screen w-full items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="text-sm text-white/60">{t("loading", { defaultValue: "Loading…" })}</p>
      </div>
    </div>
  )
}
