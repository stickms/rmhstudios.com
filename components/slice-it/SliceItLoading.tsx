'use client';

/**
 * What Slice It shows while its own chunk is still downloading.
 *
 * The route used to hand `GameCanvas`'s `Suspense` the shared
 * `GameLoadingFallback`, which paints a full `h-screen` sheet of `#000000` with
 * a generic spinner on it. Three things were wrong with that here:
 *
 *  1. **It is not this game.** Slice It is one of the two bespoke-identity
 *     surfaces — a soft `#e0e5ec` ground and the `.neumorphic` shadow pair, or
 *     its own dark equivalent. A black sheet is a hard flash of something else
 *     between the header (which paints instantly) and the menu.
 *  2. **`h-screen` inside a `flex-1` box** overflows the area it is filling,
 *     so the sheet ran past the header it was supposed to sit under.
 *  3. **A spinner says "wait", a skeleton says "here is what is coming".**
 *     The menu that arrives is a search row over a list of tracks; drawing that
 *     shape now means the chunk landing is a fill-in rather than a swap, and
 *     the perceived wait is the difference between the two.
 *
 * Deliberately dependency-free — no store, no i18n hook, no `ui/` import. This
 * renders *because* the main chunk has not arrived, so anything it pulls in is
 * another module on the critical path to showing it. The one string is
 * `aria-label`-only and reaches assistive tech through `role="status"`.
 */

/** One placeholder track row: cover tile, two text lines, a control cluster. */
function SkeletonRow({ wide }: { wide: boolean }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="slice-skeleton h-12 w-12 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="slice-skeleton h-3.5 w-1/2 max-w-64" />
        <div className="slice-skeleton h-2.5 w-1/3 max-w-40" />
      </div>
      {wide && (
        <div className="flex shrink-0 gap-2">
          <div className="slice-skeleton h-8 w-8 rounded-full" />
          <div className="slice-skeleton h-8 w-8 rounded-full" />
        </div>
      )}
    </li>
  );
}

export function SliceItLoading() {
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden bg-slice-bg p-4 sm:p-6"
      role="status"
      aria-label="Loading Slice It"
    >
      {/* The menu's own header: identity on the left, controls on the right. */}
      <div className="flex shrink-0 items-center justify-between gap-3 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="slice-skeleton h-10 w-10 rounded-full" />
          <div className="hidden min-w-0 space-y-2 sm:block">
            <div className="slice-skeleton h-2.5 w-20" />
            <div className="slice-skeleton h-3.5 w-32" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <div className="slice-skeleton h-10 w-10 sm:w-28" />
          <div className="slice-skeleton h-10 w-10 sm:w-24" />
          <div className="slice-skeleton h-10 w-10" />
        </div>
      </div>

      {/* Search row. */}
      <div className="slice-skeleton h-11 w-full shrink-0 rounded-2xl" />

      {/* The list. Enough rows to reach the fold at any height; the container
          clips, so an extra one costs nothing and a missing one leaves a gap
          that reads as "this is all there is". */}
      <ul className="mt-4 min-h-0 flex-1 divide-y divide-slice-shadow-dark/30 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonRow key={i} wide={i % 3 !== 2} />
        ))}
      </ul>
    </div>
  );
}
