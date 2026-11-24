/**
 * The rail's list before its first page: eight static rows shaped like the real ones (crest, two lines, the time), so
 * the column has its final shape from the server HTML and nothing shifts when the rows land. No shimmer (R5).
 */
export function RailSkeleton() {
  return (
    <ul className="medapp-rows" aria-hidden="true" data-rail-skeleton="">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="medapp-row medapp-liverow medapp-row--compact">
          <span className="medapp-skeleton medapp-skeleton--crest" />
          <span className="medapp-row__body medapp-skeleton-lines">
            <span className="medapp-skeleton h-4 w-40 max-w-full" />
            <span className="medapp-skeleton h-3 w-24 max-w-full" />
          </span>
          <span className="medapp-skeleton h-3 w-14" />
        </li>
      ))}
    </ul>
  );
}
