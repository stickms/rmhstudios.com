'use client';

/**
 * Notepad. Opens and saves plain-text files in the sandbox file system.
 *
 * File: New, Open…, Save, Save As…, Exit. Edit: Undo (the textarea's own),
 * Cut/Copy/Paste via the keyboard, Select All, Time/Date (F5) — and Find
 * (Ctrl+F). Format: Word Wrap, font size. View: Status Bar. Closing or opening
 * over unsaved work asks first, like the real one.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  children,
  create,
  DOCUMENTS,
  DESKTOP,
  HOME,
  uniqueName,
  writeContent,
  type VNode,
} from '@/lib/dunesday/vfs';
import { sfx } from '../../sound';
import { isText, showMessage } from '../actions';
import type { AppProps } from '../apps';
import { Icon } from '../icons';
import { PopupMenu, type MenuItem } from '../Menu';
import { useOs } from '../store';

type Modal =
  | null
  | { kind: 'saveas'; then?: () => void }
  | { kind: 'open' }
  | { kind: 'unsaved'; then: () => void };

export default function NotepadApp({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const vfs = useOs((s) => s.vfs);
  const fs = useOs((s) => s.fs);
  const setTitle = useOs((s) => s.setTitle);
  const close = useOs((s) => s.close);
  const [fileId, setFileId] = useState<string | null>(win.params?.file ?? null);
  const file = fileId ? vfs[fileId] : undefined;
  const [text, setText] = useState(() =>
    fileId ? (useOs.getState().vfs[fileId]?.content ?? '') : '',
  );
  const [saved, setSaved] = useState(text);
  const [wrap, setWrap] = useState(true);
  const [status, setStatus] = useState(true);
  const [fontSize, setFontSize] = useState(15);
  const [menu, setMenu] = useState<null | {
    x: number;
    y: number;
    which: 'file' | 'edit' | 'format' | 'view';
  }>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [find, setFind] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== saved;

  const name = file?.name ?? t('np-untitled', { defaultValue: 'Untitled' });
  useEffect(() => {
    setTitle(
      win.id,
      t('np-title', { defaultValue: '{{dirty}}{{name}} - Notepad', name, dirty: dirty ? '*' : '' }),
    );
  }, [name, dirty, setTitle, t, win.id]);

  const guard = (then: () => void) => (dirty ? setModal({ kind: 'unsaved', then }) : then());

  const save = (then?: () => void) => {
    if (!file) return setModal({ kind: 'saveas', then });
    const err = fs((v) => writeContent(v, file.id, text));
    if (err) return showMessage({ icon: 'error', text: err.message });
    setSaved(text);
    sfx.tick();
    then?.();
  };

  const saveAs = (folder: string, wanted: string, then?: () => void) => {
    const fname = /\.[a-z0-9]+$/i.test(wanted) ? wanted : `${wanted}.txt`;
    let id: string | null = null;
    const err = fs((v) => {
      const r = create(v, folder, {
        name: uniqueName(v, folder, fname),
        kind: 'file',
        content: text,
      });
      id = r.id;
      return r.vfs;
    });
    if (err || !id) return showMessage({ icon: 'error', text: err?.message ?? '' });
    setFileId(id);
    setSaved(text);
    setModal(null);
    sfx.tick();
    then?.();
  };

  const openFile = (node: VNode) => {
    setFileId(node.id);
    setText(node.content ?? '');
    setSaved(node.content ?? '');
    setModal(null);
  };

  const insertAtCaret = (s: string) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = text.slice(0, a) + s + text.slice(b);
    setText(next);
    afterCommit(() => {
      el.focus();
      el.setSelectionRange(a + s.length, a + s.length);
    });
  };

  const timeDate = () =>
    insertAtCaret(
      new Date().toLocaleString(i18n.language, { timeStyle: 'short', dateStyle: 'short' }),
    );

  const findNext = (needle: string) => {
    const el = area.current;
    if (!el || !needle) return;
    const from = el.selectionEnd;
    let i = text.toLowerCase().indexOf(needle.toLowerCase(), from);
    if (i < 0) i = text.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0) {
      showMessage({
        icon: 'info',
        text: t('np-not-found', { defaultValue: 'Cannot find “{{q}}”', q: needle }),
      });
      return;
    }
    el.focus();
    el.setSelectionRange(i, i + needle.length);
  };

  const menus: Record<'file' | 'edit' | 'format' | 'view', MenuItem[]> = {
    file: [
      {
        label: t('np-new', { defaultValue: 'New' }),
        hint: 'Ctrl+N',
        onSelect: () =>
          guard(() => {
            setFileId(null);
            setText('');
            setSaved('');
          }),
      },
      {
        label: t('np-open', { defaultValue: 'Open…' }),
        hint: 'Ctrl+O',
        onSelect: () => guard(() => setModal({ kind: 'open' })),
      },
      { label: t('np-save', { defaultValue: 'Save' }), hint: 'Ctrl+S', onSelect: () => save() },
      {
        label: t('np-saveas', { defaultValue: 'Save As…' }),
        onSelect: () => setModal({ kind: 'saveas' }),
      },
      { separator: true },
      { label: t('np-exit', { defaultValue: 'Exit' }), onSelect: () => guard(() => close(win.id)) },
    ],
    edit: [
      {
        label: t('np-find', { defaultValue: 'Find…' }),
        hint: 'Ctrl+F',
        onSelect: () => setFind(''),
      },
      {
        label: t('np-selectall', { defaultValue: 'Select All' }),
        hint: 'Ctrl+A',
        onSelect: () => area.current?.select(),
      },
      { label: t('np-timedate', { defaultValue: 'Time/Date' }), hint: 'F5', onSelect: timeDate },
    ],
    format: [
      {
        label: t('np-wrap', { defaultValue: 'Word Wrap' }),
        checked: wrap,
        onSelect: () => setWrap((w) => !w),
      },
      { separator: true },
      {
        label: t('np-font-small', { defaultValue: 'Small text' }),
        checked: fontSize === 13,
        onSelect: () => setFontSize(13),
      },
      {
        label: t('np-font-medium', { defaultValue: 'Medium text' }),
        checked: fontSize === 15,
        onSelect: () => setFontSize(15),
      },
      {
        label: t('np-font-large', { defaultValue: 'Large text' }),
        checked: fontSize === 19,
        onSelect: () => setFontSize(19),
      },
    ],
    view: [
      {
        label: t('np-statusbar', { defaultValue: 'Status Bar' }),
        checked: status,
        onSelect: () => setStatus((s) => !s),
      },
    ],
  };

  const updateCaret = () => {
    const el = area.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const lines = before.split('\n');
    setCaret({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  return (
    <div className="ds-np">
      <div
        className="ds-menubar7"
        role="menubar"
        aria-label={t('np-menubar', { defaultValue: 'Notepad menu' })}
      >
        {(
          [
            ['file', t('np-m-file', { defaultValue: 'File' })],
            ['edit', t('np-m-edit', { defaultValue: 'Edit' })],
            ['format', t('np-m-format', { defaultValue: 'Format' })],
            ['view', t('np-m-view', { defaultValue: 'View' })],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={menu?.which === key}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom, which: key });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {find !== null && (
        <form
          className="ds-np-find"
          onSubmit={(e) => {
            e.preventDefault();
            findNext(find);
          }}
        >
          <label>
            {t('np-find-what', { defaultValue: 'Find what:' })}
            <input
              className="ds-field7"
               
              autoFocus
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setFind(null)}
            />
          </label>
          <button type="submit" className="ds-btn7" disabled={!find}>
            {t('np-find-next', { defaultValue: 'Find Next' })}
          </button>
          <button type="button" className="ds-btn7" onClick={() => setFind(null)}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
        </form>
      )}

      <textarea
        ref={area}
        className="ds-np-text"
        style={{
          fontSize,
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          overflowX: wrap ? 'hidden' : 'auto',
        }}
        value={text}
        spellCheck={false}
        aria-label={t('np-area', { defaultValue: 'Text editor' })}
        onChange={(e) => {
          setText(e.target.value);
          updateCaret();
        }}
        onSelect={updateCaret}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (e.key === 'F5') {
            e.preventDefault();
            timeDate();
          } else if (mod && e.key.toLowerCase() === 's') {
            e.preventDefault();
            save();
          } else if (mod && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            guard(() => setModal({ kind: 'open' }));
          } else if (mod && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            setFind('');
          } else if (e.key === 'F3' && find) {
            e.preventDefault();
            findNext(find);
          }
        }}
      />

      {status && (
        <div className="ds-np-status">
          <span>{file ? file.name : ''}</span>
          <span>
            {t('np-caret', {
              defaultValue: 'Ln {{line}}, Col {{col}}',
              line: caret.line,
              col: caret.col,
            })}
          </span>
        </div>
      )}

      {menu && (
        <PopupMenu
          at={{ x: menu.x, y: menu.y }}
          items={menus[menu.which]}
          label={menu.which}
          placement="below"
          onClose={() => setMenu(null)}
        />
      )}

      {modal?.kind === 'saveas' && (
        <SaveAs
          defaultName={file?.name ?? t('np-default-name', { defaultValue: 'Untitled.txt' })}
          onCancel={() => setModal(null)}
          onSave={(folder, n) => saveAs(folder, n, modal.then)}
        />
      )}
      {modal?.kind === 'open' && <OpenDialog onCancel={() => setModal(null)} onOpen={openFile} />}
      {modal?.kind === 'unsaved' && (
        <div className="ds-modal7" role="alertdialog" aria-modal="true" aria-label="Notepad">
          <div className="ds-modal7-box">
            <div className="ds-modal7-msg">
              <Icon name="warning" size={32} />
              <p>
                {t('np-unsaved', {
                  defaultValue: 'Do you want to save changes to {{name}}?',
                  name,
                })}
              </p>
            </div>
            <div className="ds-dialog-foot">
              <button
                type="button"
                className="ds-btn7"
                 
                autoFocus
                onClick={() => {
                  const then = modal.then;
                  setModal(null);
                  save(then);
                }}
              >
                {t('np-save', { defaultValue: 'Save' })}
              </button>
              <button
                type="button"
                className="ds-btn7"
                onClick={() => {
                  const then = modal.then;
                  setModal(null);
                  then();
                }}
              >
                {t('np-dont-save', { defaultValue: 'Don’t Save' })}
              </button>
              <button type="button" className="ds-btn7" onClick={() => setModal(null)}>
                {t('cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Defer to after React commits the new value, without a frame loop. */
function afterCommit(fn: () => void) {
  window.setTimeout(fn, 0);
}

const SAVE_FOLDERS = [DOCUMENTS, DESKTOP, HOME];

function SaveAs({
  defaultName,
  onSave,
  onCancel,
}: {
  defaultName: string;
  onSave: (folder: string, name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('c-dunesday');
  const vfs = useOs((s) => s.vfs);
  const [folder, setFolder] = useState(DOCUMENTS);
  const [fname, setFname] = useState(defaultName);
  return (
    <div
      className="ds-modal7"
      role="dialog"
      aria-modal="true"
      aria-label={t('np-saveas', { defaultValue: 'Save As…' })}
    >
      <form
        className="ds-modal7-box"
        onSubmit={(e) => {
          e.preventDefault();
          if (fname.trim()) onSave(folder, fname.trim());
        }}
      >
        <label className="ds-modal7-field">
          {t('np-save-in', { defaultValue: 'Save in:' })}
          <select className="ds-field7" value={folder} onChange={(e) => setFolder(e.target.value)}>
            {SAVE_FOLDERS.map((f) => (
              <option key={f} value={f}>
                {vfs[f]?.name ?? f}
              </option>
            ))}
          </select>
        </label>
        <label className="ds-modal7-field">
          {t('np-file-name', { defaultValue: 'File name:' })}
          <input
            className="ds-field7"
             
            autoFocus
            value={fname}
            onChange={(e) => setFname(e.target.value)}
            onFocus={(e) => {
              const dot = e.currentTarget.value.lastIndexOf('.');
              e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length);
            }}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          />
        </label>
        <div className="ds-dialog-foot">
          <button type="submit" className="ds-btn7" disabled={!fname.trim()}>
            {t('np-save', { defaultValue: 'Save' })}
          </button>
          <button type="button" className="ds-btn7" onClick={onCancel}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      </form>
    </div>
  );
}

function OpenDialog({ onOpen, onCancel }: { onOpen: (n: VNode) => void; onCancel: () => void }) {
  const { t } = useTranslation('c-dunesday');
  const vfs = useOs((s) => s.vfs);
  const files = useMemo(() => SAVE_FOLDERS.flatMap((f) => children(vfs, f).filter(isText)), [vfs]);
  const [pick, setPick] = useState<string | null>(files[0]?.id ?? null);
  return (
    <div
      className="ds-modal7"
      role="dialog"
      aria-modal="true"
      aria-label={t('np-open', { defaultValue: 'Open…' })}
    >
      <div className="ds-modal7-box">
        {files.length ? (
          <ul
            className="ds-modal7-list"
            role="listbox"
            aria-label={t('np-text-files', { defaultValue: 'Text documents' })}
          >
            {files.map((f) => (
              <li
                key={f.id}
                role="option"
                aria-selected={pick === f.id}
                tabIndex={pick === f.id ? 0 : -1}
                onClick={() => setPick(f.id)}
                onDoubleClick={() => onOpen(f)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(f)}
              >
                <Icon name="txt" size={18} />
                <span>{f.name}</span>
                <small>{vfs[f.parent ?? '']?.name}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {t('np-no-files', {
              defaultValue: 'No text documents in Documents, Desktop or your user folder yet.',
            })}
          </p>
        )}
        <div className="ds-dialog-foot">
          <button
            type="button"
            className="ds-btn7"
            disabled={!pick}
            onClick={() => pick && vfs[pick] && onOpen(vfs[pick])}
          >
            {t('np-open-btn', { defaultValue: 'Open' })}
          </button>
          <button type="button" className="ds-btn7" onClick={onCancel}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      </div>
    </div>
  );
}
