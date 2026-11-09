/**
 * House Always Wins — main menu.
 *
 * The banner art is the ground; every live layer (marquee bulbs, neon sign,
 * the Dealer's eyes, teeth gleam, glitter) is drawn in the banner's own
 * 3840x1280 coordinates so it stays glued to the art at any size. Hovering or
 * focusing a button wakes the Dealer: Play lights the mouth and makes the
 * teeth ting, Quit narrows his eyes. All ambient motion is transform/opacity.
 *
 * Wiring (see HouseAlwaysWinsGame): `onPlay` starts or resumes the engine,
 * Quit goes through `useQuitGame` and is the only exit to /games.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Music, Music2, Volume2, VolumeX } from "lucide-react";
import { useQuitGame } from "@/hooks/useQuitGame";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MusicManager } from "@/lib/house-always-wins/music";
import { SfxManager } from "@/lib/house-always-wins/sfx";
import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import "./haw-menu.css";

type ItemId = "play" | "continue" | "new" | "help" | "quit";

/* ── Banner geometry (original pixels of the 3840x1280 banner) ───────────── */

const BANNER_W = 3840;
const BANNER_H = 1280;
const ARCH = { cx: 2568, cy: 602, rx: 390, ry: 403, base: 800 };
const SIGN = { x: 2435, y: 170, w: 270, h: 88 };
const BULB_PITCH = 52;

/** Bulb positions spaced evenly (by arc length) along the arch, sides included. */
function archBulbs(): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const { cx, cy, rx, ry, base } = ARCH;
  // Dense polyline: left post up, half-ellipse over the top, right post down.
  const poly: Array<{ x: number; y: number }> = [];
  for (let y = base; y >= cy; y -= 2) poly.push({ x: cx - rx, y });
  for (let a = Math.PI; a >= 0; a -= 0.004) {
    poly.push({ x: cx + rx * Math.cos(a), y: cy - ry * Math.sin(a) });
  }
  for (let y = cy; y <= base; y += 2) poly.push({ x: cx + rx, y });

  let acc = BULB_PITCH * 0.5;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    acc += d;
    if (acc >= BULB_PITCH) {
      acc -= BULB_PITCH;
      const p = poly[i];
      const underSign =
        p.x > SIGN.x - 18 && p.x < SIGN.x + SIGN.w + 18 && p.y > SIGN.y - 30 && p.y < SIGN.y + SIGN.h + 20;
      if (!underSign) pts.push(p);
    }
  }
  return pts;
}

const BULBS = archBulbs();

/** Glitter spots: cards, chips, dice, the slot machine's gem, teeth tips. */
const SPARKLES: Array<{ x: number; y: number; s: number; d: number }> = [
  { x: 1745, y: 372, s: 1, d: 0.2 },
  { x: 1890, y: 410, s: 0.8, d: 2.6 },
  { x: 1935, y: 515, s: 0.7, d: 4.1 },
  { x: 2237, y: 770, s: 0.9, d: 1.4 },
  { x: 2340, y: 815, s: 0.7, d: 3.3 },
  { x: 3420, y: 790, s: 0.9, d: 0.9 },
  { x: 3535, y: 780, s: 0.8, d: 4.8 },
  { x: 3290, y: 800, s: 0.7, d: 2.1 },
  { x: 3075, y: 200, s: 1, d: 3.6 },
];

const TINGS: Array<{ x: number; y: number; d: number }> = [
  { x: 2603, y: 722, d: 0 },
  { x: 2669, y: 722, d: 0.08 },
  { x: 2736, y: 722, d: 0.16 },
  { x: 2870, y: 722, d: 0.24 },
];

const SPARKLE_PATH = "M0 -30 Q3 -3 30 0 Q3 3 0 30 Q-3 3 -30 0 Q-3 -3 0 -30Z";

/** Deterministic gold motes (no Math.random: stable between renders). */
const MOTES = Array.from({ length: 24 }, (_, i) => {
  const k = (i * 7919) % 97;
  return {
    x: `${(k * 1.03) % 100}%`,
    s: `${2 + ((i * 5) % 4)}px`,
    dur: `${11 + ((i * 3) % 9)}s`,
    dl: `${-((i * 1.7) % 16)}s`,
    dx: `${((i % 5) - 2) * 14}px`,
  };
});

/* ── Small drawn props that float over the room ──────────────────────────── */

function Chip({ fill, rim }: { fill: string; rim: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="30" fill={fill} />
      <circle cx="32" cy="32" r="30" fill="none" stroke="#fff6dc" strokeWidth="7" strokeDasharray="10 10" opacity="0.9" />
      <circle cx="32" cy="32" r="20" fill={rim} stroke="#fff6dc" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.95" />
      <circle cx="32" cy="32" r="11" fill={fill} opacity="0.85" />
    </svg>
  );
}

function Card({ glyph, red }: { glyph: string; red: boolean }) {
  const ink = red ? "#c8203c" : "#1b1218";
  return (
    <svg viewBox="0 0 50 70" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="47" height="67" rx="6" fill="#f3e6c4" stroke="#b8791b" strokeWidth="1.5" />
      <text x="8" y="17" fontSize="13" fontWeight="700" fill={ink} fontFamily="Georgia, serif">
        {glyph}
      </text>
      <text x="25" y="45" fontSize="30" textAnchor="middle" fill={ink} fontFamily="Georgia, serif">
        {glyph}
      </text>
    </svg>
  );
}

type Floater = {
  key: string;
  x: string;
  y: string;
  w: string;
  r0: string;
  r1: string;
  dur: string;
  dl: string;
  side: "left" | "right";
  node: React.ReactNode;
};

const FLOATERS: Floater[] = [
  { key: "c1", x: "6%", y: "36%", w: "clamp(30px, 8cqw, 54px)", r0: "-12deg", r1: "8deg", dur: "7s", dl: "-1s", side: "left", node: <Chip fill="#c8203c" rim="#7c0f22" /> },
  { key: "k1", x: "84%", y: "30%", w: "clamp(34px, 9cqw, 58px)", r0: "14deg", r1: "24deg", dur: "9s", dl: "-4s", side: "left", node: <Card glyph="♠" red={false} /> },
  { key: "c2", x: "88%", y: "62%", w: "clamp(28px, 7cqw, 46px)", r0: "6deg", r1: "-10deg", dur: "8s", dl: "-2s", side: "left", node: <Chip fill="#e5ae33" rim="#a8730f" /> },
  { key: "k2", x: "48%", y: "12%", w: "clamp(34px, 5cqw, 64px)", r0: "-18deg", r1: "-8deg", dur: "10s", dl: "-6s", side: "right", node: <Card glyph="♥" red /> },
  { key: "c3", x: "93%", y: "78%", w: "clamp(32px, 4cqw, 58px)", r0: "10deg", r1: "-6deg", dur: "8.5s", dl: "-3s", side: "right", node: <Chip fill="#1e1a24" rim="#3b3347" /> },
  { key: "c4", x: "52%", y: "80%", w: "clamp(30px, 3.4cqw, 52px)", r0: "-4deg", r1: "12deg", dur: "7.5s", dl: "-5s", side: "right", node: <Chip fill="#e5ae33" rim="#a8730f" /> },
];

/* ── The debt marker ─────────────────────────────────────────────────────── */

const BASE_BALANCE = 1_000_000;

function DebtMarker({ extra }: { extra: number }) {
  const { t } = useTranslation("c-house-always-wins");
  const [accrued, setAccrued] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setAccrued((a) => a + 3 + Math.floor(Math.random() * 12));
    }, 1100);
    return () => window.clearInterval(id);
  }, []);
  const balance = BASE_BALANCE + extra + accrued;
  return (
    <div className="haw-marker haw-in" style={{ "--haw-d": 420 } as React.CSSProperties} aria-hidden="true">
      <span className="haw-marker__tape" />
      <p>{t("main-marker-no", { defaultValue: "Marker No. 0777" })}</p>
      <p>{t("main-marker-due", { defaultValue: "Balance due" })}</p>
      <p className="haw-marker__amt">
        <span key={balance}>${balance.toLocaleString("en-US")}</span>
      </p>
      <p className="haw-marker__fine">
        {t("main-marker-interest", { defaultValue: "Interest compounds nightly" })}
      </p>
    </div>
  );
}

/* ── The menu ────────────────────────────────────────────────────────────── */

interface MainMenuProps {
  /** A run exists (the intro has been seen): the primary action is Continue. */
  hasSave: boolean;
  /** Start or resume the game. */
  onPlay: () => void;
}

export function MainMenu({ hasSave, onPlay }: MainMenuProps) {
  const { t } = useTranslation("c-house-always-wins");
  const quit = useQuitGame();
  const confirm = useConfirm();
  const debt = useHouseAlwaysWinsStore((s) => s.debt);
  const resetRun = useHouseAlwaysWinsStore((s) => s.resetRun);
  const [active, setActive] = useState<ItemId | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [musicMuted, setMusicMuted] = useState(() => MusicManager.isMuted());
  const [sfxMuted, setSfxMuted] = useState(() => SfxManager.isMuted());
  const rootRef = useRef<HTMLDivElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  const primaryId: ItemId = hasSave ? "continue" : "play";

  const items = useMemo(
    () => (el: HTMLElement | null) =>
      Array.from(el?.querySelectorAll<HTMLButtonElement>("[data-haw-item]") ?? []),
    [],
  );

  // Focus the primary action on open (keyboard users land on it; touch shows no ring).
  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>("[data-haw-item='primary']")?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (helpOpen) backRef.current?.focus({ preventScroll: true });
  }, [helpOpen]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    window.setTimeout(() => helpBtnRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  // Arrow keys move between items; Esc closes the help card; Enter on a bare page presses Play.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const root = rootRef.current;
      if (!root) return;
      const focused = document.activeElement;
      const inside = !!focused && root.contains(focused);
      if (!inside && focused && focused !== document.body) return; // a dialog owns focus
      if (helpOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeHelp();
        }
        return;
      }
      const list = items(root);
      const idx = list.findIndex((b) => b === focused);
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        const next = idx < 0 ? (dir === 1 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
        list[next]?.focus({ preventScroll: true });
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        list[e.key === "Home" ? 0 : list.length - 1]?.focus({ preventScroll: true });
      } else if (e.key === "Enter" && idx < 0) {
        e.preventDefault();
        onPlay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen, items, closeHelp, onPlay]);

  const newGame = async () => {
    const ok = await confirm({
      title: t("menu-abandon-confirm", { defaultValue: "Abandon this run? All progress, keys and chips are lost." }),
      danger: true,
    });
    if (ok) {
      resetRun();
      window.location.reload();
    }
  };

  const toggleMusic = () => {
    const m = !MusicManager.isMuted();
    MusicManager.setMuted(m);
    setMusicMuted(m);
  };
  const toggleSfx = () => {
    const m = !SfxManager.isMuted();
    SfxManager.setMuted(m);
    setSfxMuted(m);
    if (!m) SfxManager.play("ui");
  };

  // The first, programmatic focus on open should not wake the Dealer by itself.
  const armed = useRef(false);
  useEffect(() => {
    const id = window.setTimeout(() => (armed.current = true), 400);
    return () => window.clearTimeout(id);
  }, []);

  const hoverProps = (id: ItemId) => ({
    onPointerEnter: () => setActive(id),
    onPointerLeave: () => setActive((a) => (a === id ? null : a)),
    onFocus: () => {
      if (armed.current) setActive(id);
    },
    onBlur: () => setActive((a) => (a === id ? null : a)),
  });

  const inDelay = (ms: number) => ({ "--haw-d": ms }) as React.CSSProperties;

  return (
    <div ref={rootRef} className="haw-menu" data-jelly="off" data-jelly-scope="off">
      <div className="haw-stage" data-active={active ?? undefined}>
        <div className="haw-ground" aria-hidden="true" />

        {/* The banner, with live layers in its own coordinates. */}
        <div className="haw-scene" aria-hidden="true">
          <img
            className="haw-scene__img"
            src="/images/games/banners/house-always-wins.webp"
            alt=""
            draggable={false}
            decoding="async"
          />
          <svg className="haw-scene__fx" viewBox={`0 0 ${BANNER_W} ${BANNER_H}`} preserveAspectRatio="none" focusable="false">
            <defs>
              <radialGradient id="haw-g-bulb">
                <stop offset="0" stopColor="#fff2b8" stopOpacity="0.95" />
                <stop offset="0.4" stopColor="#ffd05a" stopOpacity="0.55" />
                <stop offset="1" stopColor="#ffb830" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="haw-g-mouth">
                <stop offset="0" stopColor="#ff8a4a" stopOpacity="0.85" />
                <stop offset="0.45" stopColor="#ff3d5a" stopOpacity="0.4" />
                <stop offset="1" stopColor="#ff3d5a" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="haw-g-sign">
                <stop offset="0" stopColor="#ffe48a" stopOpacity="0.55" />
                <stop offset="1" stopColor="#ffd05a" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="haw-g-eye">
                <stop offset="0" stopColor="#fff" stopOpacity="1" />
                <stop offset="0.35" stopColor="#ff8da0" stopOpacity="0.9" />
                <stop offset="1" stopColor="#ff2d55" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Light inside the mouth, behind the Dealer. */}
            <ellipse className="haw-mouth" cx="2570" cy="640" rx="380" ry="330" fill="url(#haw-g-mouth)" />

            {/* The Dealer, redrawn flat black so the mouth light can sit under him. */}
            <g transform="translate(2150 150)" fill="#000" stroke="#000" strokeWidth="5" strokeLinejoin="round">
              <ellipse cx="320" cy="418" rx="81" ry="17" />
              <path d="M283 408 C283 380 292 358 320 357 C348 358 357 380 357 408 Z" />
              <circle cx="320" cy="452" r="31" />
              <rect x="262" y="478" width="116" height="197" rx="50" />
              <path d="M283 410 L357 410 L357 398 L283 398 Z" fill="#7e1830" stroke="none" />
            </g>

            {/* His eyes open when a button is lit. */}
            <g className="haw-eyes">
              {[2458, 2482].map((x) => (
                <g key={x}>
                  <circle cx={x} cy={604} r="15" fill="url(#haw-g-eye)" />
                  <ellipse className="haw-eye" cx={x} cy={604} rx="5.5" ry="5" fill="#fff4f4" />
                  <circle className="haw-pupil" cx={x} cy={604} r="2.4" fill="#2a0008" />
                </g>
              ))}
            </g>

            {/* Marquee bulbs chasing round the arch. */}
            {BULBS.map((b, i) => (
              <g key={i} style={{ "--i": i } as React.CSSProperties}>
                <circle className="haw-bulb__glow" cx={b.x} cy={b.y} r="19" fill="url(#haw-g-bulb)" />
                <circle className="haw-bulb__core" cx={b.x} cy={b.y} r="4.5" fill="#fff6cf" />
              </g>
            ))}

            {/* CASINO sign neon. */}
            <g className="haw-sign">
              <rect x={SIGN.x - 26} y={SIGN.y - 22} width={SIGN.w + 52} height={SIGN.h + 44} rx="44" fill="url(#haw-g-sign)" />
            </g>

            {/* Slot machine: reel flicker and the dome gem. */}
            {[
              { x: 3020, d: "0s" },
              { x: 3078, d: "-1.1s" },
              { x: 3128, d: "-2.1s" },
            ].map((r) => (
              <rect key={r.x} className="haw-reel" x={r.x} y="322" width="44" height="84" rx="8" fill="#fff0b0" style={{ "--d": r.d } as React.CSSProperties} />
            ))}
            <circle className="haw-gem" cx="3085" cy="190" r="26" fill="url(#haw-g-bulb)" />

            {/* Glitter on cards, chips and dice. */}
            {SPARKLES.map((s, i) => (
              <g key={i} transform={`translate(${s.x} ${s.y}) scale(${s.s})`}>
                <path className="haw-sparkle" d={SPARKLE_PATH} fill="#fff6cf" style={{ "--d": `${s.d}s` } as React.CSSProperties} />
              </g>
            ))}

            {/* A ting along the teeth when Play is lit. */}
            {TINGS.map((s, i) => (
              <g key={i} transform={`translate(${s.x} ${s.y})`}>
                <path className="haw-ting" d={SPARKLE_PATH} fill="#fffbe6" style={{ "--d": `${s.d}s` } as React.CSSProperties} />
              </g>
            ))}
          </svg>
        </div>

        <div className="haw-scrim" aria-hidden="true" />

        <div className="haw-motes" aria-hidden="true">
          {MOTES.map((m, i) => (
            <span
              key={i}
              className="haw-mote"
              style={{ "--x": m.x, "--s": m.s, "--dur": m.dur, "--dl": m.dl, "--dx": m.dx } as React.CSSProperties}
            />
          ))}
        </div>

        <div className="haw-floaters" aria-hidden="true">
          {FLOATERS.map((f) => (
            <div
              key={f.key}
              className="haw-floater"
              data-side={f.side}
              style={{ "--x": f.x, "--y": f.y, "--w": f.w, "--r0": f.r0, "--r1": f.r1, "--dur": f.dur, "--dl": f.dl } as React.CSSProperties}
            >
              {f.node}
            </div>
          ))}
        </div>

        <div className="haw-sound" inert={helpOpen}>
          <button
            type="button"
            className="haw-btn haw-btn--ghost"
            data-muted={musicMuted}
            aria-pressed={musicMuted}
            aria-label={
              musicMuted
                ? t("menu-unmute-music", { defaultValue: "Unmute music" })
                : t("menu-mute-music", { defaultValue: "Mute music" })
            }
            onClick={toggleMusic}
          >
            <span className="haw-btn__glow" aria-hidden="true" />
            {musicMuted ? <Music2 aria-hidden="true" /> : <Music aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="haw-btn haw-btn--ghost"
            data-muted={sfxMuted}
            aria-pressed={sfxMuted}
            aria-label={
              sfxMuted
                ? t("menu-unmute-sfx", { defaultValue: "Unmute sound effects" })
                : t("menu-mute-sfx", { defaultValue: "Mute sound effects" })
            }
            onClick={toggleSfx}
          >
            <span className="haw-btn__glow" aria-hidden="true" />
            {sfxMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
        </div>

        <div className="haw-content app-screen" inert={helpOpen}>
          <h1 className="haw-logo haw-in" style={inDelay(80)}>
            <img
              className="haw-logo__img"
              src="/images/games/logos/house-always-wins.svg"
              alt={t("main-logo-alt", { defaultValue: "House Always Wins" })}
              width={1120}
              height={415}
              draggable={false}
            />
            <span className="haw-logo__shine" aria-hidden="true" />
          </h1>

          <p className="haw-tagline haw-in" style={inDelay(200)}>
            {t("main-tagline", { defaultValue: "Explore the abandoned Mirage Royale and outwit The House." })}
          </p>

          <DebtMarker extra={debt} />

          <nav className="haw-nav" aria-label={t("main-nav-aria", { defaultValue: "Main menu" })}>
            <div className="haw-in" style={inDelay(300)}>
              <button
                type="button"
                data-haw-item="primary"
                className="haw-btn haw-btn--primary"
                onClick={onPlay}
                {...hoverProps(primaryId)}
              >
                <span className="haw-btn__glow" aria-hidden="true" />
                {hasSave
                  ? t("main-continue", { defaultValue: "Continue" })
                  : t("main-play", { defaultValue: "Play" })}
              </button>
            </div>

            <div className="haw-nav__row haw-in" data-two={hasSave} style={inDelay(380)}>
              {hasSave && (
                <button
                  type="button"
                  data-haw-item="new"
                  className="haw-btn"
                  onClick={newGame}
                  {...hoverProps("new")}
                >
                  <span className="haw-btn__glow" aria-hidden="true" />
                  {t("main-new-game", { defaultValue: "New game" })}
                </button>
              )}
              <button
                ref={helpBtnRef}
                type="button"
                data-haw-item="help"
                className="haw-btn"
                aria-haspopup="dialog"
                onClick={() => setHelpOpen(true)}
                {...hoverProps("help")}
              >
                <span className="haw-btn__glow" aria-hidden="true" />
                {t("main-how-to-play", { defaultValue: "How to play" })}
              </button>
            </div>

            <div className="haw-in" style={inDelay(460)}>
              <button
                type="button"
                data-haw-item="quit"
                className="haw-btn haw-btn--ghost haw-btn--danger"
                onClick={quit}
                {...hoverProps("quit")}
              >
                <span className="haw-btn__glow" aria-hidden="true" />
                {t("main-quit", { defaultValue: "Quit" })}
              </button>
            </div>

            <p className="haw-hint">
              {t("main-keys-hint", { defaultValue: "↑ ↓ to choose · Enter to select" })}
            </p>
          </nav>
        </div>

        {helpOpen && (
          <section className="haw-panel" aria-labelledby="haw-help-title">
            <div className="haw-card">
              <h2 id="haw-help-title">{t("main-help-title", { defaultValue: "How to play" })}</h2>
              <p>
                {t("main-help-goal", {
                  defaultValue:
                    "Explore the Mirage Royale, collect chips to pay down your debt, recover three Vault Keys and face The House.",
                })}
              </p>
              <dl data-keys-only="">
                <dt>{t("menu-ctl-move", { defaultValue: "Move" })}</dt>
                <dd>A/D · ←/→</dd>
                <dt>{t("menu-ctl-jump", { defaultValue: "Jump" })}</dt>
                <dd>Space / K</dd>
                <dt>{t("menu-ctl-dash", { defaultValue: "Dash" })}</dt>
                <dd>Shift / J</dd>
                <dt>{t("menu-ctl-use", { defaultValue: "Interact" })}</dt>
                <dd>E</dd>
                <dt>{t("menu-ctl-drop", { defaultValue: "Drop down" })}</dt>
                <dd>S / ↓</dd>
                <dt>{t("menu-ctl-menu", { defaultValue: "Menu" })}</dt>
                <dd>M / Esc</dd>
              </dl>
              <p data-touch-only="">
                {t("main-help-touch", { defaultValue: "Use the on-screen pad to move, jump, dash and interact." })}
              </p>
              <button ref={backRef} type="button" className="haw-btn haw-btn--primary" onClick={closeHelp}>
                <span className="haw-btn__glow" aria-hidden="true" />
                {t("main-help-back", { defaultValue: "Back" })}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
