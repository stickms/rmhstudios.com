import type { Dispatch, SetStateAction } from 'react';
import { m as motion } from 'framer-motion';
import { Coins, Lock, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { modalContent } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { OverlayPanel } from '@/components/ui/overlay-panel';
import { MAX_IMAGE_ALT_LENGTH } from '@/lib/rmhark-limits';
import { setAltAt } from './compose-state';

/** Unlock-price popover — opened from the (+) menu. */
export function UnlockPriceDialog({
  unlockPrice,
  setUnlockPrice,
  onClose,
}: {
  unlockPrice: string;
  setUnlockPrice: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <OverlayPanel open onClose={onClose}>
      <motion.div
        variants={modalContent}
        initial="initial"
        animate="animate"
        className="relative w-full max-w-xs p-4 glass-overlay"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text">
            <Lock className="h-4 w-4 text-site-text-muted" />
            {t('unlock-price-label', { defaultValue: 'Unlock price' })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', { defaultValue: 'Close' })}
            className="p-2 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-site-text-muted">
          {t('unlock-price-help', {
            defaultValue: 'Charge coins to unlock this post. Leave empty to keep it free.',
          })}
        </p>
        <div className="flex items-center gap-2 rounded-site glass-fill px-3 py-2">
          <Coins className="h-4 w-4 text-site-text-muted" />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={unlockPrice}
            onChange={(e) => setUnlockPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onClose();
            }}
            placeholder={t('unlock-price-placeholder', { defaultValue: 'free' })}
            aria-label={t('unlock-price-aria', {
              defaultValue: 'Coins required to unlock this post',
            })}
            className="w-full bg-transparent text-sm text-site-text placeholder:text-site-text-muted focus:outline-none"
          />
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setUnlockPrice('');
              onClose();
            }}
            className="rounded-full px-3 py-2 text-xs font-medium text-site-text-muted hover:text-site-text transition-colors"
          >
            {t('unlock-price-clear', { defaultValue: 'Make free' })}
          </button>
          <Button variant="accent" size="sm" onClick={onClose}>
            {t('done', { defaultValue: 'Done' })}
          </Button>
        </div>
      </motion.div>
    </OverlayPanel>
  );
}

/** Markdown cheat sheet — opened from the (+) menu. */
export function CheatSheetDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('feed');
  return (
    <OverlayPanel open onClose={onClose}>
      <motion.div
        variants={modalContent}
        initial="initial"
        animate="animate"
        className="relative w-full max-w-sm p-4 glass-overlay"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text">
            <Type className="h-4 w-4 text-site-text-muted" />
            {t('cheatsheet-title', { defaultValue: 'Formatting cheat sheet' })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', { defaultValue: 'Close' })}
            className="p-2 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-site-text-muted">
              <th className="pb-2 font-medium">
                {t('cheatsheet-col-type', { defaultValue: 'Type this' })}
              </th>
              <th className="pb-2 font-medium">
                {t('cheatsheet-col-result', { defaultValue: 'Result' })}
              </th>
            </tr>
          </thead>
          <tbody className="align-top">
            {[
              {
                code: '**bold**',
                node: (
                  <strong className="font-bold">
                    {t('cheatsheet-bold', { defaultValue: 'bold' })}
                  </strong>
                ),
              },
              {
                code: '*italic*',
                node: (
                  <em className="italic">{t('cheatsheet-italic', { defaultValue: 'italic' })}</em>
                ),
              },
              {
                code: '~~strike~~',
                node: <del>{t('cheatsheet-strike', { defaultValue: 'strike' })}</del>,
              },
              {
                code: '||spoiler||',
                node: (
                  <span className="rounded bg-site-text/15 px-1 text-transparent [filter:blur(3px)]">
                    {t('cheatsheet-spoiler', { defaultValue: 'spoiler' })}
                  </span>
                ),
              },
            ].map((row) => (
              <tr key={row.code} className="border-t border-site-border">
                <td className="py-2 pr-3">
                  <code className="rounded bg-site-surface px-1.5 py-0.5 text-xs text-site-text">
                    {row.code}
                  </code>
                </td>
                <td className="py-2 text-site-text">{row.node}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </OverlayPanel>
  );
}

/** Image alt-text editor — opened from the ALT pill on a preview image. */
export function AltTextDialog({
  imageUrl,
  imageAlts,
  index,
  setImageAlts,
  onClose,
}: {
  imageUrl: string;
  imageAlts: string[];
  index: number;
  setImageAlts: Dispatch<SetStateAction<string[]>>;
  onClose: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <OverlayPanel open onClose={onClose}>
      <motion.div
        variants={modalContent}
        initial="initial"
        animate="animate"
        className="relative w-full max-w-md p-4 glass-overlay"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-site-text">
            {t('alt-text-heading', { defaultValue: 'Describe this image' })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', { defaultValue: 'Close' })}
            className="p-2 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-site-text-muted">
          {t('alt-text-help', {
            defaultValue:
              "Alt text lets people who use screen readers understand your image. Describe what's in it.",
          })}
        </p>
        <img
          src={imageUrl}
          alt={imageAlts[index]?.trim() || ''}
          className="mb-3 max-h-40 w-full rounded-site-sm object-contain bg-site-surface"
        />
        <label htmlFor="alt-text-input" className="sr-only">
          {t('alt-text-heading', { defaultValue: 'Describe this image' })}
        </label>
        <textarea
          id="alt-text-input"
          autoFocus
          rows={3}
          maxLength={MAX_IMAGE_ALT_LENGTH}
          value={imageAlts[index] ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            setImageAlts((prev) => setAltAt(prev, index, value));
          }}
          placeholder={t('alt-text-placeholder', {
            defaultValue: 'e.g. A golden retriever running on a beach at sunset',
          })}
          className="w-full resize-none rounded-site-sm glass-inset px-3 py-2 text-sm text-site-text placeholder:text-site-text-muted outline-none focus:border-site-accent transition-colors"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-mono text-site-text-muted">
            {MAX_IMAGE_ALT_LENGTH - (imageAlts[index]?.length ?? 0)}
          </span>
          <Button variant="accent" size="sm" onClick={onClose}>
            {t('done', { defaultValue: 'Done' })}
          </Button>
        </div>
      </motion.div>
    </OverlayPanel>
  );
}
