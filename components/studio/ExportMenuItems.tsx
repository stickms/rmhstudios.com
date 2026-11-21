/** The three export entries of the Projects menu: Export mix…, Export MIDI and Import MIDI…. */
import { useTranslation } from 'react-i18next';
import {
  AudioLines,
  FileDown,
  FileUp,
} from 'lucide-react';
import { MenuItem } from '@/components/ui/menu';
import {
  downloadBlob,
  safeFileName,
} from '@/lib/studio/export/download';
import { useExportUi } from '@/lib/studio/export/ui-store';
import { projectToSmf } from '@/lib/studio/midi/convert';
import { writeSmf } from '@/lib/studio/midi/smf-write';
import { useStudioStore } from '@/lib/studio/store';
import { toast } from '@/lib/toast';

export function ExportMenuItems({
  close,
}: {
  close: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'studio-export',
    );

  const exportMidi =
    () => {
      const s =
        useStudioStore.getState();
      const {
        file,
        noteCount,
      } =
        projectToSmf(
          {
            bpm: s.bpm,
            timeSignature:
              s.timeSignature,
            tracks:
              s.tracks,
            clips:
              s.clips,
            patterns:
              s.patterns,
          },
        );
      if (
        noteCount ===
        0
      ) {
        toast.error(
          t(
            'midi-none',
            {
              defaultValue:
                'There are no MIDI or pattern notes to export. Audio tracks cannot be exported as MIDI.',
            },
          ),
        );
        return;
      }
      const name = `${safeFileName(s.projectName)}.mid`;
      downloadBlob(
        new Blob(
          [
            writeSmf(
              file,
            ) as BlobPart,
          ],
          {
            type: 'audio/midi',
          },
        ),
        name,
      );
      toast.success(
        t(
          'midi-done',
          {
            name,
            defaultValue:
              'Exported {{name}}.',
          },
        ),
      );
    };

  return (
    <>
      <MenuItem
        icon={
          AudioLines
        }
        hint="Ctrl+E"
        onSelect={() => {
          close();
          useExportUi
            .getState()
            .openExport();
        }}
      >
        {t(
          'menu-export-mix',
          {
            defaultValue:
              'Export mix…',
          },
        )}
      </MenuItem>
      <MenuItem
        icon={
          FileDown
        }
        onSelect={() => {
          close();
          exportMidi();
        }}
      >
        {t(
          'menu-export-midi',
          {
            defaultValue:
              'Export MIDI',
          },
        )}
      </MenuItem>
      <MenuItem
        icon={
          FileUp
        }
        onSelect={() => {
          close();
          useExportUi
            .getState()
            .openImport();
        }}
      >
        {t(
          'menu-import-midi',
          {
            defaultValue:
              'Import MIDI…',
          },
        )}
      </MenuItem>
    </>
  );
}
