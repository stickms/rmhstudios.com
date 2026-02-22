'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { FileMeta } from './utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'info';
  text: string;
}

export interface ThemeColors {
  name: string;
  bg: string;
  textOutput: string;
  textPrompt: string;
  textError: string;
  textInfo: string;
}

export interface TerminalSessionHandle {
  clear: () => void;
  focus: () => void;
}

interface TerminalSessionProps {
  files: FileMeta[];
  fileContents: Record<string, string>;
  onFileWrite: (path: string, content: string) => void;
  isActive: boolean;
  theme: ThemeColors;
}

// ─── JS Sandbox ───────────────────────────────────────────────────────────────

const JS_SANDBOX_SRC = `
self.onmessage = function({ data: { code, files } }) {
  var _console = {
    log:   function() { self.postMessage({ t: 'log', v: Array.from(arguments).map(String).join(' ') }); },
    error: function() { self.postMessage({ t: 'err', v: Array.from(arguments).map(String).join(' ') }); },
    warn:  function() { self.postMessage({ t: 'log', v: '[warn] ' + Array.from(arguments).map(String).join(' ') }); },
    info:  function() { self.postMessage({ t: 'log', v: Array.from(arguments).map(String).join(' ') }); },
  };
  function _fetch() { throw new Error('fetch() is not available in the sandbox'); }
  function _require() { throw new Error('require() is not available in the sandbox'); }
  var XMLHttpRequest = function() { throw new Error('XMLHttpRequest is not available in the sandbox'); };
  try {
    var fn = new Function('console', 'require', 'fetch', 'XMLHttpRequest', 'files', code);
    var result = fn(_console, _require, _fetch, XMLHttpRequest, files);
    if (result && typeof result.then === 'function') {
      result
        .then(function() { self.postMessage({ t: 'done' }); })
        .catch(function(e) { self.postMessage({ t: 'err', v: e && e.message ? e.message : String(e) }); });
    } else {
      self.postMessage({ t: 'done' });
    }
  } catch(e) {
    self.postMessage({ t: 'err', v: e && e.message ? e.message : String(e) });
  }
};
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _lineId = 0;
function mkLine(type: TerminalLine['type'], text: string): TerminalLine {
  return { id: _lineId++, type, text };
}

function lsDir(files: FileMeta[], cwd: string) {
  const prefix = cwd === '/' ? '' : cwd.replace(/^\//, '') + '/';
  const seen = new Set<string>();
  const results: string[] = [];
  for (const f of files) {
    const path = f.path;
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const parts = rest.split('/');
    const entry = parts[0];
    if (!seen.has(entry)) {
      seen.add(entry);
      results.push(parts.length > 1 ? entry + '/' : entry);
    }
  }
  return results.sort();
}

function resolvePath(cwd: string, rel: string): string {
  if (!rel || rel === '.') return cwd;
  if (rel.startsWith('/')) return '/' + rel.replace(/^\/+/, '');
  const base = cwd === '/' ? '' : cwd;
  const combined = base + '/' + rel;
  const parts = combined.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p !== '.') resolved.push(p);
  }
  return '/' + resolved.join('/');
}

function findFile(files: FileMeta[], cwd: string, arg: string): FileMeta | undefined {
  const resolved = resolvePath(cwd, arg).replace(/^\//, '');
  return files.find(f => f.path === resolved);
}

// ─── Component ────────────────────────────────────────────────────────────────

const TerminalSession = forwardRef<TerminalSessionHandle, TerminalSessionProps>(
  function TerminalSession({ files, fileContents, onFileWrite, isActive, theme }, ref) {
    const [lines, setLines] = useState<TerminalLine[]>([
      mkLine('info', 'RMH Code Terminal — type "help" for available commands'),
      mkLine('info', 'Python and JavaScript run in a sandboxed environment with no real filesystem access.'),
    ]);
    const [input, setInput] = useState('');
    const [cwd, setCwd] = useState('/');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIdx, setHistoryIdx] = useState(-1);
    const [isRunning, setIsRunning] = useState(false);

    // Search
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Context menu
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pyodideRef = useRef<any>(null);
    const pyodideLoadingRef = useRef(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      clear: () => setLines([]),
      focus: () => inputRef.current?.focus(),
    }));

    // Auto-focus when this session becomes active
    useEffect(() => {
      if (isActive) inputRef.current?.focus();
    }, [isActive]);

    // Auto-scroll on new output
    useEffect(() => {
      outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
    }, [lines]);

    // Focus search input when search opens
    useEffect(() => {
      if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

    // Close context menu on outside click
    useEffect(() => {
      if (!ctxMenu) return;
      const close = () => setCtxMenu(null);
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }, [ctxMenu]);

    const appendLine = useCallback((type: TerminalLine['type'], text: string) => {
      setLines(prev => [...prev, ...text.split('\n').map(t => mkLine(type, t))]);
    }, []);

    // ─── Python (Pyodide) ───────────────────────────────────────────────────
    async function runPython(scriptPath: string) {
      const file = findFile(files, cwd, scriptPath);
      if (!file) { appendLine('error', `python: ${scriptPath}: No such file`); return; }
      const content = fileContents[file.id] ?? '';
      setIsRunning(true);

      if (!pyodideRef.current) {
        if (pyodideLoadingRef.current) { appendLine('info', 'Python runtime is already loading…'); setIsRunning(false); return; }
        pyodideLoadingRef.current = true;
        appendLine('info', 'Loading Python runtime (first run may take a moment)…');
        try {
          const pyodideModule = await import(
            /* webpackIgnore: true */
            'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs' as string
          );
          pyodideRef.current = await pyodideModule.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
            stdout: (s: string) => appendLine('output', s),
            stderr: (s: string) => appendLine('error', s),
          });
          appendLine('info', 'Python 3.12 ready.');
        } catch (e) {
          appendLine('error', `Failed to load Python runtime: ${e}`);
          pyodideLoadingRef.current = false;
          setIsRunning(false);
          return;
        }
      }

      const py = pyodideRef.current;
      for (const f of files) {
        const parts = f.path.split('/');
        let dir = '/';
        for (let i = 0; i < parts.length - 1; i++) {
          dir += parts[i] + '/';
          try { py.FS.mkdir(dir.replace(/\/$/, '')); } catch { /* already exists */ }
        }
        try { py.FS.writeFile('/' + f.path, fileContents[f.id] ?? ''); } catch { /* ignore */ }
      }

      try {
        await py.runPythonAsync(content);
      } catch (e: unknown) {
        appendLine('error', e instanceof Error ? e.message : String(e));
      } finally {
        setIsRunning(false);
      }
    }

    // ─── JavaScript (Web Worker) ────────────────────────────────────────────
    function runJS(scriptPath: string) {
      const file = findFile(files, cwd, scriptPath);
      if (!file) { appendLine('error', `node: ${scriptPath}: No such file`); return; }
      const code = fileContents[file.id] ?? '';
      setIsRunning(true);

      const blob = new Blob([JS_SANDBOX_SRC], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);

      const timeout = setTimeout(() => {
        worker.terminate();
        URL.revokeObjectURL(url);
        appendLine('error', 'Script timed out after 10 seconds.');
        setIsRunning(false);
      }, 10_000);

      const filesObj: Record<string, string> = {};
      for (const f of files) filesObj[f.path] = fileContents[f.id] ?? '';

      worker.onmessage = ({ data }) => {
        if (data.t === 'log') appendLine('output', data.v);
        else if (data.t === 'err') appendLine('error', data.v);
        else if (data.t === 'done') {
          clearTimeout(timeout);
          worker.terminate();
          URL.revokeObjectURL(url);
          setIsRunning(false);
        }
      };
      worker.onerror = (e) => {
        clearTimeout(timeout);
        appendLine('error', `Worker error: ${e.message}`);
        worker.terminate();
        URL.revokeObjectURL(url);
        setIsRunning(false);
      };
      worker.postMessage({ code, files: filesObj });
    }

    // ─── Built-in commands ──────────────────────────────────────────────────
    function executeCommand(raw: string) {
      const trimmed = raw.trim();
      if (!trimmed) return;

      appendLine('input', `${cwd} $ ${trimmed}`);
      setHistory(prev => [trimmed, ...prev.slice(0, 99)]);
      setHistoryIdx(-1);

      const [cmd, ...args] = trimmed.split(/\s+/);

      switch (cmd) {
        case 'clear':
          setLines([]);
          return;

        case 'help':
          appendLine('info', [
            'Built-in commands:',
            '  ls [path]           list files',
            '  cat <path>          print file content',
            '  pwd                 print working directory',
            '  cd <path>           change directory',
            '  echo <text>         print text',
            '  echo text > file    write text to file',
            '  clear               clear terminal',
            '  help                show this help',
            '',
            'Execution:',
            '  python <file>       run Python (Pyodide WASM — sandboxed)',
            '  python3 <file>      alias for python',
            '  node <file>         run JavaScript (Web Worker — sandboxed)',
            '  js <file>           alias for node',
            '  run <file>          auto-detect language and run',
            '',
            'Shortcuts:',
            '  Ctrl+F              search scrollback',
            '  ↑ / ↓              command history',
          ].join('\n'));
          return;

        case 'pwd':
          appendLine('output', cwd);
          return;

        case 'ls': {
          const target = args[0] ? resolvePath(cwd, args[0]) : cwd;
          const entries = lsDir(files, target);
          if (entries.length === 0) {
            const matched = files.some(f => ('/' + f.path).startsWith(target === '/' ? '/' : target + '/'));
            if (!matched && target !== '/') appendLine('error', `ls: ${args[0]}: No such directory`);
            else appendLine('output', '(empty)');
          } else {
            appendLine('output', entries.join('  '));
          }
          return;
        }

        case 'cd': {
          if (!args[0] || args[0] === '~') { setCwd('/'); return; }
          const next = resolvePath(cwd, args[0]);
          if (next === '/' || files.some(f => ('/' + f.path).startsWith(next + '/'))) {
            setCwd(next);
          } else {
            appendLine('error', `cd: ${args[0]}: No such directory`);
          }
          return;
        }

        case 'cat': {
          if (!args[0]) { appendLine('error', 'Usage: cat <path>'); return; }
          const file = findFile(files, cwd, args[0]);
          if (!file) { appendLine('error', `cat: ${args[0]}: No such file`); return; }
          appendLine('output', fileContents[file.id] ?? '');
          return;
        }

        case 'echo': {
          const redirectIdx = args.indexOf('>');
          if (redirectIdx !== -1) {
            const text = args.slice(0, redirectIdx).join(' ').replace(/^['"]|['"]$/g, '');
            const dest = args[redirectIdx + 1];
            if (!dest) { appendLine('error', 'echo: missing filename after >'); return; }
            onFileWrite(resolvePath(cwd, dest).replace(/^\//, ''), text);
            appendLine('info', `Written to ${dest}`);
          } else {
            appendLine('output', args.join(' ').replace(/^['"]|['"]$/g, ''));
          }
          return;
        }

        case 'python':
        case 'python3':
          if (!args[0]) { appendLine('error', 'Usage: python <file>'); return; }
          runPython(args[0]);
          return;

        case 'node':
        case 'js':
          if (!args[0]) { appendLine('error', `Usage: ${cmd} <file>`); return; }
          runJS(args[0]);
          return;

        case 'run': {
          if (!args[0]) { appendLine('error', 'Usage: run <file>'); return; }
          const ext = args[0].split('.').pop()?.toLowerCase();
          if (ext === 'py') { runPython(args[0]); return; }
          if (ext === 'js' || ext === 'ts') { runJS(args[0]); return; }
          appendLine('error', `run: unknown extension ".${ext}" — use python or node directly`);
          return;
        }

        default:
          appendLine('error', `${cmd}: command not found (type "help" for available commands)`);
      }
    }

    // ─── Input keyboard handler ─────────────────────────────────────────────
    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(s => !s);
        return;
      }
      if (e.key === 'Enter') {
        if (isRunning) return;
        executeCommand(input);
        setInput('');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(historyIdx + 1, history.length - 1);
        setHistoryIdx(next);
        setInput(history[next] ?? '');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.max(historyIdx - 1, -1);
        setHistoryIdx(next);
        setInput(next === -1 ? '' : (history[next] ?? ''));
      }
    }

    // ─── Search ─────────────────────────────────────────────────────────────
    const lowerQuery = searchQuery.toLowerCase();
    const matchCount = searchQuery ? lines.filter(l => l.text.toLowerCase().includes(lowerQuery)).length : 0;

    // ─── Context menu handlers ───────────────────────────────────────────────
    function handleContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    }

    function handleCopy() {
      const selection = window.getSelection()?.toString();
      if (selection) navigator.clipboard.writeText(selection).catch(() => {});
      setCtxMenu(null);
    }

    function handleSelectAll() {
      if (outputRef.current) {
        const range = document.createRange();
        range.selectNodeContents(outputRef.current);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setCtxMenu(null);
    }

    // ─── Render ─────────────────────────────────────────────────────────────
    return (
      <>
        {/* Search bar */}
        {showSearch && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
            <svg className="w-3 h-3 text-[#858585] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setShowSearch(false);
                  setSearchQuery('');
                  inputRef.current?.focus();
                }
              }}
              placeholder="Search output…"
              className="flex-1 bg-[#3c3c3c] rounded px-2 py-0.5 text-xs text-white placeholder-[#858585] outline-none"
            />
            {searchQuery && (
              <span className="text-[10px] text-[#858585] shrink-0">
                {matchCount} match{matchCount !== 1 ? 'es' : ''}
              </span>
            )}
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); inputRef.current?.focus(); }}
              className="text-[#858585] hover:text-white text-xs transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Output area */}
        <div
          ref={outputRef}
          onClick={() => { inputRef.current?.focus(); setCtxMenu(null); }}
          onContextMenu={handleContextMenu}
          className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs cursor-text"
          style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', backgroundColor: theme.bg }}
        >
          {lines.map(line => {
            const isMatch = !!searchQuery && line.text.toLowerCase().includes(lowerQuery);
            return (
              <div
                key={line.id}
                className={`leading-5 whitespace-pre-wrap break-all ${isMatch ? 'rounded' : ''}`}
                style={{
                  color:
                    line.type === 'input' ? theme.textPrompt :
                    line.type === 'error' ? theme.textError :
                    line.type === 'info'  ? theme.textInfo :
                    theme.textOutput,
                  backgroundColor: isMatch ? 'rgba(255,215,0,0.15)' : undefined,
                }}
              >
                {line.text}
              </div>
            );
          })}

          {/* Input line */}
          <div className="flex items-center gap-1 mt-1">
            <span className="shrink-0 select-none" style={{ color: theme.textPrompt }}>
              {cwd} $
            </span>
            {isRunning && (
              <span className="text-[10px] animate-pulse shrink-0" style={{ color: theme.textInfo }}>
                running…
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="flex-1 bg-transparent outline-none caret-white disabled:opacity-50"
              style={{ fontFamily: 'inherit', color: theme.textOutput }}
            />
          </div>
        </div>

        {/* Context menu */}
        {ctxMenu && (
          <div
            className="fixed z-50 bg-[#252526] border border-[#454545] rounded shadow-xl py-1 text-xs text-[#cccccc] min-w-[130px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white transition-colors"
              onClick={handleCopy}
            >
              Copy
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white transition-colors"
              onClick={handleSelectAll}
            >
              Select All
            </button>
            <div className="border-t border-[#454545] my-1" />
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white transition-colors"
              onClick={() => { setLines([]); setCtxMenu(null); }}
            >
              Clear
            </button>
          </div>
        )}
      </>
    );
  }
);

export default TerminalSession;
