import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { hydratedNumberFormat } from "@/lib/access/prefs"
 
/**
 * `rounded-app*` / `shadow-app*` are the app tier's registered theme values
 * (`app/app-theme-tokens.css`). tailwind-merge only knows t-shirt sizes for those
 * namespaces, so without this `cn('rounded-xl', 'rounded-app')` would keep both
 * (the old `rounded-(--app-radius)` arbitrary form was recognised and deduped).
 * Colour utilities (`bg-app-surface`, …) need nothing: any colour value is accepted.
 *
 * The same holds for E2's named steps (app/globals.css, "E2 type scale"): `text-micro` must
 * dedupe against `text-sm` as a font size (not be read as a colour, which would drop an earlier
 * `text-white`), and `z-popover` must replace a dialog's `z-50`, exactly as `text-[10px]` and
 * `z-[100]` did. `lib/__tests__/type-scale-merge.test.ts` keeps these lists equal to the CSS.
 */
export const TYPE_SCALE_STEPS = [
  "pico", "nano", "tiny", "micro", "caption", "body", "body-rem",
  "rem-60", "rem-62", "rem-64", "rem-65", "rem-68", "rem-70", "rem-72",
] as const
export const Z_LAYER_NAMES = [
  "content", "topbar", "hub-overlay", "palette", "popover", "call", "call-dialog",
] as const

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["app", "app-sm", "app-lg"],
      shadow: ["app", "app-sm"],
      text: [...TYPE_SCALE_STEPS],
    },
    classGroups: {
      z: [{ z: [...Z_LAYER_NAMES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compact count formatting: 1500 → "1.5K", 2_000_000 → "2.0M".
 * Returns "0" for zero (use a falsy guard at the call site to hide zero counts).
 */
export function formatCount(count: number): string {
  if (count < 1_000) return String(count)
  const [v, suffix] = count >= 1_000_000 ? [count / 1_000_000, 'M'] : [count / 1_000, 'K']
  // Honours the member's number-format preference (lib/access) once the first
  // client commit is done; SSR and hydration always use the default "1.5K".
  const nf = hydratedNumberFormat()
  if (nf === 'auto') return `${v.toFixed(1)}${suffix}`
  return `${new Intl.NumberFormat(nf, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}${suffix}`
}

/**
 * Short relative time against an EXPLICIT `now` — "5s", "3h", "2d", "4mo".
 *
 * The `now` parameter is the point. A formatter that reads `Date.now()` at
 * render produces a server string and a hydrating client string that can differ
 * by a tick; `components/ui/RelativeTime` exists to fix that by
 * rendering a deterministic fallback first and only formatting once a clock is
 * available after mount. A formatter it can drive has to take the clock as an
 * argument.
 *
 * Pass this to `<RelativeTime format={relativeTimeShort} />` rather than
 * computing a relative string inline. The feed's two card renderers each had
 * their own copy of this function and the copies disagreed — the wheel card
 * stopped at weeks ("5w") where the column card rolled over to months ("1mo"),
 * so one post read as two different ages depending on which surface you were
 * looking at.
 */
export function relativeTimeShort(timestampMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/**
 * Relative time from an epoch-ms timestamp, falling back to a short calendar
 * date (e.g. "Mar 5") once it's older than a day. Used in moderation lists.
 */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
