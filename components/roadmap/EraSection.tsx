import type { YearSection } from "./roadmap-types";
import { eraColorFor } from "./roadmap-model";

/** One milestone → an L2 glass pane (`.`). Accent-tinted title,
 *  muted body, a subtle reduced-motion-safe lift on hover. */
function MilestoneCard({ title, body }: { title: string; body: string }) {
  return (
    <div data-slot="card"className="roadmap-card rounded-site px-4 py-3">
      <h3 className="site-section-label mb-2 text-site-accent!">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-site-text-muted">{body}</p>
    </div>
  );
}

/** One chronological era: a timeline node on the spine, big display year,
 *  mono tagline, and a staggered grid of milestone panes. */
export function EraSection({ section }: { section: YearSection }) {
  // The spine + node use the era's accent so the whole column reads as one
  // continuous, colour-coded chronology.
  const eraColor = eraColorFor(section.year);

  return (
    <section
      className="roadmap-era relative pl-8 sm:pl-10"
      style={{ "--era-color": eraColor } as React.CSSProperties}
    >
      {/* Timeline spine — a hairline accent rail running the full height of the
          era, with the node sitting on it. */}
      <span aria-hidden className="roadmap-spine" />
      <span aria-hidden className="roadmap-node" />

      {/* Era header — big display year + mono tagline eyebrow. */}
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="roadmap-year text-3xl sm:text-4xl"
            style={{ color: "var(--era-color)" }}
          >
            {section.year}
          </span>
          <span className="font-mono text-xs text-site-text-muted">
            {section.tagline}
          </span>
        </div>
      </header>

      {/* Milestone grid — staggered into view via the shared motion primitives. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {section.milestones.map((milestone, i) => (
          <div key={`${section.year}-${i}`} className="flex">
            <MilestoneCard title={milestone.title} body={milestone.body} />
          </div>
        ))}
      </div>
    </section>
  );
}
