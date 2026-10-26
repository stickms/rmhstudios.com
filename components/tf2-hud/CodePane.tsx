/**
 * The code tab: open-file strip, then a code editor for text files or a
 * viewer for binary ones.
 */
'use client';

import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TfTabs, type TfTab } from './TfTabs';
import { basename, categoryOf, isTextPath } from '@/lib/tf2-hud/project/paths';
import { useEditor } from '@/lib/tf2-hud/store';
import CodeEditor from './CodeEditor';
import { EmptyNote, IconBtn } from './ui';

function BinaryNote({ path }: { path: string }) {
  const { t } = useTranslation('c-tf2-hud');
  const cat = categoryOf(path);
  return (
    <EmptyNote>
      {cat === 'image' || cat === 'font' || cat === 'sound'
        ? t('binary-assets', {
            defaultValue: 'This is a binary file — manage it in the Assets tab.',
          })
        : t('binary-file', { defaultValue: 'Binary file; nothing to edit as text.' })}
    </EmptyNote>
  );
}

export default function CodePane() {
  const { t } = useTranslation('c-tf2-hud');
  const openPaths = useEditor((s) => s.openPaths);
  const activePath = useEditor((s) => s.activePath);
  const openFile = useEditor((s) => s.openFile);
  const closeFile = useEditor((s) => s.closeFile);
  const loaded = useEditor((s) => {
    void s.baseVersion;
    return activePath ? s.readText(activePath) !== undefined : false;
  });

  if (openPaths.length === 0 || !activePath) {
    return (
      <EmptyNote>
        {t('code-empty', {
          defaultValue:
            'Open a file from the tree, or double-click a panel in the preview, to edit its source.',
        })}
      </EmptyNote>
    );
  }

  const tabs: TfTab[] = openPaths.map((p) => ({ id: p, label: basename(p) }));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-(--app-border) p-1.5">
        <div className="min-w-0 flex-1">
          <TfTabs
            tabs={tabs}
            value={activePath}
            size="sm"
            onChange={openFile}
            aria-label={t('open-files', { defaultValue: 'Open files' })}
          />
        </div>
        <IconBtn
          icon={X}
          label={t('close-file', { defaultValue: 'Close file' })}
          onClick={() => closeFile(activePath)}
        />
      </div>
      <p className="truncate border-b border-(--app-border) px-3 py-1 font-mono text-[11px] text-(--app-text-dim)">
        {activePath}
      </p>
      <div className="min-h-0 flex-1">
        {!isTextPath(activePath) ? (
          <BinaryNote path={activePath} />
        ) : loaded ? (
          <CodeEditor key={activePath} path={activePath} />
        ) : (
          <EmptyNote>{t('loading', { defaultValue: 'Loading…' })}</EmptyNote>
        )}
      </div>
    </div>
  );
}
