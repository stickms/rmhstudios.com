'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { FileMeta } from './utils';

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'info';
  text: string;
}

interface TerminalProps {
  files: FileMeta[];
  fileContents: Record<string, string>;
  onFileWrite: (path: string, content: string) => void;
  onClose: () => void;
}

// ─── Sandbox for JS execution ────────────────────────────────────────────────
const JS_SANDBOX_SRC = `
self.onmessage = function({ data: { code, files } }) {
  var logs = [];
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

let _lineId = 0;
function mkLine(type: TerminalLine['type'], text: string): TerminalLine {
  return { id: _lineId++, type, text };
}

// ─── Virtual FS helpers ───────────────────────────────────────────────────────
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

export default function Terminal({ files, fileContents, onFileWrite, onClose }: TerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    mkLine('info', 'RMH Code Terminal — type "help" for available commands'),
    mkLine('info', 'Python and JavaScript run in a sandboxed environment with no real filesystem access.'),
  ]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('/');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pyodideRef = useRef<any>(null);
  const pyodideLoadingRef = useRef(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [lines]);

  const appendLine = useCallback((type: TerminalLine['type'], text: string) => {
    const ls = text.split('\n').map(t => mkLine(type, t));
    setLines(prev => [...prev, ...ls]);
  }, []);

  // ─── Python via Pyodide ───────────────────────────────────────────────────
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
        // Dynamic import from CDN — bypasses webpack bundling
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

    // Mount virtual files into Pyodide FS
    for (const f of files) {
      const parts = f.path.split('/');
      // Ensure parent dirs exist
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
      const msg = e instanceof Error ? e.message : String(e);
      appendLine('error', msg);
    } finally {
      setIsRunning(false);
    }
  }

  // ─── JavaScript via Blob Web Worker ──────────────────────────────────────
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

    // Pass a read-only copy of file contents keyed by path
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

  // ─── Built-in shell commands ──────────────────────────────────────────────
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
          'Sandbox restrictions:',
          '  • No real filesystem access',
          '  • No network requests (fetch/XHR blocked)',
          '  • No require() / import() from npm',
          '  • JS execution: 10s timeout',
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
          if (!matched && target !== '/') {
            appendLine('error', `ls: ${args[0]}: No such directory`);
          } else {
            appendLine('output', '(empty)');
          }
        } else {
          appendLine('output', entries.join('  '));
        }
        return;
      }

      case 'cd': {
        if (!args[0] || args[0] === '~') { setCwd('/'); return; }
        const next = resolvePath(cwd, args[0]);
        // Validate: either '/' or a prefix that matches some file
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
        // Handle: echo text > file
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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

  return (
    <div className="flex flex-col shrink-0 border-t border-[#252526] bg-[#1e1e1e]" style={{ height: 220 }}>
      {/* Terminal tab bar */}
      <div className="flex items-center justify-between px-3 h-8 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white font-semibold">Terminal</span>
          {isRunning && (
            <span className="text-[10px] text-[#858585] animate-pulse">running…</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLines([])}
            title="Clear"
            className="text-[#858585] hover:text-white transition-colors p-0.5"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={onClose}
            title="Close terminal"
            className="text-[#858585] hover:text-white transition-colors p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs bg-[#0d0d0d] cursor-text"
        style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
      >
        {lines.map(line => (
          <div key={line.id} className={`leading-5 whitespace-pre-wrap break-all ${
            line.type === 'input' ? 'text-[#858585]' :
            line.type === 'error' ? 'text-[#f48771]' :
            line.type === 'info' ? 'text-[#9cdcfe]' :
            'text-[#d4d4d4]'
          }`}>
            {line.text}
          </div>
        ))}

        {/* Input line */}
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[#858585] shrink-0 select-none">{cwd} $</span>
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
            className="flex-1 bg-transparent outline-none text-[#d4d4d4] caret-white disabled:opacity-50"
            style={{ fontFamily: 'inherit' }}
          />
        </div>
      </div>
    </div>
  );
}
