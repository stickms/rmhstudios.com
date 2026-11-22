import type { TFunction } from 'i18next';
import { errorField, serverError } from '@/lib/http';

/**
 * The sentence for a refused sweep call. Every key is a literal (the extractor and the computed-key ratchet read
 * them), one `case` per `SweepRefusal` in `lib/admin/sweeps.ts`.
 */
export function sweepRefusalText(t: TFunction, error: unknown): string {
  const reason = errorField<string>(error, 'reason');
  switch (reason) {
    case 'subject-not-found':
      return t('admin-spam-sweep:refusal-subject-not-found', { defaultValue: 'That account was not found.' });
    case 'subject-admin':
      return t('admin-spam-sweep:refusal-subject-admin', { defaultValue: 'An admin account cannot be swept.' });
    case 'subject-deleted':
      return t('admin-spam-sweep:refusal-subject-deleted', { defaultValue: 'That account has been deleted.' });
    case 'window-order':
      return t('admin-spam-sweep:refusal-window-order', { defaultValue: 'The window must end after it starts.' });
    case 'window-too-long':
      return t('admin-spam-sweep:refusal-window-too-long', { defaultValue: 'A window is at most 30 days.' });
    case 'window-future':
      return t('admin-spam-sweep:refusal-window-future', { defaultValue: 'The window cannot end in the future.' });
    case 'over-limit':
      return t('admin-spam-sweep:refusal-over-limit', {
        defaultValue: 'The window holds more than 5,000 items. Choose a shorter window.',
      });
    case 'nothing-to-remove':
      return t('admin-spam-sweep:refusal-nothing-to-remove', {
        defaultValue: 'There is nothing to remove in that window.',
      });
    case 'not-a-preview':
      return t('admin-spam-sweep:refusal-not-a-preview', { defaultValue: 'This sweep was already started.' });
    case 'preview-expired':
      return t('admin-spam-sweep:refusal-preview-expired', {
        defaultValue: 'This preview is out of date. Preview it again.',
      });
    case 'already-running':
      return t('admin-spam-sweep:refusal-already-running', {
        defaultValue: 'Another sweep of this account is still running.',
      });
    case 'confirm-limit':
      return t('admin-spam-sweep:refusal-confirm-limit', {
        defaultValue: 'You have started ten sweeps in the last hour. Try later.',
      });
    case 'not-undoable':
      return t('admin-spam-sweep:refusal-not-undoable', { defaultValue: 'This sweep cannot be undone.' });
    case 'not-found':
      return t('admin-spam-sweep:refusal-not-found', { defaultValue: 'That sweep was not found.' });
    default:
      return (
        serverError(error) ??
        t('admin-spam-sweep:refusal-generic', { defaultValue: 'Something went wrong. Try again.' })
      );
  }
}
