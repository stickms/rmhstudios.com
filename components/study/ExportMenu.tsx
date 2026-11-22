import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { toast } from '@/lib/toast';
import { buildExport, type ExportDeck, type ExportFormat } from '@/lib/study/export';

/** Download the deck as TSV, CSV or JSON, built in the browser from the cards already loaded. */
export function ExportMenu({ deck }: { deck: ExportDeck }) {
  const { t } = useTranslation(['study-editor', 'occlusion-cards']);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  function download(format: ExportFormat) {
    setOpen(false);
    const { text, mime, filename, skipped } = buildExport(format, deck);
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    // Picture-occlusion cards are masks over a picture: only the JSON file can carry them.
    if (skipped > 0) {
      toast.info(
        t('export-skipped-occlusion', {
          ns: 'occlusion-cards',
          count: skipped,
          defaultValue_one: '{{count}} picture-occlusion card was left out. Export as JSON to keep it.',
          defaultValue_other: '{{count}} picture-occlusion cards were left out. Export as JSON to keep them.',
          defaultValue: '{{count}} picture-occlusion cards were left out. Export as JSON to keep them.',
        }),
      );
    }
  }

  return (
    <>
      <Button
        ref={anchorRef}
        variant="default"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={deck.cards.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <Download aria-hidden />
        {t('export', { defaultValue: 'Export' })}
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label={t('export-format', { defaultValue: 'Export format' })}
        align="end"
        className="w-56"
      >
        <MenuItem onSelect={() => download('tsv')} hint=".tsv">
          {t('export-tsv', { defaultValue: 'Tab-separated (Anki, Quizlet)' })}
        </MenuItem>
        <MenuItem onSelect={() => download('csv')} hint=".csv">
          {t('export-csv', { defaultValue: 'CSV (spreadsheet)' })}
        </MenuItem>
        <MenuItem onSelect={() => download('json')} hint=".json">
          {t('export-json', { defaultValue: 'JSON' })}
        </MenuItem>
      </AnchoredMenu>
    </>
  );
}
