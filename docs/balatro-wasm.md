# Balatro in WebAssembly

`/balatro` runs a player's **own copy** of Balatro in the browser. It is a worked
example of taking a real desktop game, a LÖVE 11 (Lua) title, to WebAssembly
without changing a line of the game. This page explains how, and why each piece
is needed.

The site ships the engine and a small platform layer. **It never ships the game.**
The player picks the `Balatro.exe` (Windows) or `Balatro.love` (macOS) they already
own. The browser reads it on their device and can cache it in their own IndexedDB.
Nothing is uploaded.

| Piece                 | Where                              | What it is                                                                                     |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Engine                | `public/balatro/engine/`           | love.js 11.4.1 "compat": LÖVE compiled to WebAssembly with Emscripten (MIT), one small patch   |
| Vendor script         | `scripts/balatro/vendor-lovejs.sh` | downloads, verifies and patches the engine (re-run to update)                                  |
| Loader                | `lib/balatro/runtime.ts`           | finds the game in the picked file, fills the virtual filesystem, boots LÖVE, syncs saves       |
| Zip reader/writer     | `lib/balatro/zip.ts`               | reads fused executables; writes save exports                                                   |
| Platform layer        | `lib/balatro/lua/rmh_web.lua`      | runs before the game: threads, window, shaders, images, saves, platform flags                  |
| LuaJIT ports          | `lib/balatro/lua/*.lua`            | `bit` and LuaJIT's `math.random`, bit-exact                                                    |
| Page                  | `components/balatro/BalatroPage.tsx` · `app/routes/balatro.tsx` | file picker, cache, toolbar (fullscreen, save export/import)      |

## 1. What "compile Balatro to WASM" actually means

A LÖVE game has two halves:

- **The engine.** C++ (LÖVE) plus its native libraries: SDL2 for windowing and
  input, OpenAL for sound, a Lua VM, image and audio decoders. On Windows these are
  the DLLs next to `Balatro.exe` (`love.dll`, `lua51.dll`, `SDL2.dll`,
  `OpenAL32.dll`, `mpg123.dll`, the MSVC runtime).
- **The game.** Lua source, shaders and assets in a zip.

The DLLs are x86-64 machine code. They cannot become WebAssembly: there is
nothing to compile, only compiled output. The **engine's source** is what gets
compiled, with Emscripten. Emscripten maps SDL2 to the DOM canvas and events,
OpenAL to Web Audio, OpenGL ES 2 to WebGL 1, and POSIX file I/O to an in-memory
filesystem. That build is [love.js](https://github.com/Davidobot/love.js).

The game half is **not compiled at all**. Lua is interpreted, and the WebAssembly
build of the Lua VM runs the original `.lua` files as they are.

`Balatro.exe` is a *fused* LÖVE executable: `love.exe` with the game's zip
appended. Zip readers work from the end of the file (the end-of-central-directory
record), so `zip.ts` finds that record and computes how many bytes of executable
come before the zip (`prefix = eocdOffset − cdSize − cdOffset`). It then reads the
zip in place with the browser's own `DecompressionStream('deflate-raw')`.

## 2. Why the "compat" build

love.js comes in two builds. The default one uses Emscripten pthreads, which need
`SharedArrayBuffer`. That in turn needs the page to be cross-origin isolated
(`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers), which
breaks third-party embeds and needs Apache changes. The compat build is
single-threaded and needs no special headers. The site's CSP already allows
`'wasm-unsafe-eval'`, so the route deploys with no front-door change.

Balatro does use threads. Section 4 shows how they still work.

**The one engine patch.** Emscripten keeps its `FS` object private. The loader
needs it to write the game into memory and to flush, export and import saves, so
the vendor script adds `Module["FS"]=FS` next to the existing `FS_*` exports. The
script checks the tarball's SHA-256 and fails if the anchor it patches is missing.

## 3. Boot sequence

`bootBalatro()` (in `runtime.ts`):

1. Loads `love.js`, which fetches `love.wasm` (4.7 MB, cached by the browser).
2. Extracts every file of the game zip.
3. In Emscripten's `preRun` hook, writes them to `/Balatro/…` in the in-memory
   filesystem. It also writes the platform layer (`rmh_web.lua` and `rmh/*.lua`) and
   prefixes `require "rmh_web";` onto **line 1** of `main.lua`, so no line number
   in an error trace moves.
4. Starts LÖVE with `/Balatro` as the game. LÖVE names the save identity after
   that directory, so saves land in `/home/web_user/love/Balatro/`, with the same
   layout as `%AppData%\Balatro` (`settings.jkr`, then `1/`, `2/`, `3/` holding each
   profile's `profile.jkr`, `meta.jkr` and `save.jkr`).

Page and Lua share no API in this build, but Lua's `io` library can reach the whole
Emscripten filesystem. So the two sides trade small files under `/rmh`: the page
writes `/rmh/size` (the frame's pixel size), and Lua drops `/rmh/dirty` after any
write to the save directory.

## 4. The platform layer (`rmh_web.lua`)

Each section of the file deals with one difference between desktop LÖVE and the
browser. None of them touch game rules.

**LuaJIT → PUC Lua.** Desktop LÖVE runs LuaJIT; love.js runs PUC Lua 5.1. Every
Balatro file parses as Lua 5.1 (checked with `luac5.1 -p`), so the language is
fine. Two library differences matter:

- `require "bit"` fails, because `bit` is a LuaJIT built-in. `rmh/bit.lua`
  reimplements LuaBitOp: 32-bit operands, signed results, shift counts mod 32,
  round-half-even for non-integers. It works a byte at a time through 256×256
  lookup tables (`rmh/u32.lua`).
- **`math.random` is a different generator.** PUC Lua calls C's `rand()`. LuaJIT
  uses a Tausworthe generator (TW223) over four 64-bit words, seeded by repeatedly
  computing `d = d·π + e` and taking the IEEE-754 bits. Balatro derives every
  random event in a run from `math.randomseed(x)` followed by `math.random()`, so
  without the port a shared seed would deal different cards here than on desktop.
  `rmh/luajit_random.lua` is a port of LuaJIT's `lib_math.c`, with 64-bit words as
  pairs of 32-bit halves. It was checked bit for bit against LuaJIT 2.1 over 1,230
  values: the initial state, 15 edge-case seeds (0, −0, ±tiny, subnormal, 2⁵³,
  1e300, …), all three call forms, and 200 seeds of the kind Balatro generates.

**Threads → coroutines.** Balatro runs its sound, save and HTTP managers as LÖVE
threads that loop on `Channel:demand()`. The shim replaces `love.thread`:

- each thread is a coroutine with its **own global environment**, as a real
  thread has its own Lua state. The sound manager defines globals that would
  otherwise overwrite the main state's.
- `demand()` on an empty channel yields.
- `push()` deep-copies the value, as LÖVE serialises it (the game reuses the
  tables it pushes), and resumes a waiting consumer immediately. A save request
  is therefore written to disk before `push()` returns.
- `love.timer.sleep` yields inside a thread, and does nothing on the main state:
  the browser paces frames, so a sleep would only spin.

**Window.** The page owns the window. `setMode`/`updateMode` always use the
frame's size, windowed and resizable; displays, desktop size and fullscreen modes
all report that one size. When the page's `ResizeObserver` writes a new
`/rmh/size`, the shim resizes and calls Balatro's own `love.resize`. Browser
fullscreen is a toolbar button, because `requestFullscreen` needs a real user
gesture and the game only sees a click one frame later.

**Shaders (WebGL 1 = GLSL ES 1.00).** Appendix A of the ES spec only allows `for`
loops with constant bounds. One Balatro shader bounds its loop with a local `int`
that is never reassigned. The shim makes any such loop-bound local `const`, and
gives a file that ends on a preprocessor directive a trailing newline.

**Images.** WebGL 1 cannot mipmap a texture whose sides are not powers of two.
Balatro asks for mipmaps on every atlas, so those images load without them. The
game never sets a mipmap filter.

**Platform flags.** Balatro picks features per OS in `Game:set_globals()`.
`love.system.getOS()` returns `Web`, which matches none of its branches. The shim
applies the desktop set (5-second run saves, every language) minus what a tab
can't do: Quit and the Video tab are hidden. `https` (crash reports and high
scores, both off) and `luasteam` get stubs. Since `getOS()` is never Windows or
OS X, the game never loads Steam and tracks unlocks itself.

## 5. Save persistence

love.js mounts `/home/web_user/love` on **IDBFS**, Emscripten's IndexedDB-backed
filesystem, and populates it before `main` runs. It only writes back on
`beforeunload`, which mobile browsers, crashes and killed tabs never fire. The
loader flushes (`FS.syncfs(false)`):

- within 500 ms of any write (the shim's `/rmh/dirty` marker),
- when the tab is hidden or the page is hidden (`visibilitychange`, `pagehide`),
- every 30 seconds as a backstop.

**Export** writes the save directory as a zip (`Balatro/settings.jkr`,
`Balatro/1/save.jkr`, …). **Import** takes a zip of a desktop save folder, or of its
contents, keeps only `.jkr` files at the root or in profile folders `1`–`3`,
replaces the directory, flushes and reloads. The path rules are unit-tested
(`lib/balatro/__tests__/saves.test.ts`). The `.jkr` files are the game's own
deflated Lua tables, so saves move between desktop and browser unchanged.

The page also calls `navigator.storage.persist()`, so the browser is less likely
to evict the cached copy and the saves.

## 6. What is not here

- **Steam:** achievements sync, cloud saves and the overlay. Unlocks are tracked
  locally, as on any non-Steam build.
- **Desktop video settings** (resolution, monitor, vsync). The page frame decides
  the size.
- **Exact `pairs()` order.** LuaJIT and PUC Lua lay hash tables out differently.
  Balatro sorts keys before every random pick (`pseudorandom_element`), so this
  does not affect seeds.

## Updating the engine

```bash
scripts/balatro/vendor-lovejs.sh
```

To verify the LuaJIT ports after editing them (needs `luajit` and `lua5.1`): run
one script of `math.random`/`bit` calls under both interpreters, loading the ports
under `lua5.1`, and diff the outputs with `%.17g` formatting. They must be
identical.
