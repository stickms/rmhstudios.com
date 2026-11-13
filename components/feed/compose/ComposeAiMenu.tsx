import { useRef, useState } from 'react';
import { Hash, Lock, PenLine, Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { toast } from '@/lib/toast';
import { useAiGenerate } from '../AIGenerateButton';
import { AIImageUpgradeDialog, useAiImage } from '../AIImageButton';
import { ASSIST_ACTIONS, useComposeAssist } from '../ComposeAssist';
import { ComposerTool } from './ComposerRow';

/**
 * The home composer's AI quick action (owner, 2026-11-13: "the AI button should also be a quick action"): one sparkles
 * button in the row of quick actions, and everything AI the boxed composer spreads over a sparkles button, a wand
 * button and a row of chips, as one dropdown hanging off it. So nothing AI is drawn in the composer until it is asked
 * for, and asking for it does not change the composer's look.
 *
 * A request takes seconds, so choosing a row closes the menu and the button shows the spinner until the answer lands
 * in the field (or as a picture). Image generation keeps its gate: below the tier that has it the row carries a lock
 * and opens the same upgrade dialog as the wand button; the server checks the tier whatever the client shows.
 */
export function ComposeAiMenu({
  open,
  setOpen,
  content,
  setContent,
  imageLocked,
  imagesFull,
  onImage,
  tagsOn,
  setTagsOn,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  content: string;
  setContent: (next: string) => void;
  /** The user's tier cannot generate images: the row is shown locked and opens the upgrade dialog. */
  imageLocked: boolean;
  /** Every picture slot is taken. */
  imagesFull: boolean;
  onImage: (url: string) => void;
  /** Whether suggested tags are shown under the field. */
  tagsOn: boolean;
  setTagsOn: (on: boolean) => void;
}) {
  const { t } = useTranslation('feed');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const assist = useComposeAssist(content, setContent);
  const draft = useAiGenerate({ mode: 'post', draft: content }, setContent);
  const image = useAiImage(content, onImage);
  const busy = assist.busy !== null || draft.loading || image.loading;
  const label = t('compose-ai-tools', { defaultValue: 'AI tools' });

  // The menu is gone by the time a request fails, so the reason is a toast.
  const report = async (request: Promise<string | null>) => {
    const error = await request;
    if (error) toast.error(error);
  };
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
      <ComposerTool
        ref={buttonRef}
        icon={Sparkles}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        {...(busy ? { loading: true } : {})}
      />
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        label={label}
        side="bottom"
        align="start"
        className="w-72"
      >
        <MenuItem icon={PenLine} onSelect={pick(() => void report(draft.generate()))}>
          {t('ai-generate-button-title', { defaultValue: 'Generate with AI' })}
        </MenuItem>
        {imageLocked ? (
          <MenuItem
            icon={Wand2}
            hint={<Lock className="h-3.5 w-3.5" aria-hidden />}
            title={t('ai-image-locked-title', {
              defaultValue: 'Generate images with AI — upgrade to unlock',
            })}
            aria-label={t('ai-image-locked-title', {
              defaultValue: 'Generate images with AI — upgrade to unlock',
            })}
            onSelect={pick(() => setShowUpgrade(true))}
          >
            {t('ai-image-generate', { defaultValue: 'Generate an image with AI' })}
          </MenuItem>
        ) : (
          <MenuItem
            icon={Wand2}
            disabled={imagesFull}
            onSelect={pick(() => void report(image.generate()))}
          >
            {t('ai-image-generate', { defaultValue: 'Generate an image with AI' })}
          </MenuItem>
        )}
        <MenuItem icon={Hash} checked={tagsOn} onSelect={pick(() => setTagsOn(!tagsOn))}>
          {t('ai-suggest-tags', { defaultValue: 'Suggest tags' })}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t('ai-writing-assist', { defaultValue: 'AI writing assist' })}</MenuLabel>
        {ASSIST_ACTIONS.map((id) => (
          <MenuItem
            key={id}
            disabled={!assist.available}
            onSelect={pick(() => void assist.run(id))}
          >
            {assist.labels[id]}
          </MenuItem>
        ))}
      </AnchoredMenu>
      {showUpgrade && <AIImageUpgradeDialog onClose={() => setShowUpgrade(false)} />}
    </>
  );
}
