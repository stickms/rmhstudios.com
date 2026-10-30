import type { TFunction } from 'i18next';

/** What to tell the user for a hub refusal (the API returns `{ error: CODE }`). */
export function hubErrorText(code: string | undefined, t: TFunction): string {
  switch (code) {
    case 'BAD_INPUT':
      return t('steam-hub-err-input', { defaultValue: 'Check the title and text, then try again.' });
    case 'RATE_LIMITED':
      return t('steam-hub-err-rate', { defaultValue: 'You are posting too fast. Try again later.' });
    case 'LOCKED':
      return t('steam-hub-err-locked', { defaultValue: 'This discussion is locked.' });
    case 'BANNED':
      return t('steam-hub-err-banned', { defaultValue: 'Your account cannot post right now.' });
    case 'FORBIDDEN':
      return t('steam-hub-err-forbidden', { defaultValue: 'You cannot do that.' });
    case 'NOT_FOUND':
      return t('steam-hub-err-gone', { defaultValue: 'That discussion no longer exists.' });
    default:
      return t('steam-hub-err', { defaultValue: 'Something went wrong. Try again.' });
  }
}
