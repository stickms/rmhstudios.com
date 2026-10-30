import type { TFunction } from 'i18next';

/** What to tell the user for a gems refusal (the API returns `{ error: CODE }`). */
export function gemsErrorText(code: string | undefined, t: TFunction): string {
  switch (code) {
    case 'INSUFFICIENT_GEMS':
      return t('steam-gems-err-gems', { defaultValue: 'You need 100 gems for a booster pack.' });
    case 'INSUFFICIENT_COINS':
      return t('steam-gems-err-coins', { defaultValue: 'You do not have enough coins.' });
    case 'NOT_ENOUGH':
      return t('steam-gems-err-held', { defaultValue: 'You do not hold that many of that card.' });
    case 'BAD_INPUT':
    case 'NOT_FOUND':
      return t('steam-gems-err-bad', { defaultValue: 'That is not possible.' });
    default:
      return t('steam-gems-err', { defaultValue: 'Something went wrong. Try again.' });
  }
}
