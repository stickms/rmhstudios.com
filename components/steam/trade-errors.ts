import type { TFunction } from 'i18next';

/** What to tell the user for a trade refusal (the API returns `{ error: CODE }`). */
export function tradeErrorText(code: string | undefined, t: TFunction): string {
  switch (code) {
    case 'MISSING_CARDS':
      return t('steam-trade-err-missing', { defaultValue: 'One of you no longer holds those cards.' });
    case 'NOT_FRIENDS':
      return t('steam-trade-err-friends', {
        defaultValue: 'You can only trade with someone you follow or who follows you.',
      });
    case 'TOO_MANY_PENDING':
      return t('steam-trade-err-pending', { defaultValue: 'You have too many pending offers.' });
    case 'EXPIRED':
      return t('steam-trade-err-expired', { defaultValue: 'That offer has expired.' });
    case 'NOT_AVAILABLE':
    case 'NOT_FOUND':
    case 'FORBIDDEN':
      return t('steam-trade-err-gone', { defaultValue: 'That offer is no longer available.' });
    case 'BAD_OFFER':
      return t('steam-trade-err-bad', { defaultValue: 'That offer is not valid.' });
    default:
      return t('steam-trade-err', { defaultValue: 'Something went wrong. Try again.' });
  }
}
