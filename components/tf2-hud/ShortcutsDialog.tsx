/**
 * The keyboard shortcut sheet (press `?`).
 */
'use client';

import { useTranslation } from 'react-i18next';
import { Modal } from './ui';

export default function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: t('sc-edit', { defaultValue: 'Editing' }),
      rows: [
        ['Ctrl/⌘ + Z', t('sc-undo', { defaultValue: 'Undo' })],
        ['Ctrl/⌘ + Shift + Z  ·  Ctrl + Y', t('sc-redo', { defaultValue: 'Redo' })],
        ['Ctrl/⌘ + S', t('sc-save', { defaultValue: 'Save (to your account when signed in)' })],
        ['Ctrl/⌘ + Shift + E', t('sc-export', { defaultValue: 'Download HUD' })],
        ['Ctrl/⌘ + K', t('sc-palette', { defaultValue: 'Command palette' })],
        ['Ctrl/⌘ + F', t('sc-find', { defaultValue: 'Find in the open file' })],
      ],
    },
    {
      title: t('sc-preview', { defaultValue: 'Preview' }),
      rows: [
        ['← ↑ → ↓', t('sc-nudge', { defaultValue: 'Nudge the selected panel by 1 unit' })],
        ['Shift + ← ↑ → ↓', t('sc-nudge10', { defaultValue: 'Nudge by 10 units' })],
        ['Esc', t('sc-deselect', { defaultValue: 'Deselect' })],
        ['Double-click', t('sc-open-file', { defaultValue: 'Open a file to preview it alone' })],
      ],
    },
    {
      title: t('sc-general', { defaultValue: 'General' }),
      rows: [['?', t('sc-help', { defaultValue: 'Show this sheet' })]],
    },
  ];
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('shortcuts', { defaultValue: 'Keyboard shortcuts' })}
    >
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="tf2hud-panel-head mb-1">{g.title}</h3>
            <dl className="divide-y divide-(--app-border)">
              {g.rows.map(([keys, what]) => (
                <div key={keys} className="flex items-center justify-between gap-4 py-1.5 text-xs">
                  <dt className="text-(--app-text-muted)">{what}</dt>
                  <dd className="shrink-0 rounded-(--app-radius-sm) bg-(--app-bg) px-1.5 py-0.5 font-mono text-[11px] text-(--app-text)">
                    {keys}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
