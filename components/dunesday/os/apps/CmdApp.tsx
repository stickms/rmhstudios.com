'use client';

/**
 * Command Prompt for the Dunesday 7 sandbox.
 *
 * A cmd.exe look-alike over the same sandboxed file system Explorer uses
 * (`lib/dunesday/vfs.ts`): dir, cd, type, mkdir, del, ren, copy, tree and
 * friends, plus `start`, `tasklist` / `taskkill` over the desktop's windows and
 * a `dunesday` command that prints the marathon plan. Nothing here reaches a
 * real shell or the network: `ping` and `ipconfig` print clearly simulated
 * replies, and `shutdown` only shows a message box.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { daysBetween, formatMinutes } from '@/lib/dunesday/schedule';
import { titleById } from '@/lib/dunesday/state';
import { DUNESDAY } from '@/lib/dunesday/titles';
import {
  DRIVE,
  HOME,
  QUOTA_BYTES,
  RECYCLE,
  ROOT,
  VfsError,
  byteSize,
  children,
  copy as vfsCopy,
  create,
  isAncestor,
  pathOf,
  recycle,
  rename as vfsRename,
  resolve,
  writeContent,
  type VNode,
  type Vfs,
} from '@/lib/dunesday/vfs';
import { useDunesday } from '../../DunesdayProvider';
import { openApp, openNode, showMessage } from '../actions';
import { RUN_ALIASES } from '../apps';
import type { AppProps } from '../apps';
import { useOs, type AppId, type Win } from '../store';

/** The 16 classic console colours, indexed by the `color` attribute digit. */
const PALETTE = [
  '#000000',
  '#000080',
  '#008000',
  '#008080',
  '#800000',
  '#800080',
  '#808000',
  '#c0c0c0',
  '#808080',
  '#0000ff',
  '#00ff00',
  '#00ffff',
  '#ff0000',
  '#ff00ff',
  '#ffff00',
  '#ffffff',
];

/** Which image each app runs as; null = hosted by explorer.exe. */
const IMAGE: Record<AppId, string | null> = {
  welcome: 'welcome.exe',
  planner: 'planner.exe',
  calendar: 'mcalendar.exe',
  explorer: null,
  messenger: 'msnmsgr.exe',
  sync: 'mobsync.exe',
  player: 'wmplayer.exe',
  notepad: 'notepad.exe',
  paint: 'mspaint.exe',
  photos: 'dllhost.exe',
  calculator: 'calc.exe',
  cmd: 'cmd.exe',
  taskmgr: 'taskmgr.exe',
  ie: 'iexplore.exe',
  minesweeper: 'MineSweeper.exe',
  solitaire: 'Solitaire.exe',
  spider: 'SpiderSolitaire.exe',
  personalize: 'rundll32.exe',
  properties: null,
  aquarium: 'aquarium.scr',
  about: 'winver.exe',
  run: null,
  dialog: null,
};

const MEM_K: Partial<Record<AppId, number>> = {
  ie: 48320,
  player: 22816,
  paint: 9412,
  messenger: 14208,
  planner: 18944,
  calendar: 12672,
  solitaire: 11520,
  spider: 12288,
  minesweeper: 7680,
  aquarium: 16384,
  photos: 8960,
  cmd: 2312,
  notepad: 1824,
  calculator: 3096,
  taskmgr: 4120,
};

const SYSTEM_PROCS = [
  { image: 'explorer.exe', pid: 1888, mem: 24512 },
  { image: 'dwm.exe', pid: 1412, mem: 18240 },
  { image: 'dunesday.exe', pid: 2026, mem: 32768 },
];

function pidOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 2400) + 260) * 4;
}

interface Proc {
  image: string;
  pid: number;
  mem: number;
  win?: Win;
}

function processes(windows: Win[]): Proc[] {
  const own = windows
    .filter((w) => IMAGE[w.app])
    .map((w) => ({
      image: IMAGE[w.app] as string,
      pid: pidOf(w.id),
      mem: MEM_K[w.app] ?? 6144,
      win: w,
    }));
  return [...SYSTEM_PROCS, ...own];
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2]);
  return out;
}

const bytesOf = (s: string | undefined) => (s ? new TextEncoder().encode(s).length : 0);

interface Line {
  id: number;
  text: string;
}

export default function CmdApp({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { state, plan, pct, progress, remainingMinutes, tonight, today } = useDunesday();
  const vfs = useOs((s) => s.vfs);
  const activeId = useOs((s) => s.activeId);

  const lang = i18n.language;
  const nextId = useRef(0);
  const banner = (): Line[] =>
    [
      t('cmd-banner', { defaultValue: 'Dunesday 7 [Version 6.1.7601]' }),
      t('cmd-copyright', { defaultValue: '(c) RMH Studios. All rights reserved.' }),
      '',
    ].map((text) => ({ id: nextId.current++, text }));

  const [lines, setLines] = useState<Line[]>(banner);
  const [cwd, setCwd] = useState(HOME);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [colors, setColors] = useState<[number, number]>([0, 7]);
  const histIdx = useRef<number | null>(null);
  const completion = useRef<{ result: string; options: string[]; head: string; i: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A recycled or purged working folder drops you back home.
  const here = vfs[cwd] && !isAncestor(vfs, RECYCLE, cwd) ? cwd : HOME;
  const prompt = `${pathOf(vfs, here)}>`;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    if (activeId === win.id) inputRef.current?.focus();
  }, [activeId, win.id]);

  const dateStr = (ms: number) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString(lang, { year: 'numeric', month: '2-digit', day: '2-digit' })}  ${d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}`;
  };
  const num = (n: number) => n.toLocaleString(lang);
  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(lang, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const notFoundPath = t('cmd-path-not-found', {
    defaultValue: 'The system cannot find the path specified.',
  });
  const syntax = t('cmd-syntax', { defaultValue: 'The syntax of the command is incorrect.' });
  const simulated = t('cmd-simulated', {
    defaultValue: '(Simulated: the Dunesday 7 sandbox has no network access.)',
  });

  /** Expand a path that may end in a * / ? wildcard into the nodes it names. */
  const expand = (v: Vfs, arg: string): VNode[] | null => {
    const clean = arg.replace(/\//g, '\\');
    if (!/[*?]/.test(clean)) {
      const id = resolve(v, here, clean);
      return id && v[id] ? [v[id]] : null;
    }
    const cut = clean.lastIndexOf('\\');
    const dirPart = cut >= 0 ? clean.slice(0, cut + 1) : '';
    const pattern = clean.slice(cut + 1);
    const dir = dirPart ? resolve(v, here, dirPart) : here;
    if (!dir) return null;
    const re = new RegExp(
      `^${pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`,
      'i',
    );
    return children(v, dir).filter((n) => re.test(n.name));
  };

  const helpRows = (): [string, string][] => [
    [
      'CD',
      t('cmd-help-cd', { defaultValue: 'Displays the name of or changes the current directory.' }),
    ],
    ['CLS', t('cmd-help-cls', { defaultValue: 'Clears the screen.' })],
    [
      'COLOR',
      t('cmd-help-color', {
        defaultValue: 'Sets the default console foreground and background colors.',
      }),
    ],
    ['COPY', t('cmd-help-copy', { defaultValue: 'Copies one or more files to another location.' })],
    ['DATE', t('cmd-help-date', { defaultValue: 'Displays the date.' })],
    ['DEL', t('cmd-help-del', { defaultValue: 'Moves one or more files to the Recycle Bin.' })],
    [
      'DIR',
      t('cmd-help-dir', {
        defaultValue: 'Displays a list of files and subdirectories in a directory.',
      }),
    ],
    [
      'DUNESDAY',
      t('cmd-help-dunesday', {
        defaultValue: 'Displays your marathon progress and tonight’s titles.',
      }),
    ],
    ['ECHO', t('cmd-help-echo', { defaultValue: 'Displays messages.' })],
    ['EXIT', t('cmd-help-exit', { defaultValue: 'Quits the Command Prompt.' })],
    ['HELP', t('cmd-help-help', { defaultValue: 'Provides Help information for commands.' })],
    ['HOSTNAME', t('cmd-help-hostname', { defaultValue: 'Prints the name of this computer.' })],
    [
      'IPCONFIG',
      t('cmd-help-ipconfig', { defaultValue: 'Displays the (simulated) network configuration.' }),
    ],
    ['MKDIR', t('cmd-help-mkdir', { defaultValue: 'Creates a directory.' })],
    ['PING', t('cmd-help-ping', { defaultValue: 'Sends a (simulated) echo request to a host.' })],
    ['RENAME', t('cmd-help-ren', { defaultValue: 'Renames a file or directory.' })],
    ['RMDIR', t('cmd-help-rmdir', { defaultValue: 'Moves a directory to the Recycle Bin.' })],
    ['SHUTDOWN', t('cmd-help-shutdown', { defaultValue: 'Pretends to shut down the computer.' })],
    ['START', t('cmd-help-start', { defaultValue: 'Starts a program or opens a file.' })],
    ['TASKKILL', t('cmd-help-taskkill', { defaultValue: 'Ends a running program.' })],
    [
      'TASKLIST',
      t('cmd-help-tasklist', { defaultValue: 'Displays the programs that are running.' }),
    ],
    ['TIME', t('cmd-help-time', { defaultValue: 'Displays the system time.' })],
    [
      'TITLE',
      t('cmd-help-title', { defaultValue: 'Sets the window title for this Command Prompt.' }),
    ],
    [
      'TREE',
      t('cmd-help-tree', {
        defaultValue: 'Graphically displays the folder structure of a drive or path.',
      }),
    ],
    ['TYPE', t('cmd-help-type', { defaultValue: 'Displays the contents of a text file.' })],
    ['VER', t('cmd-help-ver', { defaultValue: 'Displays the Dunesday 7 version.' })],
    ['WHOAMI', t('cmd-help-whoami', { defaultValue: 'Displays the current user name.' })],
  ];

  const execute = (raw: string): { out: string[]; clear?: boolean } => {
    const out: string[] = [];
    const v = useOs.getState().vfs;
    const fs = useOs.getState().fs;
    const trimmed = raw.trim();
    const m = trimmed.match(/^([^\s\\/."]+)([\s\S]*)$/);
    let name = (m ? m[1] : trimmed).toLowerCase();
    let rest = m ? m[2] : '';
    if (rest.toLowerCase().startsWith('.exe')) rest = rest.slice(4);
    if (name.endsWith('.exe')) name = name.slice(0, -4);
    const args = splitArgs(rest);
    const fail = (err: VfsError | null) => {
      if (err) out.push(err.message);
      return !!err;
    };

    switch (name) {
      case 'help': {
        const rows = helpRows();
        if (args[0]) {
          const row = rows.find(([c]) => c === args[0].toUpperCase());
          out.push(
            row
              ? `${row[0]}  ${row[1]}`
              : t('cmd-help-unknown', {
                  defaultValue: 'This command is not supported by the help utility.',
                }),
          );
          break;
        }
        out.push(
          t('cmd-help-intro', {
            defaultValue: 'For more information on a specific command, type HELP command-name',
          }),
        );
        for (const [c, d] of rows) out.push(`${c.padEnd(12)}${d}`);
        break;
      }
      case 'cls':
        return { out: [], clear: true };
      case 'ver':
        out.push('', t('cmd-banner', { defaultValue: 'Dunesday 7 [Version 6.1.7601]' }));
        break;
      case 'c:':
        break;
      case 'cd':
      case 'chdir': {
        const target = rest
          .trim()
          .replace(/^\/d\s+/i, '')
          .replace(/"/g, '');
        if (!target) {
          out.push(pathOf(v, here));
          break;
        }
        const id = resolve(v, here, target);
        if (!id || !v[id]) out.push(notFoundPath);
        else if (v[id].kind !== 'folder')
          out.push(t('cmd-dir-invalid', { defaultValue: 'The directory name is invalid.' }));
        else setCwd(id);
        break;
      }
      case 'dir': {
        const target = args.filter((a) => !a.startsWith('/'))[0] ?? '';
        const found = target ? expand(v, target) : [v[here]];
        if (!found || !found[0]) {
          out.push(t('cmd-file-not-found', { defaultValue: 'File Not Found' }));
          break;
        }
        const wildcard = /[*?]/.test(target);
        const single = !wildcard && found.length === 1 && found[0].kind === 'folder';
        const dirId = single ? found[0].id : (found[0].parent ?? here);
        const list = single ? children(v, dirId) : found;
        out.push(
          ` ${t('cmd-vol-label', { defaultValue: 'Volume in drive C has no label.' })}`,
          ` ${t('cmd-vol-serial', { defaultValue: 'Volume Serial Number is {{serial}}', serial: '1218-2026' })}`,
          '',
          ` ${t('cmd-dir-of', { defaultValue: 'Directory of {{path}}', path: pathOf(v, dirId) })}`,
          '',
        );
        let files = 0;
        let dirs = 0;
        let bytes = 0;
        const row = (ms: number, n: VNode | null, label: string) => {
          if (!n || n.kind === 'folder') {
            dirs++;
            out.push(`${dateStr(ms).padEnd(20)}    ${'<DIR>'.padEnd(15)}${label}`);
          } else {
            const size = bytesOf(n.kind === 'shortcut' ? n.target : n.content);
            files++;
            bytes += size;
            out.push(`${dateStr(ms).padEnd(20)}${num(size).padStart(18)} ${label}`);
          }
        };
        if (single && dirId !== DRIVE) {
          row(v[dirId].modified, null, '.');
          row(v[v[dirId].parent ?? dirId]?.modified ?? v[dirId].modified, null, '..');
        }
        for (const n of list) row(n.modified, n, n.kind === 'shortcut' ? `${n.name}.lnk` : n.name);
        if (single && v[dirId].virtual === 'watchlist') {
          out.push(
            t('cmd-dir-watchlist', {
              defaultValue:
                '               (Your watch list lives here. Open it in Explorer: start .)',
            }),
          );
        }
        out.push(
          `${num(files).padStart(16)} ${t('cmd-dir-files', { defaultValue: 'File(s) {{bytes}} bytes', bytes: num(bytes) })}`,
          `${num(dirs).padStart(16)} ${t('cmd-dir-dirs', {
            defaultValue: 'Dir(s) {{bytes}} bytes free',
            bytes: num(Math.max(0, QUOTA_BYTES - byteSize(v))),
          })}`,
        );
        break;
      }
      case 'tree': {
        const target = args.filter((a) => !a.startsWith('/'))[0];
        const root = target ? resolve(v, here, target) : here;
        if (!root || v[root]?.kind !== 'folder') {
          out.push(
            t('cmd-tree-invalid', { defaultValue: 'Invalid path - {{path}}', path: target ?? '' }),
          );
          break;
        }
        out.push(
          t('cmd-tree-head', { defaultValue: 'Folder PATH listing' }),
          t('cmd-vol-serial-lower', {
            defaultValue: 'Volume serial number is {{serial}}',
            serial: '1218-2026',
          }),
          pathOf(v, root),
        );
        const start = out.length;
        const walk = (id: string, prefix: string) => {
          const kids = children(v, id).filter((k) => k.kind === 'folder');
          kids.forEach((k, i) => {
            if (out.length > 600) return;
            const last = i === kids.length - 1;
            out.push(`${prefix}${last ? '└───' : '├───'}${k.name}`);
            walk(k.id, prefix + (last ? '    ' : '│   '));
          });
        };
        walk(root, '');
        if (out.length === start)
          out.push(t('cmd-tree-none', { defaultValue: 'No subfolders exist' }));
        break;
      }
      case 'type': {
        if (!args.length) {
          out.push(syntax);
          break;
        }
        for (const a of args) {
          const found = expand(v, a);
          if (!found || !found.length) {
            out.push(
              t('cmd-type-missing', { defaultValue: 'The system cannot find the file specified.' }),
            );
            continue;
          }
          for (const n of found) {
            if (n.kind === 'folder')
              out.push(t('cmd-access-denied', { defaultValue: 'Access is denied.' }));
            else if (n.kind === 'shortcut') out.push(`[InternetShortcut]`, `URL=${n.target ?? ''}`);
            else if (n.content?.startsWith('data:'))
              out.push(
                t('cmd-type-binary', {
                  defaultValue: 'This file is a picture and can’t be shown as text.',
                }),
              );
            else out.push(...(n.content ?? '').split(/\r?\n/));
          }
        }
        break;
      }
      case 'echo': {
        if (rest.startsWith('.')) out.push(rest.slice(1));
        else if (!rest.trim()) out.push(t('cmd-echo-on', { defaultValue: 'ECHO is on.' }));
        else out.push(rest.replace(/^\s/, ''));
        break;
      }
      case 'mkdir':
      case 'md': {
        if (!args.length) {
          out.push(syntax);
          break;
        }
        for (const a of args) {
          let path = a.replace(/\//g, '\\');
          let at = here;
          if (/^[a-z]:\\?/i.test(path)) {
            at = DRIVE;
            path = path.replace(/^[a-z]:\\?/i, '');
          } else if (path.startsWith('\\')) {
            at = DRIVE;
            path = path.slice(1);
          }
          const parts = path.split('\\').filter(Boolean);
          let existed = true;
          const err = useOs.getState().fs((cur) => {
            let next = cur;
            for (const p of parts) {
              if (p === '.') continue;
              if (p === '..') {
                const parent = next[at]?.parent;
                if (parent && parent !== ROOT) at = parent;
                continue;
              }
              const hit = children(next, at).find((n) => n.name.toLowerCase() === p.toLowerCase());
              if (hit) {
                if (hit.kind !== 'folder') {
                  throw new VfsError(
                    'exists',
                    t('cmd-md-exists', {
                      defaultValue: 'A subdirectory or file {{name}} already exists.',
                      name: a,
                    }),
                  );
                }
                at = hit.id;
                continue;
              }
              existed = false;
              const r = create(next, at, { name: p, kind: 'folder' });
              next = r.vfs;
              at = r.id;
            }
            return next;
          });
          if (fail(err)) continue;
          if (existed)
            out.push(
              t('cmd-md-exists', {
                defaultValue: 'A subdirectory or file {{name}} already exists.',
                name: a,
              }),
            );
        }
        break;
      }
      case 'del':
      case 'erase': {
        const targets = args.filter((a) => !a.startsWith('/'));
        if (!targets.length) {
          out.push(syntax);
          break;
        }
        for (const a of targets) {
          const found = expand(v, a);
          if (!found || !found.length) {
            out.push(t('cmd-del-missing', { defaultValue: 'Could Not Find {{path}}', path: a }));
            continue;
          }
          for (const n of found) {
            if (n.kind === 'folder') {
              if (!/[*?]/.test(a))
                out.push(
                  t('cmd-del-folder', {
                    defaultValue: '“{{name}}” is a folder. Use RMDIR to remove it.',
                    name: n.name,
                  }),
                );
              continue;
            }
            if (fail(fs((cur) => recycle(cur, n.id)))) break;
          }
        }
        break;
      }
      case 'rmdir':
      case 'rd': {
        const recursive = args.some((a) => a.toLowerCase() === '/s');
        const targets = args.filter((a) => !a.startsWith('/'));
        if (!targets.length) {
          out.push(syntax);
          break;
        }
        for (const a of targets) {
          const id = resolve(v, here, a);
          if (!id || !v[id]) {
            out.push(
              t('cmd-file-missing', { defaultValue: 'The system cannot find the file specified.' }),
            );
            continue;
          }
          if (v[id].kind !== 'folder') {
            out.push(t('cmd-dir-invalid', { defaultValue: 'The directory name is invalid.' }));
            continue;
          }
          if (!recursive && children(v, id).length) {
            out.push(t('cmd-rd-not-empty', { defaultValue: 'The directory is not empty.' }));
            continue;
          }
          fail(fs((cur) => recycle(cur, id)));
        }
        break;
      }
      case 'ren':
      case 'rename': {
        if (args.length !== 2 || /[\\/]/.test(args[1])) {
          out.push(syntax);
          break;
        }
        const id = resolve(v, here, args[0]);
        if (!id || !v[id]) {
          out.push(
            t('cmd-file-missing', { defaultValue: 'The system cannot find the file specified.' }),
          );
          break;
        }
        fail(fs((cur) => vfsRename(cur, id, args[1])));
        break;
      }
      case 'copy': {
        const [src, dest] = args.filter((a) => !a.startsWith('/'));
        if (!src) {
          out.push(syntax);
          break;
        }
        const found = expand(v, src)?.filter((n) => n.kind !== 'folder');
        if (!found || !found.length) {
          out.push(
            t('cmd-file-missing', { defaultValue: 'The system cannot find the file specified.' }),
          );
          break;
        }
        let copied = 0;
        for (const n of found) {
          const err = fs((cur) => {
            const target = dest ? resolve(cur, here, dest) : here;
            if (target && cur[target]?.kind === 'folder') return vfsCopy(cur, n.id, target).vfs;
            if (target && cur[target]?.kind === 'file' && n.kind === 'file') {
              if (target === n.id) {
                throw new VfsError(
                  'exists',
                  t('cmd-copy-self', { defaultValue: 'The file cannot be copied onto itself.' }),
                );
              }
              return writeContent(cur, target, n.content ?? '');
            }
            const clean = (dest ?? '').replace(/\//g, '\\');
            const cut = clean.lastIndexOf('\\');
            const dir = cut >= 0 ? resolve(cur, here, clean.slice(0, cut + 1)) : here;
            const newName = clean.slice(cut + 1);
            if (!dir || cur[dir]?.kind !== 'folder' || !newName)
              throw new VfsError('not-found', notFoundPath);
            const r = vfsCopy(cur, n.id, dir);
            return vfsRename(r.vfs, r.id, newName);
          });
          if (fail(err)) break;
          copied++;
        }
        out.push(
          t('cmd-copied', { defaultValue: '        {{count}} file(s) copied.', count: copied }),
        );
        break;
      }
      case 'date': {
        const d = new Date();
        out.push(
          t('cmd-date', {
            defaultValue: 'The current date is: {{date}}',
            date: d.toLocaleDateString(lang, {
              weekday: 'short',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }),
          }),
        );
        break;
      }
      case 'time': {
        const d = new Date();
        const cs = String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0');
        out.push(
          t('cmd-time', {
            defaultValue: 'The current time is: {{time}}',
            time: `${d.toLocaleTimeString(lang, { hour12: false })}.${cs}`,
          }),
        );
        break;
      }
      case 'whoami':
        out.push(`dunesday-pc\\${(v[HOME]?.name ?? 'user').toLowerCase().replace(/\s+/g, '')}`);
        break;
      case 'hostname':
        out.push('DUNESDAY-PC');
        break;
      case 'start': {
        const target = args[0];
        if (!target) {
          openApp('cmd');
          break;
        }
        const alias = RUN_ALIASES[target.toLowerCase().replace(/\.exe$/, '')];
        if (alias) {
          openApp(alias);
          break;
        }
        if (/^https?:\/\//i.test(target)) {
          openApp('ie', { params: { url: target } });
          break;
        }
        const id = resolve(v, here, target);
        if (id && v[id]) {
          openNode(v[id], (n) =>
            t('cannot-open', {
              defaultValue:
                'Windows can’t open “{{name}}”. There is no program on this computer for this type of file.',
              name: n,
            }),
          );
          break;
        }
        out.push(
          t('cmd-start-missing', {
            defaultValue:
              'Windows cannot find “{{name}}”. Make sure you typed the name correctly, and then try again.',
            name: target,
          }),
        );
        break;
      }
      case 'exit':
        useOs.getState().close(win.id);
        return { out: [] };
      case 'color': {
        const attr = (args[0] ?? '07').toLowerCase();
        if (!/^[0-9a-f]{1,2}$/.test(attr)) {
          out.push(
            t('cmd-color-usage', {
              defaultValue:
                'COLOR [attr] — two hex digits: background then foreground. 0 Black 1 Blue 2 Green 3 Aqua 4 Red 5 Purple 6 Yellow 7 White 8 Gray 9 Light Blue A Light Green B Light Aqua C Light Red D Light Purple E Light Yellow F Bright White',
            }),
          );
          break;
        }
        const bg = attr.length === 2 ? parseInt(attr[0], 16) : 0;
        const fg = parseInt(attr[attr.length - 1], 16);
        if (bg !== fg) setColors([bg, fg]);
        break;
      }
      case 'title':
        useOs
          .getState()
          .setTitle(win.id, rest.trim() || t('app-cmd', { defaultValue: 'Command Prompt' }));
        break;
      case 'tasklist': {
        const procs = processes(useOs.getState().windows);
        out.push(
          '',
          `${t('cmd-tl-image', { defaultValue: 'Image Name' }).padEnd(25)} ${t('cmd-tl-pid', { defaultValue: 'PID' }).padStart(8)} ${t('cmd-tl-session', { defaultValue: 'Session Name' }).padEnd(16)} ${t('cmd-tl-sessnum', { defaultValue: 'Session#' }).padStart(11)} ${t('cmd-tl-mem', { defaultValue: 'Mem Usage' }).padStart(12)}`,
          `${'='.repeat(25)} ${'='.repeat(8)} ${'='.repeat(16)} ${'='.repeat(11)} ${'='.repeat(12)}`,
        );
        for (const p of procs) {
          out.push(
            `${p.image.padEnd(25)} ${String(p.pid).padStart(8)} ${'Console'.padEnd(16)} ${'1'.padStart(11)} ${`${num(p.mem)} K`.padStart(12)}`,
          );
        }
        break;
      }
      case 'taskkill': {
        const lower = args.map((a) => a.toLowerCase());
        const im = lower.indexOf('/im');
        const pidAt = lower.indexOf('/pid');
        const want = im >= 0 ? args[im + 1] : pidAt >= 0 ? args[pidAt + 1] : undefined;
        if (!want) {
          out.push(
            t('cmd-taskkill-usage', {
              defaultValue: 'ERROR: Invalid syntax. Use TASKKILL /IM imagename or /PID processid.',
            }),
          );
          break;
        }
        const procs = processes(useOs.getState().windows);
        const wanted = want.toLowerCase().replace(/\.exe$/, '');
        const hits = procs.filter((p) =>
          im >= 0
            ? p.image.toLowerCase().replace(/\.(exe|scr)$/, '') === wanted
            : String(p.pid) === want,
        );
        if (!hits.length) {
          out.push(
            t('cmd-taskkill-missing', {
              defaultValue: 'ERROR: The process “{{name}}” not found.',
              name: want,
            }),
          );
          break;
        }
        for (const p of hits) {
          if (!p.win) {
            out.push(
              t('cmd-taskkill-critical', {
                defaultValue:
                  'ERROR: The process “{{name}}” with PID {{pid}} could not be terminated. Reason: it is a critical system process.',
                name: p.image,
                pid: p.pid,
              }),
            );
            continue;
          }
          out.push(
            t('cmd-taskkill-ok', {
              defaultValue:
                'SUCCESS: Sent termination signal to the process “{{name}}” with PID {{pid}}.',
              name: p.image,
              pid: p.pid,
            }),
          );
        }
        // Close after printing so killing our own cmd.exe still reports first.
        const ids = hits.filter((p) => p.win).map((p) => p.win!.id);
        if (ids.length) window.setTimeout(() => ids.forEach((id) => useOs.getState().close(id)), 0);
        break;
      }
      case 'ping': {
        const host = args.filter((a) => !a.startsWith('-') && !a.startsWith('/'))[0];
        if (!host) {
          out.push(t('cmd-ping-usage', { defaultValue: 'Usage: ping target_name' }));
          break;
        }
        const local = /^(localhost|127\.0\.0\.1|::1|dunesday-pc)$/i.test(host);
        if (!local) {
          out.push(
            t('cmd-ping-nohost', {
              defaultValue:
                'Ping request could not find host {{host}}. Please check the name and try again.',
              host,
            }),
            simulated,
          );
          break;
        }
        const addr = host === '::1' ? '::1' : '127.0.0.1';
        out.push(
          '',
          t('cmd-ping-start', {
            defaultValue: 'Pinging {{host}} [{{addr}}] with 32 bytes of data:',
            host,
            addr,
          }),
        );
        for (let i = 0; i < 4; i++)
          out.push(
            t('cmd-ping-reply', {
              defaultValue: 'Reply from {{addr}}: bytes=32 time<1ms TTL=128',
              addr,
            }),
          );
        out.push(
          '',
          t('cmd-ping-stats', { defaultValue: 'Ping statistics for {{addr}}:', addr }),
          t('cmd-ping-packets', {
            defaultValue: '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
          }),
          '',
          simulated,
        );
        break;
      }
      case 'ipconfig':
        out.push(
          '',
          t('cmd-ip-title', { defaultValue: 'Windows IP Configuration' }),
          '',
          '',
          t('cmd-ip-eth', { defaultValue: 'Ethernet adapter Local Area Connection:' }),
          '',
          `   ${t('cmd-ip-media', { defaultValue: 'Media State . . . . . . . . . . . : Media disconnected' })}`,
          '',
          t('cmd-ip-loop', { defaultValue: 'Tunnel adapter Loopback Pseudo-Interface 1:' }),
          '',
          `   ${t('cmd-ip-v6', { defaultValue: 'Link-local IPv6 Address . . . . . :' })} ::1`,
          `   ${t('cmd-ip-v4', { defaultValue: 'IPv4 Address. . . . . . . . . . . :' })} 127.0.0.1`,
          `   ${t('cmd-ip-mask', { defaultValue: 'Subnet Mask . . . . . . . . . . . :' })} 255.0.0.0`,
          `   ${t('cmd-ip-gw', { defaultValue: 'Default Gateway . . . . . . . . . :' })}`,
          '',
          simulated,
        );
        break;
      case 'dunesday': {
        const daysLeft = daysBetween(today, DUNESDAY);
        out.push(
          t('cmd-ds-title', { defaultValue: 'Dunesday 7 marathon status' }),
          '',
          `  ${t('cmd-ds-watched', {
            defaultValue: 'Watched ......... {{pct}}% ({{done}} of {{total}} titles)',
            pct,
            done: progress.titlesWatched,
            total: progress.titlesTotal,
          })}`,
          `  ${t('cmd-ds-remaining', { defaultValue: 'Remaining ....... {{time}}', time: formatMinutes(remainingMinutes) })}`,
        );
        if (plan.impossible) {
          out.push(
            `  ${t('cmd-ds-impossible', { defaultValue: 'Finish date ..... not possible before the deadline' })}`,
          );
        } else if (plan.finishDate) {
          out.push(
            `  ${
              plan.onTime
                ? t('cmd-ds-finish-ok', {
                    defaultValue: 'Finish date ..... {{date}} (on track, {{n}} days to spare)',
                    date: dayLabel(plan.finishDate),
                    n: plan.slackDays,
                  })
                : t('cmd-ds-finish-late', {
                    defaultValue: 'Finish date ..... {{date}} ({{n}} days late — pick up the pace)',
                    date: dayLabel(plan.finishDate),
                    n: -plan.slackDays,
                  })
            }`,
          );
        } else {
          out.push(
            `  ${t('cmd-ds-done', { defaultValue: 'Finish date ..... done — everything is watched' })}`,
          );
        }
        out.push(
          `  ${t('cmd-ds-day', {
            defaultValue: 'Dunesday ........ {{date}} ({{n}} days away)',
            date: dayLabel(DUNESDAY),
            n: Math.max(0, daysLeft),
          })}`,
        );
        const titles = (tonight?.entries ?? []).map((e) => {
          const name = titleById(state, e.titleId)?.title ?? e.titleId;
          if (e.episodes) return `${name} (${e.episodes[0]}–${e.episodes[1]})`;
          if (e.part) return `${name} (${e.part[0]}/${e.part[1]})`;
          return name;
        });
        out.push(
          `  ${
            titles.length
              ? t('cmd-ds-tonight', {
                  defaultValue: 'Tonight ......... {{titles}}',
                  titles: titles.join(', '),
                })
              : t('cmd-ds-tonight-none', {
                  defaultValue: 'Tonight ......... nothing planned — a night off',
                })
          }`,
        );
        break;
      }
      case 'shutdown':
        out.push(
          t('cmd-shutdown', { defaultValue: 'Shutting down is not available in the sandbox.' }),
        );
        showMessage({
          icon: 'info',
          text: t('cmd-shutdown-msg', {
            defaultValue:
              'Dunesday 7 can’t shut down your real computer. To leave, use Log off in the Start menu — your files stay here.',
          }),
        });
        break;
      default: {
        if (/^[a-z]:$/.test(name)) {
          out.push(
            t('cmd-no-drive', { defaultValue: 'The system cannot find the drive specified.' }),
          );
          break;
        }
        const alias = RUN_ALIASES[name];
        if (alias) {
          openApp(alias);
          break;
        }
        const id = resolve(v, here, trimmed);
        if (id && v[id] && v[id].kind !== 'folder') {
          openNode(v[id], (n) =>
            t('cannot-open', {
              defaultValue:
                'Windows can’t open “{{name}}”. There is no program on this computer for this type of file.',
              name: n,
            }),
          );
          break;
        }
        out.push(
          t('cmd-unknown', {
            defaultValue:
              '“{{name}}” is not recognized as an internal or external command, operable program or batch file.',
            name: m ? m[1] : trimmed,
          }),
        );
      }
    }
    return { out };
  };

  const append = (texts: string[]) =>
    setLines((cur) =>
      [...cur, ...texts.map((text) => ({ id: nextId.current++, text }))].slice(-2000),
    );

  const submit = () => {
    const raw = input;
    setInput('');
    histIdx.current = null;
    completion.current = null;
    const echo = `${prompt}${raw}`;
    if (!raw.trim()) {
      append([echo]);
      return;
    }
    setHistory((h) => (h[h.length - 1] === raw ? h : [...h, raw].slice(-100)));
    const res = execute(raw);
    if (res.clear) {
      setLines([]);
      return;
    }
    append([echo, ...res.out, '']);
  };

  const complete = (back: boolean) => {
    const c = completion.current;
    if (c && c.result === input && c.options.length > 1) {
      c.i = (c.i + (back ? -1 : 1) + c.options.length) % c.options.length;
      c.result = c.head + c.options[c.i];
      setInput(c.result);
      return;
    }
    const quotes = (input.match(/"/g) ?? []).length;
    const start = quotes % 2 ? input.lastIndexOf('"') : input.lastIndexOf(' ') + 1;
    const token = input.slice(start).replace(/"/g, '');
    const cut = token.lastIndexOf('\\');
    const dirPart = cut >= 0 ? token.slice(0, cut + 1) : '';
    const prefix = token.slice(cut + 1).toLowerCase();
    const dir = dirPart ? resolve(vfs, here, dirPart) : here;
    if (!dir) return;
    const foldersOnly = /^\s*(cd|chdir|md|mkdir|rd|rmdir|tree)\b/i.test(input);
    const options = children(vfs, dir)
      .filter(
        (n) => (!foldersOnly || n.kind === 'folder') && n.name.toLowerCase().startsWith(prefix),
      )
      .map((n) => {
        const full = dirPart + n.name;
        return /\s/.test(full) ? `"${full}"` : full;
      });
    if (!options.length) return;
    const head = input.slice(0, start);
    const i = back ? options.length - 1 : 0;
    const result = head + options[i];
    completion.current = { result, options, head, i };
    setInput(result);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') completion.current = null;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!history.length) return;
      const i = histIdx.current === null ? history.length - 1 : Math.max(0, histIdx.current - 1);
      histIdx.current = i;
      setInput(history[i]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx.current === null) return;
      const i = histIdx.current + 1;
      if (i >= history.length) {
        histIdx.current = null;
        setInput('');
      } else {
        histIdx.current = i;
        setInput(history[i]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete(e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInput('');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setLines([]);
    } else if (
      e.ctrlKey &&
      e.key.toLowerCase() === 'c' &&
      e.currentTarget.selectionStart === e.currentTarget.selectionEnd
    ) {
      e.preventDefault();
      append([`${prompt}${input}^C`]);
      setInput('');
      histIdx.current = null;
    }
  };

  const [bg, fg] = colors;

  return (
    <div className="ds-cmd" style={{ background: PALETTE[bg], color: PALETTE[fg] }}>
      <div
        ref={scrollRef}
        className="ds-cmd-scroll"
        role="presentation"
        onClick={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
      >
        <div
          className="ds-cmd-log"
          role="log"
          aria-live="polite"
          aria-label={t('cmd-output', { defaultValue: 'Console output' })}
        >
          {lines.map((l) => (
            <div key={l.id} className="ds-cmd-line">
              {l.text || ' '}
            </div>
          ))}
        </div>
        <div className="ds-cmd-prompt">
          <span className="ds-cmd-ps" aria-hidden="true">
            {prompt}
          </span>
          <input
            ref={inputRef}
            className="ds-cmd-input"
            style={{ color: PALETTE[fg], caretColor: PALETTE[fg] }}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              histIdx.current = null;
            }}
            onKeyDown={onKeyDown}
            aria-label={t('cmd-input', { defaultValue: 'Command at {{prompt}}', prompt })}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      </div>
    </div>
  );
}
