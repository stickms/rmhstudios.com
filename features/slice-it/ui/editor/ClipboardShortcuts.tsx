/**
 * The clipboard and time bindings, as rows for the shortcut sheet. Kept in its own
 * component so its strings live in the `slice-it-clipboard` namespace.
 */

import { useTranslation } from 'react-i18next';

export function ClipboardShortcuts() {
  const { t } = useTranslation('slice-it-clipboard');
  const rows: { keys: string; action: string }[] = [
    { keys: 'Ctrl+C  Ctrl+X', action: t('key-copy-cut', { defaultValue: 'Copy / cut the selection' }) },
    { keys: 'Ctrl+V', action: t('key-paste', { defaultValue: 'Paste at the playhead' }) },
    { keys: 'Ctrl+Shift+V', action: t('key-paste-mirrored', { defaultValue: 'Paste mirrored' }) },
    { keys: 'Ctrl+D', action: t('key-duplicate', { defaultValue: 'Duplicate one measure on' }) },
    { keys: 'H', action: t('key-mirror', { defaultValue: 'Mirror the selection' }) },
    { keys: 'Q', action: t('key-quantize', { defaultValue: 'Quantize the selection' }) },
    { keys: 'Ctrl+Shift+S', action: t('key-scale', { defaultValue: 'Scale timing' }) },
    { keys: 'Ctrl+I', action: t('key-insert-time', { defaultValue: 'Insert time at the playhead' }) },
    { keys: 'Ctrl+Shift+L', action: t('key-remove-time', { defaultValue: 'Remove time at the playhead' }) },
  ];
  return (
    <>
      {rows.map((row) => (
        <div key={row.keys} className="contents">
          <dt className="font-mono text-xs opacity-80">{row.keys}</dt>
          <dd>{row.action}</dd>
        </div>
      ))}
    </>
  );
}
