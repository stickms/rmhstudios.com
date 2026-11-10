/** Scoped styles for the timeline spine, nodes, and display type. Every colour
 *  is a `--site-*` token (via `--era-color`), so all themes work. */
export function RoadmapStyles() {
  return (
    <style>{`
      .roadmap-year {
        font-family: var(--site-font-display);
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }

      /* Each era is a self-contained render unit: ~30 of them, so skip layout
         + paint for off-screen eras. The reserved size keeps the scrollbar
         honest before an era is measured. */
      .roadmap-era {
        content-visibility: auto;
        contain-intrinsic-size: auto 320px;
      }

      /* Vertical accent rail down the left of each era, fading out at the tail
         so consecutive eras read as one continuous spine. */
      .roadmap-spine {
        position: absolute;
        left: 6px;
        top: 4px;
        bottom: -48px;
        width: 2px;
        border-radius: 9999px;
        background: linear-gradient(
          to bottom,
          var(--era-color) 0%,
          color-mix(in srgb, var(--era-color) 32%, transparent) 88%,
          transparent 100%
        );
        opacity: 0.55;
      }
      @media (min-width: 640px) {
        .roadmap-spine { left: 9px; }
      }

      /* The era node sitting on the spine, aligned to the display year. */
      .roadmap-node {
        position: absolute;
        left: 0;
        top: 6px;
        height: 14px;
        width: 14px;
        border-radius: 9999px;
        background: var(--era-color);
        box-shadow:
          0 0 0 4px color-mix(in srgb, var(--era-color) 18%, transparent),
          var(--site-shadow-site-sm);
      }
      @media (min-width: 640px) {
        .roadmap-node { left: 3px; }
      }

      /* Milestone panes use the shared optical hover response. */
      .roadmap-card { width: 100%; }
    `}</style>
  );
}
