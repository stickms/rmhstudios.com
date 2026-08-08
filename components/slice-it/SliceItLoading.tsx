'use client';

/**
 * What Slice It shows while its own chunk is still downloading.
 *
 * The route used to hand `GameCanvas`'s `Suspense` the shared
 * `GameLoadingFallback`, which paints a full `h-screen` sheet of `#000000` with
 * a spinner on it — not this game's material, and `h-screen` inside a `flex-1`
 * box overflows the area it is filling.
 *
 * ## Why every class here is copied rather than chosen
 *
 * A skeleton that is merely *tasteful* still makes the page jump: the menu
 * arrives, its bands are a different height from the placeholder's, and
 * everything below shifts. That was visible as a three-stage flicker — cached
 * paint, then a skeleton with its own geometry, then the real layout — where no
 * stage lined up with the next.
 *
 * So the three bands below reuse the **exact class strings** of the real
 * chrome they stand in for:
 *
 * - the header band from `MainMenu`,
 * - the controls band from `SongLibrary`,
 * - the row metrics from `SongLibrary`'s grid item.
 *
 * Same padding, same borders, same control heights ⇒ same band heights ⇒ the
 * chunk landing is a fill-in, not a reflow. If one of those strings changes
 * over there, change it here too; that coupling is the point, and it is cheaper
 * than the alternative, which is a skeleton that silently stops matching.
 *
 * Dependency-free on purpose — no store, no i18n hook, no `ui/` import. This
 * renders *because* the main chunk has not arrived, so anything it pulls in is
 * another module on the critical path to showing it. The one string is
 * `aria-label`-only and reaches assistive tech through `role="status"`.
 */

/** One placeholder row, at the real grid row's metrics (`p-2`, 8/10px art). */
function SkeletonRow() {
  return (
    <li className="p-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-l-4 border-l-transparent">
      <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
        <div className="slice-skeleton h-8 w-8 shrink-0 rounded-full" />
        <div className="slice-skeleton h-10 w-10 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="slice-skeleton h-3.5 w-1/2 max-w-56" />
          <div className="slice-skeleton h-2.5 w-1/3 max-w-40" />
        </div>
      </div>
    </li>
  );
}

export function SliceItLoading() {
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden bg-slice-bg"
      role="status"
      aria-label="Loading Slice It"
    >
      {/* Header band — `MainMenu`'s own classes. */}
      <div className="flex items-center justify-between gap-2 min-w-0 shrink-0 bg-slice-bg px-4 py-3 border-b border-slice-shadow-dark/50">
        <div className="flex min-w-0 items-center gap-3">
          <div className="slice-skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="hidden min-w-0 space-y-1.5 [@media(min-width:640px)_and_(min-height:620px)]:block">
            <div className="slice-skeleton h-2.5 w-24" />
            <div className="slice-skeleton h-3.5 w-32" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <div className="slice-skeleton h-10 w-10 [@media(min-width:640px)_and_(min-height:620px)]:w-36" />
          <div className="slice-skeleton h-10 w-10 [@media(min-width:640px)_and_(min-height:620px)]:w-28" />
          <div className="slice-skeleton h-10 w-10 [@media(min-width:640px)_and_(min-height:620px)]:w-32" />
          <div className="slice-skeleton h-10 w-10" />
          <div className="slice-skeleton h-10 w-10" />
        </div>
      </div>

      {/* Controls band — `SongLibrary`'s own classes, down to the 11.75rem
          view-toggle well whose width is derived over there. */}
      <div className="flex flex-wrap gap-2 items-center shrink-0 p-3 border-b border-slice-shadow-dark/50 bg-slice-bg">
        <div className="relative flex-1 min-w-[10rem]">
          <div className="slice-skeleton h-9 pointer-coarse:h-11 w-full rounded-lg" />
        </div>
        <div className="slice-skeleton h-9 pointer-coarse:h-11 w-28 shrink-0 rounded-lg" />
        <div className="slice-skeleton h-11 w-[11.75rem] shrink-0" />
        <div className="slice-skeleton h-9 w-9 shrink-0 rounded-lg" />
      </div>

      {/* The list. Enough rows to reach the fold at any height; the container
          clips, so an extra one costs nothing and a missing one leaves a gap
          that reads as "this is all there is". */}
      <ul className="min-h-0 flex-1 divide-y divide-slice-shadow-dark/40 overflow-hidden">
        {Array.from({ length: 9 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </ul>
    </div>
  );
}
