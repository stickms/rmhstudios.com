'use client';

/**
 * The Run box (Win+R): type a program, a folder or a path and Dunesday 7
 * opens it. Understands the aliases in `RUN_ALIASES` (notepad, calc, winmine,
 * iexplore…), file-system paths (C:\Users\…), and web addresses (handed to
 * Internet Explorer, which keeps its own sandbox rules).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HOME, resolve } from '@/lib/dunesday/vfs';
import { sfx } from '../../sound';
import { openApp, openNode, showMessage } from '../actions';
import { RUN_ALIASES, type AppProps } from '../apps';
import { Icon } from '../icons';
import { useOs } from '../store';

const HISTORY_KEY = 'dunesday:run';

function loadHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === 'string').slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

export default function RunApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const close = useOs((s) => s.close);
  const [value, setValue] = useState(() => loadHistory()[0] ?? '');
  const [history] = useState(loadHistory);
  const listId = `${win.id}-history`;

  const run = () => {
    const input = value.trim();
    if (!input) return;
    const cannotOpen = (name: string) =>
      t('cannot-open', {
        defaultValue:
          'Windows can’t open “{{name}}”. There is no program on this computer for this type of file.',
        name,
      });
    const lower = input.toLowerCase().replace(/\.exe$/, '');
    let ok = true;
    if (RUN_ALIASES[lower]) openApp(RUN_ALIASES[lower]);
    else if (/^(https?:\/\/|www\.)/i.test(input) || /^about:/i.test(input))
      openApp('ie', { params: { url: input.startsWith('www.') ? `https://${input}` : input } });
    else {
      const vfs = useOs.getState().vfs;
      const id = resolve(vfs, HOME, input);
      if (id && vfs[id]) openNode(vfs[id], cannotOpen);
      else ok = false;
    }
    if (!ok) {
      showMessage({
        icon: 'error',
        title: input,
        text: t('run-not-found', {
          defaultValue:
            'Windows cannot find “{{name}}”. Make sure you typed the name correctly, and then try again.',
          name: input,
        }),
      });
      return;
    }
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([input, ...history.filter((h) => h !== input)].slice(0, 10)),
      );
    } catch {
      // History is a convenience.
    }
    sfx.tick();
    close(win.id);
  };

  return (
    <form
      className="ds-run"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <div className="ds-run-head">
        <Icon name="run" size={32} />
        <p>
          {t('run-blurb', {
            defaultValue:
              'Type the name of a program, folder, document, or Internet resource, and Dunesday 7 will open it for you.',
          })}
        </p>
      </div>
      <label className="ds-run-field">
        <span>{t('run-open', { defaultValue: 'Open:' })}</span>
        <input
          className="ds-field7"
           
          autoFocus
          list={listId}
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === 'Escape' && close(win.id)}
        />
        <datalist id={listId}>
          {[...history, ...Object.keys(RUN_ALIASES)].map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </label>
      <div className="ds-dialog-foot">
        <button type="submit" className="ds-btn7" disabled={!value.trim()}>
          {t('ok', { defaultValue: 'OK' })}
        </button>
        <button type="button" className="ds-btn7" onClick={() => close(win.id)}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    </form>
  );
}
