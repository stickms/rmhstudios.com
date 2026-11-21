import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { GifEmbed } from '../GifEmbed';
import { GifPicker } from '../GifPickerLazy';
import { GifDescriptionField } from './GifDescriptionField';
import type { GifSelection } from '@/lib/feed/gif-alt';

/**
 * The chosen GIF as an attachment in the composer, with a button that removes it and (sprint 06 #15) a labelled
 * "Describe this GIF" field under it, prefilled from the provider's text.
 */
export function GifAttachment({
  gifUrl,
  gifAlt,
  onGifAltChange,
  altRequired,
  onRemove,
}: {
  gifUrl: string;
  gifAlt: string;
  onGifAltChange: (value: string) => void;
  /** The member's "Require alt text" setting is on. */
  altRequired?: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="mt-2">
      <div className="relative">
        <GifEmbed url={gifUrl} gifAlt={gifAlt} />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('remove-gif-aria', { defaultValue: 'Remove GIF' })}
          title={t('remove-gif-aria', { defaultValue: 'Remove GIF' })}
          className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full bg-site-media-scrim-strong text-site-media-ink transition-colors hover:bg-site-media-scrim-hover sm:size-auto sm:p-1"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <GifDescriptionField
        value={gifAlt}
        onChange={onGifAltChange}
        required={altRequired}
        className="mt-2"
      />
    </div>
  );
}

/**
 * The GIF picker as a popover hanging off the control that opened it (owner, 2026-11-13: "the klipy gif menu should be
 * a popover"). It is an `AnchoredMenu`, so it portals to `<body>`, opens on the side that has room, stays inside the
 * viewport on a phone, closes on Escape or an outside press and hands focus back to its control. Choosing a GIF closes
 * it; the composer then shows the GIF as an attachment.
 */
export function GifPopover({
  open,
  onClose,
  anchorRef,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onSelect: (selection: GifSelection) => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <AnchoredMenu
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      role="dialog"
      side="bottom"
      align="start"
      label={t('menu-add-gif', { defaultValue: 'Add GIF' })}
      className="w-80 p-0"
    >
      <GifPicker
        listClassName="h-72"
        onSelect={(selection) => {
          onSelect(selection);
          onClose();
        }}
        unavailable={
          <p className="t-body p-4 text-site-text-muted">
            {t('gif-unavailable', { defaultValue: 'GIF search is not available right now.' })}
          </p>
        }
      />
    </AnchoredMenu>
  );
}
