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
         honest before an era is measured. content-visibility implies paint
         containment, which CLIPS anything outside the era's own box, so
         nothing here may reach past it: the node and its ring sit inside the
         left padding, and the gap between eras is the era's own bottom
         padding (not a margin or a spine that overhangs), so the spines of
         consecutive eras meet. */
      .roadmap-era {
        content-visibility: auto;
        contain-intrinsic-size: auto 320px;
        padding-block-end: 40px;
      }

      /* Vertical accent rail down the left of each era, solid and running the
         whole box, so consecutive eras read as one continuous spine. */
      .roadmap-spine {
        position: absolute;
        left: 10px;
        top: 0;
        bottom: 0;
        width: 2px;
        border-radius: 9999px;
        background: var(--era-color);
        opacity: 0.55;
      }
      @media (min-width: 640px) {
        .roadmap-spine { left: 13px; }
      }
      /* The last era ends on its node rather than trailing a rail into nothing. */
      .roadmap-era:last-of-type .roadmap-spine {
        bottom: auto;
        height: 20px;
      }

      /* The era node sitting on the spine, aligned to the display year. 4px of
         room on the left holds its 4px ring, so the circle is whole. */
      .roadmap-node {
        position: absolute;
        left: 4px;
        top: 6px;
        height: 14px;
        width: 14px;
        border-radius: 9999px;
        background: var(--era-color);
        outline: 4px solid color-mix(in srgb, var(--era-color) 18%, transparent);
      }
      @media (min-width: 640px) {
        .roadmap-node { left: 7px; }
      }

      /* Milestone panes use the shared optical hover response. */
      .roadmap-card { width: 100%; }
    `}</style>
  );
}
