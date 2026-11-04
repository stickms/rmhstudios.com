/**
 * The drawn parts of CS:GO's menu (CsMainMenu.tsx, CsLoadingScreen.tsx): the Dust II scene that stands
 * behind the game's own background movie or screenshot (and in for it until the `csgo-menu` channel is
 * published) — a dimmed sandstone arch under a pale sun with an orange crosshair. Decoration only:
 * `aria-hidden`, still.
 */

/** The game's logo (public/images/games/logos); it carries its own outline, so it reads on any ground. */
export const CS_LOGO = '/images/games/logos/csgo.svg';

export function CsScene() {
  return (
    <svg
      className="pano-scene"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="pano-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#52697c" />
          <stop offset="0.55" stopColor="#a8a086" />
          <stop offset="1" stopColor="#c4a470" />
        </linearGradient>
        <radialGradient id="pano-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3d0" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff3d0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#pano-sky)" />
      <circle cx="1230" cy="250" r="240" fill="url(#pano-sun)" />
      {/* the far wall and its towers */}
      <path
        d="M700 620V400h60v-40h50v40h80v-70h60v70h110v-30h50v30h120v-50h60v50h80v-30h60v30h170v250z"
        fill="#b08e5c"
      />
      <path d="M700 620V470h90v-40h60v40h100v-60h70v60h120v-30h60v30h400v150z" fill="#98784a" />
      {/* the arch */}
      <g fill="#8c6c42">
        <path d="M980 900V520a170 170 0 0 1 340 0V900h-90V560a80 80 0 0 0-160 0V900z" />
        <path
          d="M940 900V500a210 210 0 0 1 420 0V900h-40V520a170 170 0 0 0-340 0V900z"
          fill="#74573a"
        />
      </g>
      {/* the sand in front */}
      <path d="M0 900V690c240-30 480-10 700 20s560 20 900-20V900z" fill="#7a5d3a" />
      <path d="M0 900V790c300-20 600 0 900 20s500 0 700-20V900z" fill="#5e4629" />
      {/* the crosshair */}
      <g stroke="#f28c28" strokeWidth="4" strokeLinecap="square" opacity="0.9">
        <path d="M1150 500v-34M1150 560v34M1090 530h-34M1210 530h34" />
      </g>
      <circle cx="1150" cy="530" r="3" fill="#f28c28" opacity="0.9" />
    </svg>
  );
}
