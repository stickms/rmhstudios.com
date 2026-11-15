/**
 * The drawn parts of Half-Life 2's and Portal's menus (SourceMainMenu.tsx, SourceLoadingScreen.tsx): the
 * backdrop that stands behind the game's own console background (and in for it until that channel is
 * published) and the small pictograms of the dialogs. All of it is decoration — `aria-hidden`, no motion
 * of its own beyond the one slow push-in of the picture (source-menu.css).
 *
 * Half-Life 2: the grey smog of City 17 with the Citadel's spire over the skyline and an orange crowbar.
 * Portal: a spotless chamber of white panels with a blue and an orange portal ring at its edges.
 */
import type { SpGameId } from '@/lib/sp-game/client/sp-save';

/** The per-game logo (public/images/games/logos); it carries its own outline, so it reads on any ground. */
export const SOURCE_LOGOS: Record<
  SpGameId,
  string
> =
  {
    hl2: '/images/games/logos/half-life-2.svg',
    portal:
      '/images/games/logos/portal.svg',
  };

/** A skyline of blocky towers between `lo` and `hi` units tall on a 1600-wide scene (a fixed, seeded run). */
function skyline(
  seed: number,
  floor: number,
  lo: number,
  hi: number,
): string {
  let x = 0;
  let r =
    seed;
  const next =
    () =>
      (r =
        (r *
          1664525 +
          1013904223) %
        4294967296) /
      4294967296;
  let d = `M0 ${floor + 400}V${floor - lo}`;
  while (
    x <
    1600
  ) {
    const w =
      34 +
      Math.floor(
        next() *
          70,
      );
    const h =
      Math.round(
        lo +
          next() *
            (hi -
              lo),
      );
    d += `H${x}V${floor - h}H${x + w}`;
    x +=
      w;
  }
  return `${d}V${floor + 400}Z`;
}
const FAR =
  skyline(
    7,
    700,
    40,
    150,
  );
const MID =
  skyline(
    23,
    740,
    30,
    120,
  );
const NEAR =
  skyline(
    91,
    800,
    20,
    70,
  );

function Citadel() {
  return (
    <svg
      className="gui-citadel"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMaxYMax slice"
      focusable="false"
    >
      <defs>
        <radialGradient
          id="gui-core"
          cx="0.5"
          cy="0.5"
          r="0.5"
        >
          <stop
            offset="0"
            stopColor="#f26a1b"
            stopOpacity="0.55"
          />
          <stop
            offset="1"
            stopColor="#f26a1b"
            stopOpacity="0"
          />
        </radialGradient>
        <linearGradient
          id="gui-fog"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0"
            stopColor="#8a8d7c"
            stopOpacity="0"
          />
          <stop
            offset="1"
            stopColor="#8a8d7c"
            stopOpacity="0.42"
          />
        </linearGradient>
      </defs>
      <path
        d={
          FAR
        }
        fill="#3a3d34"
      />
      <rect
        x="0"
        y="560"
        width="1600"
        height="200"
        fill="url(#gui-fog)"
      />
      {/* the Citadel: a needle over a pod, a stepped body and its flanking spires */}
      <g
        fill="#171814"
        stroke="#4a4d41"
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="M1128 760 1146 520 1152 390 1158 250 1166 120 1180 0 1194 120 1202 250 1208 390 1214 520 1232 760z" />
        <path d="M1180 250l40 40 4 70-24 34-20 8-20-8-24-34 4-70z" />
        <path d="M1060 760l34-250 20-120 6 380zM1300 760l-34-250-20-120-6 380z" />
        <path d="M1000 760l24-190 16-70 10 260zM1360 760l-24-190-16-70-10 260z" />
      </g>
      <ellipse
        cx="1180"
        cy="330"
        rx="150"
        ry="170"
        fill="url(#gui-core)"
      />
      <path
        d={
          MID
        }
        fill="#1c1d19"
      />
      <rect
        x="0"
        y="640"
        width="1600"
        height="260"
        fill="url(#gui-fog)"
      />
      <path
        d={
          NEAR
        }
        fill="#0e0f0c"
      />
      {/* the crowbar, leaning at the foot of the skyline */}
      <g
        transform="translate(1420 560) rotate(18)"
        fill="#f26a1b"
      >
        <path d="M0 0h10l2 220H-2z" />
        <path d="M-1 0C-6-18 4-34 20-36l5 9c-9 3-12 11-9 27z" />
        <path
          d="M-2 220h14l-2 16-10-3z"
          fill="#b94a0f"
        />
      </g>
    </svg>
  );
}

function PortalRings() {
  return (
    <>
      <span className="gui-ring gui-ring-blue" />
      <span className="gui-ring gui-ring-orange" />
    </>
  );
}

/** The backdrop: the game's console background over a drawn scene, and the game's own decoration. */
export function SourceBackdrop({
  game,
  src,
}: {
  game: SpGameId;
  src:
    | string
    | null;
}) {
  return (
    <div
      className="gui-backdrop"
      aria-hidden
    >
      <div className="gui-scene">
        {game ===
        'hl2' ? (
          <Citadel />
        ) : null}
      </div>
      {src ? (
        <img
          className="gui-background"
          src={
            src
          }
          alt=""
          onError={(
            e,
          ) =>
            (e.currentTarget.hidden = true)
          }
        />
      ) : null}
      {game ===
      'portal' ? (
        <PortalRings />
      ) : null}
      <div className="gui-vignette" />
    </div>
  );
}

/** The mark of a dialog's title bar: Half-Life's lambda, Portal's pair of rings. */
export function SourceGlyph({
  game,
}: {
  game: SpGameId;
}) {
  return game ===
    'hl2' ? (
    <svg
      className="gui-glyph"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        d="M5 3h5.5L19 21M13.2 11.6 5.5 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  ) : (
    <svg
      className="gui-glyph gui-glyph-rings"
      viewBox="0 0 28 24"
      aria-hidden
      focusable="false"
    >
      <ellipse
        className="gui-glyph-blue"
        cx="8"
        cy="12"
        rx="5"
        ry="8.5"
        fill="none"
        strokeWidth="2.4"
      />
      <ellipse
        className="gui-glyph-orange"
        cx="20"
        cy="12"
        rx="5"
        ry="8.5"
        fill="none"
        strokeWidth="2.4"
      />
    </svg>
  );
}

/** What a chapter without a picture shows: the lambda, or Portal's test-subject pictogram. */
export function ChapterArt({
  game,
}: {
  game: SpGameId;
}) {
  return game ===
    'hl2' ? (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        d="M5 3h5.5L19 21M13.2 11.6 5.5 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle
          cx="12"
          cy="5"
          r="2.4"
        />
        <path d="M12 8.6v6.2M12 10.2l-4.4 3.2M12 10.2l4.4 3.2M12 14.8 8.6 21M12 14.8 15.4 21" />
      </g>
    </svg>
  );
}
