import { useTranslation } from 'react-i18next';

/**
 * X12 — the `ALT` chip on a feed image whose author described it. Purely
 * visual: the description is already the image's `alt` (and the grid button's
 * accessible name), so the chip is hidden from assistive tech and the hover
 * title carries the text for sighted readers. No payload change — alt text
 * already travels with every feed item.
 */
export function AltChip({ alt }: { alt: string | undefined }) {
  const { t } = useTranslation('f-feed-plus');
  if (!alt?.trim()) return null;
  return (
    <span
      aria-hidden
      title={alt}
      className="pointer-events-auto absolute bottom-1.5 left-1.5 z-10 rounded-full bg-site-media-scrim-strong px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-site-media-ink"
    >
      {t('alt-chip', { defaultValue: 'ALT' })}
    </span>
  );
}
