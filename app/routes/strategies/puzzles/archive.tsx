import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

export const Route = createFileRoute('/strategies/puzzles/archive')({
  component: ArchivePage,
});

function ArchivePage() {
  const { t } = useTranslation("r-strategies");
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
        {t("puzzle-archive", { defaultValue: "Puzzle Archive" })}
      </h1>
      <p className="text-sm" style={{ color: 'var(--doctrine-text-muted)' }}>
        {t("archive-description", { defaultValue: "Browse past puzzles. History is classified until it isn't." })}
      </p>
      <div className="text-center py-16">
        <p className="text-sm text-white/30">{t("archive-coming-soon", { defaultValue: "Archive coming in Phase 1: First Light" })}</p>
      </div>
    </div>
  );
}
