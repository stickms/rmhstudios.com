import type { TFunction } from 'i18next';
import type { HistoryLabel } from '@/lib/studio/history';

/**
 * The name of a history step as the member reads it ("Move clip"). A fixed map of literal `t()` calls: the i18n
 * extractor only sees literal keys, so this is a switch, never a computed key.
 */
export function stepName(t: TFunction, label: HistoryLabel): string {
  switch (label) {
    case 'add-track':
      return t('step-add-track', {
        ns: 'studio-editing',
        defaultValue: 'Add track',
      });
    case 'delete-track':
      return t('step-delete-track', {
        ns: 'studio-editing',
        defaultValue: 'Delete track',
      });
    case 'edit-track':
      return t('step-edit-track', {
        ns: 'studio-editing',
        defaultValue: 'Edit track',
      });
    case 'reorder-tracks':
      return t('step-reorder-tracks', {
        ns: 'studio-editing',
        defaultValue: 'Reorder tracks',
      });
    case 'add-clip':
      return t('step-add-clip', {
        ns: 'studio-editing',
        defaultValue: 'Add clip',
      });
    case 'delete-clip':
      return t('step-delete-clip', {
        ns: 'studio-editing',
        defaultValue: 'Delete clip',
      });
    case 'move-clip':
      return t('step-move-clip', {
        ns: 'studio-editing',
        defaultValue: 'Move clip',
      });
    case 'edit-clip':
      return t('step-edit-clip', {
        ns: 'studio-editing',
        defaultValue: 'Edit clip',
      });
    case 'edit-notes':
      return t('step-edit-notes', {
        ns: 'studio-editing',
        defaultValue: 'Edit notes',
      });
    case 'add-pattern':
      return t('step-add-pattern', {
        ns: 'studio-editing',
        defaultValue: 'Add pattern',
      });
    case 'delete-pattern':
      return t('step-delete-pattern', {
        ns: 'studio-editing',
        defaultValue: 'Delete pattern',
      });
    case 'edit-pattern':
      return t('step-edit-pattern', {
        ns: 'studio-editing',
        defaultValue: 'Edit pattern',
      });
    case 'master-volume':
      return t('step-master-volume', {
        ns: 'studio-editing',
        defaultValue: 'Change master volume',
      });
    case 'track-volume':
      return t('step-track-volume', {
        ns: 'studio-editing',
        defaultValue: 'Change track volume',
      });
    case 'track-pan':
      return t('step-track-pan', {
        ns: 'studio-editing',
        defaultValue: 'Change track pan',
      });
    case 'track-mute':
      return t('step-track-mute', {
        ns: 'studio-editing',
        defaultValue: 'Mute track',
      });
    case 'track-solo':
      return t('step-track-solo', {
        ns: 'studio-editing',
        defaultValue: 'Solo track',
      });
    case 'track-arm':
      return t('step-track-arm', {
        ns: 'studio-editing',
        defaultValue: 'Arm track',
      });
    case 'tempo':
      return t('step-tempo', {
        ns: 'studio-editing',
        defaultValue: 'Change tempo',
      });
    case 'time-signature':
      return t('step-time-signature', {
        ns: 'studio-editing',
        defaultValue: 'Change time signature',
      });
    case 'paste':
      return t('step-paste', {
        ns: 'studio-editing',
        defaultValue: 'Paste',
      });
    case 'cut':
      return t('step-cut', {
        ns: 'studio-editing',
        defaultValue: 'Cut',
      });
    case 'delete-selection':
      return t('step-delete-selection', {
        ns: 'studio-editing',
        defaultValue: 'Delete',
      });
    case 'duplicate':
      return t('step-duplicate', {
        ns: 'studio-editing',
        defaultValue: 'Duplicate',
      });
    case 'transpose':
      return t('step-transpose', {
        ns: 'studio-editing',
        defaultValue: 'Transpose notes',
      });
    case 'shift-notes':
      return t('step-shift-notes', {
        ns: 'studio-editing',
        defaultValue: 'Shift notes',
      });
    case 'import-midi':
      return t('step-import-midi', {
        ns: 'studio-export',
        defaultValue: 'Import MIDI',
      });
    case 'record-take':
      return t('step-record-take', {
        ns: 'studio-record',
        defaultValue: 'Record take',
      });
  }
}
