'use client';

import { Lock, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CODEX, codexProgress, codexUnlocked, type CodexEntry } from '@/lib/altair/data/codex';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';

/** "Codex 35%" for the menu's Bestiary button. */
export function CodexBadge() {
  const { t } = useTranslation('f-worlds');
  const bestiary = useAltairMetaStore((s) => s.bestiary);
  const { pct } = codexProgress(bestiary);
  return (
    <span className="ml-1 text-xs opacity-70">
      {t('codex-badge', { defaultValue: 'Codex {{pct}}%', pct })}
    </span>
  );
}

/** Opens the codex from the bestiary. */
export function CodexOpenButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('f-worlds');
  return (
    <button
      onClick={onClick}
      className="py-2 rounded-lg text-sm font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover)"
    >
      {t('codex-open', { defaultValue: 'Codex' })}
      <CodexBadge />
    </button>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw the entry as a 1200x630 card and hand it to the share sheet, or download it. */
async function shareCard(entry: CodexEntry, footer: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#17131f';
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = entry.color;
  ctx.fillRect(0, 0, 14, 630);
  ctx.fillStyle = '#e8e2d0';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText(entry.name, 70, 140);
  ctx.fillStyle = entry.color;
  ctx.font = '28px Georgia, serif';
  ctx.fillText(entry.kind === 'boss' ? 'BOSS' : 'CREATURE', 70, 190);
  ctx.fillStyle = '#cfc7b0';
  ctx.font = 'italic 38px Georgia, serif';
  wrap(ctx, entry.lore, 1050).forEach((l, i) => ctx.fillText(l, 70, 290 + i * 54));
  ctx.fillStyle = '#8a8470';
  ctx.font = '26px Georgia, serif';
  ctx.fillText(footer, 70, 575);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `altair-${entry.id}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: entry.name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** R20: lore entries unlocked by meeting each creature, with shareable cards. */
export default function CodexPanel({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('f-worlds');
  const bestiary = useAltairMetaStore((s) => s.bestiary);
  const { found, total, pct } = codexProgress(bestiary);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <h2 className="text-xl font-black tracking-wider text-(--altair-accent)">
          {t('codex-title', { defaultValue: 'CODEX' })}
        </h2>
        <p className="text-xs text-(--altair-text-muted)">
          {t('codex-progress', {
            defaultValue: '{{found}}/{{total}} entries - {{pct}}% complete',
            found,
            total,
            pct,
          })}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {CODEX.map((entry) => {
          const open = codexUnlocked(bestiary, entry.id);
          return (
            <li
              key={entry.id}
              className="rounded-lg border border-(--altair-border) bg-(--altair-surface) p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-(--altair-text)">
                  {open ? entry.name : t('codex-locked-name', { defaultValue: 'Unknown' })}
                </span>
                {open ? (
                  <button
                    className="flex items-center gap-1 text-xs text-(--altair-accent)"
                    onClick={() =>
                      shareCard(
                        entry,
                        t('codex-footer', { defaultValue: 'Altair codex - rmhstudios.com/altair' }),
                      )
                    }
                  >
                    <Share2 size={14} aria-hidden />
                    {t('codex-share', { defaultValue: 'Share card' })}
                  </button>
                ) : (
                  <Lock size={14} className="text-(--altair-text-dim)" aria-hidden />
                )}
              </div>
              <p className="mt-1 text-sm italic text-(--altair-text-muted)">
                {open
                  ? entry.lore
                  : t('codex-locked', {
                      defaultValue: 'Meet this creature in a run to unlock its entry.',
                    })}
              </p>
            </li>
          );
        })}
      </ul>
      <button
        onClick={onBack}
        className="py-2 rounded-lg text-sm font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border)"
      >
        {t('codex-back', { defaultValue: 'Back to bestiary' })}
      </button>
    </div>
  );
}
