/**
 * The "Today" column before its summary lands: two blocks of static rows shaped like the real ones (a heading bar, then
 * rows of a disc or crest, a name and a count), so the column has its final frame from the server HTML and nothing
 * shifts when the data replaces it. No shimmer (R5).
 */
export function TodaySkeleton() {
  return (
    <div className="medapp-today__blocks" aria-hidden="true" data-today-skeleton="">
      {[5, 5].map((rows, b) => (
        <div key={b} className="medapp-today__block">
          <span className="medapp-skeleton h-4 w-44 max-w-full" />
          <ul className="medapp-rows">
            {Array.from({ length: rows }, (_, i) => (
              <li key={i} className="medapp-today__item medapp-today__row">
                <span className="medapp-skeleton medapp-skeleton--disc" />
                <span className="medapp-skeleton h-3 w-32 max-w-full" />
                <span className="medapp-skeleton ms-auto h-3 w-6" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
