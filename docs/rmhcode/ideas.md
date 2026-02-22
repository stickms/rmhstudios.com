# RMH Code — Feature Ideas

Brainstormed features to grow RMH Code into a fully-functional, browser-based code editor and runner.

---

## What's Already Built

- Monaco editor (VS Code engine) with syntax highlighting for 20+ languages
- File explorer with cloud projects and local folder mode (File System Access API)
- Tab bar with dirty-state tracking and auto-save (1.5s debounce)
- Activity bar, status bar, and guest mode (read-only with sample file)
- Integrated terminal
- Git panel (clone, push)
- CRUD API for cloud projects and files

---

## Code Execution

### In-Browser Runners
- **JavaScript/TypeScript runner** — execute the active file in a sandboxed `<iframe>` and stream stdout/console output to an Output panel
- **Python (Pyodide)** — run Python in-browser via WebAssembly; no server round-trip needed
- **Run button** in the top bar / toolbar, with keyboard shortcut (e.g. `Ctrl+Enter`)
- **Per-language REPL** — open a persistent REPL session in the terminal panel for JS, Python, etc.

### Server-Side Execution
- **Sandboxed execution API** — run arbitrary code in isolated Docker/gVisor containers server-side; return stdout, stderr, exit code, and runtime
- **Supported languages**: TypeScript, JavaScript, Python, Rust, Go, C, C++, Java, Ruby, PHP
- **Execution time + memory limits** per run (configurable per project)
- **Output panel** — bottom panel showing stdout/stderr, exit code, and elapsed time; separate tabs for each run
- **stdin support** — let the user provide input before running (for programs that read from stdin)
- **Test runner integration** — detect common test frameworks (Jest, Pytest, Go test, Cargo test) and display results in a structured "Tests" panel

---

## Editor Enhancements

- ✅ **Command palette** (`Ctrl+Shift+P`) — fuzzy search over all editor actions, file names, and settings
- ✅ **Fuzzy file finder** (`Ctrl+P`) — quickly open any file in the project
- ✅ **Go to line** (`Ctrl+G`)
- **Find & Replace across files** — project-wide search using ripgrep on the server; results in a "Search" sidebar panel
- **Code formatting** — Prettier integration triggered on save or via command; configurable per language
- **Linting** — ESLint/Pyflakes errors surfaced as Monaco diagnostics (squiggles + Problems panel)
- **Split editor** — side-by-side or top/bottom pane splits; drag tabs into new panes
- **Diff editor view** — compare two files or the current file against its last-saved cloud version
- ✅ **Minimap toggle** — show/hide the right-side minimap via status bar click or setting
- **Vim/Emacs keybinding modes** — toggle in settings; powered by Monaco's built-in vim mode
- **Snippets library** — user-definable and language-default snippet completions
- ✅ **Breadcrumb navigation bar** — shows `project / folder / file / symbol` path above the editor
- **Outline panel** — sidebar tree of symbols (functions, classes, variables) in the current file
- **Multi-root workspace** — open multiple projects/folders simultaneously in one window
- ✅ **Sticky scroll** — keep scope headers (function/class signatures) pinned at the top while scrolling

---

## File & Project Management

- ✅ **Rename files and folders** — double-click in the file explorer
- ✅ **New folder** creation in the explorer (not just files)
- **Drag-and-drop** file reordering and moving between folders
- ✅ **File upload** — drag files from the OS into the explorer to upload to the cloud project
- ✅ **Download file** — right-click → Download to save individual files locally
- ✅ **Export project as ZIP** — one-click download of the entire cloud project
- **Import ZIP** — bootstrap a new project from an uploaded zip archive
- ✅ **File templates** — "New file from template" (e.g., React component, Express route, Python class)
- ✅ **Project templates** — starter projects when creating new (blank, TypeScript app, Python script, React + Vite, etc.)
- ✅ **Project rename and description**
- **Project forking** — clone another user's public project into your own account
- **Public / private toggle** — mark a project as publicly readable; share a URL
- ✅ **Recent files** — list of recently opened files shown on the empty editor welcome screen

---

## Git Integration (Expanded)

- **Inline diff gutter** — colored +/− indicators in the editor gutter for changed lines vs. HEAD
- **Staged/unstaged diff view** — dedicated diff editor for each changed file in the Git panel
- **Branch management** — create, switch, and delete branches from the sidebar
- **Commit history / log** — scrollable list of commits with diffs on click
- **Git blame** — annotate each line with the last commit that changed it (hover for details)
- **Pull / fetch** — sync remote changes, not just push
- **Conflict resolution UI** — three-way merge editor for merge conflicts
- **`.gitignore` aware file explorer** — dim or hide ignored files

---

## Terminal (Expanded)

- ✅ **Multiple terminal tabs** — open several concurrent terminal sessions
- **Terminal split** — side-by-side terminals in the same panel
- **Shell selection** — bash, sh, zsh, fish (whatever is available server-side)
- ✅ **Terminal themes** — match editor color theme or pick separately
- ✅ **Terminal search** — `Ctrl+F` search through scrollback buffer
- **Persistent sessions** — reconnect to a running terminal session after navigating away (via WebSocket keep-alive or tmux backend)
- ✅ **Copy-paste polish** — right-click context menu in terminal

---

## Collaboration & Sharing

- **Real-time multiplayer editing** — multiple users edit the same file simultaneously via CRDTs (e.g. Yjs + WebSocket); presence cursors with user avatars and colors
- **Inline comments** — leave threaded comments on specific lines (like GitHub PR review)
- **Share link** — generate a public read-only URL to a specific file and line range
- **Embed snippet** — generate an `<iframe>` embed code for a snippet (like CodePen)
- **Code screenshot** — render the selected code as a styled PNG (like Carbon) for sharing

---

## Themes & Customization

- ✅ **Theme picker** — built-in VS Code themes (Dark+, Light+, Monokai, Dracula, Solarized, etc.)
- **Custom theme builder** — tweak token colors and export/import as JSON
- ✅ **Font family and size controls** — dropdown/slider in settings or status bar
- **Custom keybindings** — user-editable keybinding map stored per account
- ✅ **Layout persistence** — remember sidebar width, open tabs, and panel state per project across sessions
- ✅ **Zen mode** — `F11` hides the activity bar, sidebar, tabs, and status bar; full-screen focus
- ✅ **Panel resizing** — drag handles on terminal panel height and sidebar width

---

## Bottom Panel & Diagnostics

- **Problems panel** — aggregated list of linter errors and warnings across all open files; click to navigate
- **Output panel** — log output from the runner, formatter, and linter
- **Debug console** — REPL that evaluates expressions in the context of the running program (requires debugger integration)

---

## Debugger

- **DAP integration** — Debug Adapter Protocol support for step-through debugging of JS/TS and Python
- **Breakpoints** — click gutter to set/remove; conditional breakpoints
- **Call stack, variables, and watch panels** — standard debugger UI in the sidebar during a session
- **Inline variable values** — show current variable values as ghost text next to the line during a paused session

---

## Performance & Polish

- **Virtual file tree** — only render visible nodes for projects with thousands of files
- **Lazy content loading** — fetch file content on first open, not when the project loads
- **Web Worker parsing** — offload heavy syntax parsing and linting to a Web Worker to keep the UI smooth
- **Large file mode** — automatically disable expensive features (minimap, bracket colorization) for files > 500 KB
- **Offline mode** — service worker caches Monaco and recent files so the editor works without network for local folder mode

---

## Accessibility

- **Full keyboard navigation** — all editor actions reachable without a mouse
- **Screen reader support** — ARIA labels on panels, file explorer, and tab bar
- **High contrast themes** — WCAG-compliant high-contrast light and dark themes
- **Reduced motion mode** — disable smooth scroll and cursor animations for users who prefer it

---

## Social & Profile

- **Public project gallery** — per-user profile page listing their public projects with live previews
- **Project stars / likes** — users can star interesting projects
- **"Fork count" on projects** — show how many times a project has been forked
- **Leaderboard / activity feed** — recent public activity on the platform (optional, if community features are desired)
