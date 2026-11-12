import { useTranslation } from "react-i18next";
import { PinnedHero } from "@/components/feed/PinnedHero";
import { roadmap } from "./roadmap-data";
import { EraSection } from "./EraSection";
import { RoadmapStyles } from "./RoadmapStyles";

export function RoadmapSection() {
  const { t } = useTranslation("c-roadmap");

  return (
    <div className="relative isolate">
      <RoadmapStyles />

      {/* ── Signature pinned hero ─────────────────────────────
          No overflow-hidden wrapper around the hero (it clips its own glow),
          so its position:sticky pinning survives inside AnimatedMain. The old
          intro card's copy is folded into the subtitle. */}
      <PinnedHero
        eyebrow={t("hero-eyebrow", { defaultValue: "Roadmap" })}
        title={
          <>
            {t("hero-heading-line1", { defaultValue: "The road" })}{" "}
            <span className="text-site-accent">
              {t("hero-heading-line2", { defaultValue: "ahead." })}
            </span>
          </>
        }
        subtitle={t("intro-body", {
          defaultValue:
            "We're an indie studio building rhythm games, deckbuilders, narrative horror, and more. Our roadmap isn't tied to one title—we're growing the catalog, Discord, and new worlds in parallel. Timelines are guides, not promises.",
        })}
        scrollCue={t("hero-scroll-cue", { defaultValue: "Where we're going" })}
      />

      {/* ── Timeline ──────────────────────────────────────────
          The years are a real chronology, so a vertical spine + per-era nodes
          is content-true. `content-visibility:auto` on each era keeps ~30
          sections cheap to render. */}
      <div className="relative border-t border-site-border px-4 pb-8 pt-10">
        <div className="space-y-10">
          {roadmap.map((section) => (
            <EraSection key={section.year} section={section} />
          ))}
        </div>

        <p className="mt-10 text-center font-mono text-xs text-site-text-muted">
          {t("update-note", { defaultValue: "We'll update this as we ship." })}
        </p>
      </div>
    </div>
  );
}
