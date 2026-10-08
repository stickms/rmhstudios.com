'use client';

/**
 * The desktop's icon set — glossy, Aero-era, drawn as SVG so it is crisp at
 * every size and needs no image assets. Each icon gets its own gradient ids
 * (`useId`) so two copies on screen never share a <defs> by accident.
 *
 * Decorative by default (`aria-hidden`): every place an icon appears also
 * carries a text label.
 */

import { useId, type ReactNode } from 'react';

export type IconName =
  | 'computer'
  | 'drive'
  | 'folder'
  | 'folder-docs'
  | 'folder-pics'
  | 'folder-music'
  | 'folder-videos'
  | 'folder-downloads'
  | 'folder-user'
  | 'film'
  | 'film-watched'
  | 'series'
  | 'txt'
  | 'image'
  | 'file'
  | 'recycle-empty'
  | 'recycle-full'
  | 'planner'
  | 'calendar'
  | 'messenger'
  | 'sync'
  | 'player'
  | 'notepad'
  | 'paint'
  | 'photos'
  | 'calculator'
  | 'cmd'
  | 'taskmgr'
  | 'ie'
  | 'minesweeper'
  | 'solitaire'
  | 'spider'
  | 'personalize'
  | 'aquarium'
  | 'about'
  | 'run'
  | 'welcome'
  | 'link'
  | 'warning'
  | 'info'
  | 'error'
  | 'question'
  | 'lock'
  | 'shield';

function Gloss({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
      <stop offset="0.5" stopColor="#fff" stopOpacity="0.15" />
      <stop offset="0.51" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
  );
}

function Grad({
  id,
  a,
  b,
  x2 = 0,
  y2 = 1,
}: {
  id: string;
  a: string;
  b: string;
  x2?: number;
  y2?: number;
}) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );
}

function Folder({ u, tint, badge }: { u: string; tint?: [string, string]; badge?: ReactNode }) {
  const [a, b] = tint ?? ['#ffe28a', '#f2b632'];
  return (
    <>
      <defs>
        <Grad id={`${u}b`} a="#f7cf5a" b="#d99a1a" />
        <Grad id={`${u}f`} a={a} b={b} />
        <Gloss id={`${u}g`} />
      </defs>
      <path
        d="M4 12 h16 l4 4 h36 v38 a4 4 0 0 1 -4 4 H8 a4 4 0 0 1 -4 -4 Z"
        fill={`url(#${u}b)`}
        stroke="#b07a10"
        strokeWidth="1"
      />
      <rect x="8" y="18" width="48" height="10" rx="2" fill="#fff" opacity="0.9" />
      <path
        d="M2 26 h60 l-4 30 a4 4 0 0 1 -4 3.5 H10 a4 4 0 0 1 -4 -3.5 Z"
        fill={`url(#${u}f)`}
        stroke="#c08a1a"
        strokeWidth="1"
      />
      <path d="M2 26 h60 l-1.5 12 H3.5 Z" fill={`url(#${u}g)`} />
      {badge}
    </>
  );
}

function Doc({
  u,
  lines = true,
  fold = '#dfe8f1',
  children,
}: {
  u: string;
  lines?: boolean;
  fold?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <defs>
        <Grad id={`${u}p`} a="#ffffff" b="#e6edf4" />
      </defs>
      <path d="M12 4 h28 l14 14 v42 H12 Z" fill={`url(#${u}p)`} stroke="#8ea4bb" />
      <path d="M40 4 v14 h14" fill={fold} stroke="#8ea4bb" />
      {lines &&
        [26, 32, 38, 44, 50].map((y) => (
          <rect key={y} x="18" y={y} width={y === 50 ? 20 : 30} height="2" fill="#9fb4c9" />
        ))}
      {children}
    </>
  );
}

function Orb({ u, a, b, children }: { u: string; a: string; b: string; children?: ReactNode }) {
  return (
    <>
      <defs>
        <radialGradient id={`${u}o`} cx="50%" cy="35%" r="65%">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </radialGradient>
        <Gloss id={`${u}g`} />
      </defs>
      <circle cx="32" cy="32" r="27" fill={`url(#${u}o)`} stroke="rgba(0,0,0,.25)" />
      {children}
      <ellipse cx="32" cy="20" rx="20" ry="11" fill={`url(#${u}g)`} />
    </>
  );
}

function Tile({ u, a, b, children }: { u: string; a: string; b: string; children?: ReactNode }) {
  return (
    <>
      <defs>
        <Grad id={`${u}t`} a={a} b={b} />
        <Gloss id={`${u}g`} />
      </defs>
      <rect
        x="6"
        y="6"
        width="52"
        height="52"
        rx="10"
        fill={`url(#${u}t)`}
        stroke="rgba(0,0,0,.3)"
      />
      {children}
      <rect x="7" y="7" width="50" height="24" rx="9" fill={`url(#${u}g)`} />
    </>
  );
}

function body(name: IconName, u: string): ReactNode {
  switch (name) {
    case 'computer':
      return (
        <>
          <defs>
            <Grad id={`${u}s`} a="#4fb0ff" b="#0b4f9c" />
            <Grad id={`${u}c`} a="#e9eef3" b="#9aa8b6" />
          </defs>
          <rect x="6" y="8" width="52" height="36" rx="3" fill={`url(#${u}c)`} stroke="#5b6b7b" />
          <rect x="10" y="12" width="44" height="28" fill={`url(#${u}s)`} />
          <path d="M10 12 h44 v10 C 40 18 24 26 10 22 Z" fill="#fff" opacity="0.35" />
          <path d="M24 44 h16 l3 8 H21 Z" fill="#8a99a8" />
          <rect x="16" y="52" width="32" height="5" rx="2" fill={`url(#${u}c)`} stroke="#5b6b7b" />
        </>
      );
    case 'drive':
      return (
        <>
          <defs>
            <Grad id={`${u}d`} a="#eef2f6" b="#9eabb8" />
          </defs>
          <rect x="6" y="20" width="52" height="26" rx="4" fill={`url(#${u}d)`} stroke="#66768a" />
          <rect x="44" y="36" width="8" height="3" rx="1.5" fill="#39d353" />
          <rect x="10" y="24" width="44" height="6" rx="3" fill="#fff" opacity="0.6" />
          <path d="M14 38 l4 -4 4 4 4 -4" stroke="#1a7fd0" strokeWidth="2" fill="none" />
        </>
      );
    case 'folder':
      return <Folder u={u} />;
    case 'folder-docs':
      return (
        <Folder
          u={u}
          badge={<rect x="22" y="32" width="20" height="22" rx="2" fill="#fff" stroke="#8ea4bb" />}
        />
      );
    case 'folder-pics':
      return (
        <Folder
          u={u}
          badge={
            <>
              <rect
                x="20"
                y="32"
                width="24"
                height="18"
                rx="2"
                fill="#7cc9ff"
                stroke="#fff"
                strokeWidth="2"
              />
              <path d="M20 46 l7 -7 6 5 4 -3 7 7 Z" fill="#4cbf33" />
            </>
          }
        />
      );
    case 'folder-music':
      return (
        <Folder
          u={u}
          badge={
            <path
              d="M28 50 a4 4 0 1 1 0 -0.1 V34 l12 -3 v15 a4 4 0 1 1 0 -0.1 V36 l-8 2 Z"
              fill="#1a6fc4"
            />
          }
        />
      );
    case 'folder-videos':
      return (
        <Folder
          u={u}
          badge={
            <>
              <rect x="20" y="33" width="24" height="17" rx="2" fill="#203040" />
              {[22, 27, 32, 37].map((x) => (
                <rect key={x} x={x} y="35" width="3" height="2" fill="#fff" />
              ))}
              <path d="M29 39 l7 4 -7 4 Z" fill="#ffd23d" />
            </>
          }
        />
      );
    case 'folder-downloads':
      return (
        <Folder
          u={u}
          badge={
            <path
              d="M32 32 v14 m-6 -6 l6 6 6 -6"
              stroke="#2f9a2a"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
          }
        />
      );
    case 'folder-user':
      return (
        <Folder
          u={u}
          badge={
            <>
              <circle cx="32" cy="37" r="5" fill="#2a6aa8" />
              <path d="M22 52 a10 8 0 0 1 20 0 Z" fill="#2a6aa8" />
            </>
          }
        />
      );
    case 'film':
    case 'film-watched':
    case 'series':
      return (
        <>
          <defs>
            <Grad
              id={`${u}f`}
              a={name === 'series' ? '#6a5cff' : '#2b3d55'}
              b={name === 'series' ? '#2a1f8c' : '#0d1726'}
            />
            <Gloss id={`${u}g`} />
          </defs>
          <rect
            x="8"
            y="10"
            width="48"
            height="44"
            rx="5"
            fill={`url(#${u}f)`}
            stroke="#000"
            strokeOpacity=".4"
          />
          {[14, 22, 30, 38, 46].map((y) => (
            <g key={y}>
              <rect x="11" y={y} width="5" height="4" rx="1" fill="#fff" opacity=".85" />
              <rect x="48" y={y} width="5" height="4" rx="1" fill="#fff" opacity=".85" />
            </g>
          ))}
          <path d="M27 22 l14 10 -14 10 Z" fill="#ffd23d" />
          <rect x="9" y="11" width="46" height="20" rx="4" fill={`url(#${u}g)`} />
          {name === 'film-watched' && (
            <>
              <circle cx="48" cy="48" r="11" fill="#3fb52f" stroke="#fff" strokeWidth="2" />
              <path
                d="M42.5 48 l4 4 7 -8"
                stroke="#fff"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            </>
          )}
        </>
      );
    case 'txt':
      return <Doc u={u} />;
    case 'file':
      return <Doc u={u} lines={false} />;
    case 'image':
      return (
        <Doc u={u} lines={false}>
          <rect x="17" y="24" width="32" height="26" fill="#7cc9ff" />
          <circle cx="40" cy="31" r="4" fill="#fff6c0" />
          <path d="M17 50 l10 -11 8 7 5 -4 9 8 Z" fill="#4cbf33" />
        </Doc>
      );
    case 'recycle-empty':
    case 'recycle-full':
      return (
        <>
          <defs>
            <Grad id={`${u}r`} a="#e9f6ff" b="#9cc6e6" x2={1} y2={0} />
          </defs>
          <path
            d="M14 14 h36 l-4 44 a3 3 0 0 1 -3 3 H21 a3 3 0 0 1 -3 -3 Z"
            fill={`url(#${u}r)`}
            stroke="#5d8db3"
            opacity="0.95"
          />
          <ellipse cx="32" cy="14" rx="19" ry="5" fill="#d4ecfb" stroke="#5d8db3" />
          {[24, 32, 40].map((x) => (
            <path
              key={x}
              d={`M${x} 20 L${x + (x - 32) * 0.12} 56`}
              stroke="#7fb0d6"
              strokeWidth="2"
            />
          ))}
          {name === 'recycle-full' && (
            <>
              <path d="M20 12 l8 -8 10 6 6 -4 4 8 Z" fill="#fff" stroke="#9fb4c9" />
              <path d="M24 10 h16" stroke="#9fb4c9" />
            </>
          )}
          <path
            d="M26 36 a7 7 0 1 1 6 6 m-3 -3 l3 3 -3 3"
            stroke="#2f9a2a"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case 'planner':
      return (
        <Tile u={u} a="#4cc8ff" b="#0b5fae">
          <circle cx="32" cy="34" r="15" fill="#fff" />
          <path
            d="M32 23 v11 l8 5"
            stroke="#0b5fae"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M42 48 l8 -18 M46 47 l4 -8"
            stroke="#ffd23d"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </Tile>
      );
    case 'calendar':
      return (
        <>
          <defs>
            <Grad id={`${u}h`} a="#ff7b6b" b="#c8232c" />
          </defs>
          <rect x="8" y="10" width="48" height="46" rx="5" fill="#fff" stroke="#8ea4bb" />
          <rect x="8" y="10" width="48" height="14" rx="5" fill={`url(#${u}h)`} />
          <text
            x="32"
            y="48"
            textAnchor="middle"
            fontSize="20"
            fontWeight="800"
            fill="#c8232c"
            fontFamily="Segoe UI, sans-serif"
          >
            18
          </text>
          {[18, 46].map((x) => (
            <rect key={x} x={x - 2} y="6" width="4" height="9" rx="2" fill="#5b6b7b" />
          ))}
        </>
      );
    case 'messenger':
      return (
        <>
          <defs>
            <Grad id={`${u}a`} a="#8ae65c" b="#2f9a2a" />
            <Grad id={`${u}b`} a="#5fd2ff" b="#0d74c0" />
          </defs>
          <circle cx="24" cy="20" r="9" fill={`url(#${u}a)`} />
          <path d="M8 50 a16 16 0 0 1 32 0 Z" fill={`url(#${u}a)`} />
          <circle cx="42" cy="24" r="8" fill={`url(#${u}b)`} />
          <path d="M28 54 a14 14 0 0 1 28 0 Z" fill={`url(#${u}b)`} />
        </>
      );
    case 'sync':
      return (
        <Orb u={u} a="#9ef08a" b="#2f9a2a">
          <path
            d="M20 30 a12 12 0 0 1 22 -6 m0 -6 v6 h-6 M44 34 a12 12 0 0 1 -22 6 m0 6 v-6 h6"
            stroke="#fff"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </Orb>
      );
    case 'player':
      return (
        <Orb u={u} a="#ffb050" b="#d2580f">
          <path d="M26 20 l18 12 -18 12 Z" fill="#fff" />
        </Orb>
      );
    case 'notepad':
      return (
        <>
          <defs>
            <Grad id={`${u}n`} a="#d9f2ff" b="#8cc9ef" />
          </defs>
          <rect x="12" y="8" width="40" height="50" rx="3" fill="#fff" stroke="#7d93a8" />
          <rect x="12" y="8" width="40" height="9" rx="3" fill={`url(#${u}n)`} />
          {[24, 30, 36, 42, 48].map((y) => (
            <rect key={y} x="17" y={y} width="30" height="1.6" fill="#8fb6d6" />
          ))}
          {[18, 26, 34, 42].map((x) => (
            <circle key={x} cx={x} cy="8" r="2.5" fill="#6a7b8c" />
          ))}
        </>
      );
    case 'paint':
      return (
        <>
          <path
            d="M32 8 C 14 8 6 22 8 34 c 2 12 12 14 16 10 c 4 -4 -2 -8 4 -10 c 6 -2 14 4 22 0 C 60 28 52 8 32 8 Z"
            fill="#f4e2c0"
            stroke="#b08a50"
          />
          <circle cx="20" cy="22" r="4" fill="#e3341a" />
          <circle cx="32" cy="16" r="4" fill="#1a7fe0" />
          <circle cx="44" cy="20" r="4" fill="#4cae1c" />
          <circle cx="46" cy="30" r="4" fill="#ffc928" />
          <path d="M40 58 l16 -22 4 3 -16 22 Z" fill="#c98b37" stroke="#7a4c0d" />
        </>
      );
    case 'photos':
      return (
        <>
          <rect
            x="6"
            y="14"
            width="44"
            height="36"
            rx="2"
            fill="#fff"
            stroke="#8ea4bb"
            transform="rotate(-8 28 32)"
          />
          <rect x="14" y="12" width="44" height="36" rx="2" fill="#fff" stroke="#8ea4bb" />
          <rect x="18" y="16" width="36" height="26" fill="#7cc9ff" />
          <path d="M18 42 l12 -12 9 8 5 -4 10 8 Z" fill="#4cbf33" />
        </>
      );
    case 'calculator':
      return (
        <>
          <defs>
            <Grad id={`${u}c`} a="#e8eef4" b="#a6b4c2" />
          </defs>
          <rect x="12" y="6" width="40" height="52" rx="4" fill={`url(#${u}c)`} stroke="#5b6b7b" />
          <rect x="17" y="11" width="30" height="11" rx="2" fill="#d7f0d0" stroke="#7a9a70" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c) => (
              <rect
                key={`${r}${c}`}
                x={17 + c * 8}
                y={27 + r * 9}
                width="6"
                height="6"
                rx="1.5"
                fill={c === 3 ? '#ff8a5c' : '#fff'}
                stroke="#8ea4bb"
              />
            )),
          )}
        </>
      );
    case 'cmd':
      return (
        <>
          <rect x="6" y="10" width="52" height="44" rx="3" fill="#0c0c0c" stroke="#5b6b7b" />
          <rect x="6" y="10" width="52" height="8" rx="3" fill="#cfd8e0" />
          <path d="M12 26 l8 6 -8 6" stroke="#c0c0c0" strokeWidth="3" fill="none" />
          <rect x="24" y="36" width="12" height="3" fill="#c0c0c0" />
        </>
      );
    case 'taskmgr':
      return (
        <>
          <rect x="6" y="8" width="52" height="48" rx="4" fill="#0a1a10" stroke="#5b6b7b" />
          <path
            d="M10 46 l8 -6 6 4 8 -14 6 8 8 -16 8 10"
            stroke="#39d353"
            strokeWidth="2.5"
            fill="none"
          />
          {[16, 26, 36].map((y) => (
            <rect key={y} x="10" y={y} width="44" height="0.8" fill="#1f4a2a" />
          ))}
        </>
      );
    case 'ie':
      return (
        <>
          <defs>
            <radialGradient id={`${u}e`} cx="40%" cy="35%" r="70%">
              <stop offset="0" stopColor="#8fe0ff" />
              <stop offset="1" stopColor="#0a63c9" />
            </radialGradient>
          </defs>
          <path
            d="M46 36 H22 c0 8 6 12 12 12 c5 0 8 -2 10 -5 h9 c-3 9 -11 14 -19 14 C 20 57 12 47 12 35 C 12 22 22 12 34 12 c 12 0 20 9 20 22 c0 1 0 1.5 -0.1 2 Z M22 30 h21 c-1 -6 -5 -10 -10.5 -10 S 23 24 22 30 Z"
            fill={`url(#${u}e)`}
          />
          <path
            d="M8 42 C 2 30 16 12 40 6 c 12 -3 18 0 18 6 c 0 6 -8 14 -18 20"
            stroke="#ffc928"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case 'minesweeper':
      return (
        <>
          <rect x="6" y="6" width="52" height="52" rx="4" fill="#c6d8ea" stroke="#5b7b9b" />
          <circle cx="32" cy="34" r="13" fill="#1b1b1b" />
          {[0, 45, 90, 135].map((a) => (
            <rect
              key={a}
              x="30.5"
              y="15"
              width="3"
              height="38"
              fill="#1b1b1b"
              transform={`rotate(${a} 32 34)`}
            />
          ))}
          <circle cx="27" cy="29" r="3.5" fill="#fff" />
        </>
      );
    case 'solitaire':
    case 'spider':
      return (
        <>
          <rect
            x="10"
            y="12"
            width="28"
            height="40"
            rx="3"
            fill="#fff"
            stroke="#7d93a8"
            transform="rotate(-12 24 32)"
          />
          <rect x="24" y="10" width="28" height="40" rx="3" fill="#fff" stroke="#7d93a8" />
          {name === 'spider' ? (
            <g transform="translate(38 30)">
              <circle r="5" fill="#1b1b1b" />
              {[-1, 1].map((s) =>
                [-6, -2, 2, 6].map((y) => (
                  <path
                    key={`${s}${y}`}
                    d={`M0 0 l${s * 7} ${y} ${s * 3} ${y > 0 ? 4 : -4}`}
                    stroke="#1b1b1b"
                    strokeWidth="1.5"
                    fill="none"
                  />
                )),
              )}
            </g>
          ) : (
            <path d="M38 22 c -4 -6 -12 -2 -8 5 l8 9 8 -9 c 4 -7 -4 -11 -8 -5 Z" fill="#d2232c" />
          )}
          <text
            x="28"
            y="22"
            fontSize="9"
            fontWeight="800"
            fill={name === 'spider' ? '#1b1b1b' : '#d2232c'}
            fontFamily="Segoe UI, sans-serif"
          >
            A
          </text>
        </>
      );
    case 'personalize':
      return (
        <>
          <rect x="6" y="10" width="52" height="38" rx="3" fill="#1a7fd0" stroke="#5b6b7b" />
          <path d="M6 38 C 20 26 34 44 58 30 V48 H6 Z" fill="#4cbf33" />
          <circle cx="46" cy="20" r="5" fill="#fff6c0" />
          <rect x="24" y="48" width="16" height="6" fill="#8a99a8" />
        </>
      );
    case 'aquarium':
      return (
        <>
          <defs>
            <Grad id={`${u}w`} a="#8fe3ff" b="#0a6fb8" />
          </defs>
          <rect
            x="6"
            y="12"
            width="52"
            height="42"
            rx="6"
            fill={`url(#${u}w)`}
            stroke="#fff"
            strokeWidth="2"
          />
          <path d="M40 32 l8 -6 v12 Z" fill="#ffd23d" />
          <ellipse cx="32" cy="32" rx="10" ry="6" fill="#ff8a3d" />
          <circle cx="27" cy="31" r="1.5" fill="#0b2a4a" />
          <path d="M6 48 C 20 42 40 52 58 46 V54 H6 Z" fill="#ffe0a0" />
        </>
      );
    case 'about':
    case 'info':
      return (
        <Orb u={u} a="#7cc9ff" b="#0d5fae">
          <circle cx="32" cy="20" r="3.5" fill="#fff" />
          <rect x="29" y="27" width="6" height="18" rx="2" fill="#fff" />
        </Orb>
      );
    case 'warning':
      return (
        <>
          <path d="M32 6 L60 54 H4 Z" fill="#ffd23d" stroke="#b08a10" strokeLinejoin="round" />
          <rect x="29.5" y="22" width="5" height="18" rx="2" fill="#1b1b1b" />
          <circle cx="32" cy="46" r="3" fill="#1b1b1b" />
        </>
      );
    case 'error':
      return (
        <Orb u={u} a="#ff8a7a" b="#c8232c">
          <path
            d="M23 23 l18 18 M41 23 l-18 18"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </Orb>
      );
    case 'question':
      return (
        <Orb u={u} a="#7cc9ff" b="#0d5fae">
          <text
            x="32"
            y="42"
            textAnchor="middle"
            fontSize="28"
            fontWeight="800"
            fill="#fff"
            fontFamily="Segoe UI, sans-serif"
          >
            ?
          </text>
        </Orb>
      );
    case 'run':
      return (
        <>
          <rect x="6" y="14" width="52" height="36" rx="4" fill="#eef4fa" stroke="#7d93a8" />
          <rect x="6" y="14" width="52" height="8" rx="4" fill="#4f9bd8" />
          <rect x="12" y="32" width="30" height="8" rx="1" fill="#fff" stroke="#7d93a8" />
          <path d="M46 36 h8 m-3 -3 l3 3 -3 3" stroke="#2f9a2a" strokeWidth="2" fill="none" />
        </>
      );
    case 'welcome':
      return (
        <Orb u={u} a="#ffe27a" b="#f0a414">
          <path
            d="M20 34 l8 8 16 -18"
            stroke="#fff"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        </Orb>
      );
    case 'link':
      return (
        <>
          <rect x="2" y="44" width="18" height="18" rx="2" fill="#fff" stroke="#7d93a8" />
          <path
            d="M6 58 c 0 -8 4 -10 10 -10 m-4 -3 l4 3 -4 3"
            stroke="#1a6fc4"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case 'lock':
      return (
        <>
          <rect x="14" y="28" width="36" height="28" rx="4" fill="#ffc928" stroke="#a87a10" />
          <path d="M22 28 v-8 a10 10 0 0 1 20 0 v8" stroke="#8a99a8" strokeWidth="5" fill="none" />
        </>
      );
    case 'shield':
      return (
        <>
          <path d="M32 6 L54 14 v16 c0 14 -10 22 -22 28 C 20 52 10 44 10 30 V14 Z" fill="#1a7fd0" />
          <path d="M32 6 v52 C 20 52 10 44 10 30 V14 Z" fill="#ffc928" />
          <path d="M10 30 h44" stroke="#fff" strokeWidth="1" opacity=".6" />
        </>
      );
  }
}

export function Icon({
  name,
  size = 32,
  className,
  shortcut,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Draw the little curved-arrow badge desktop shortcuts carry. */
  shortcut?: boolean;
}) {
  const u = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {body(name, u)}
      {shortcut && body('link', `${u}l`)}
    </svg>
  );
}
