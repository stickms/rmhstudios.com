import type { TFunction } from 'i18next';

/** What to tell the user for a market refusal (the API returns `{ error: CODE }`). */
export function marketErrorText(code: string | undefined, t: TFunction): string {
  switch (code) {
    case 'INSUFFICIENT_COINS':
      return t('steam-market-err-coins', { defaultValue: 'You do not have enough coins.' });
    case 'NOT_AVAILABLE':
    case 'NOT_FOUND':
      return t('steam-market-err-gone', { defaultValue: 'That listing is no longer available.' });
    case 'SELF_BUY':
      return t('steam-market-err-self', { defaultValue: 'You cannot buy your own listing.' });
    case 'NOT_OWNED':
      return t('steam-market-err-owned', { defaultValue: 'You do not hold that card.' });
    case 'BAD_PRICE':
      return t('steam-market-err-price', { defaultValue: 'Price must be between 10 and 5000 coins.' });
    case 'FAR_ABOVE_MARKET':
      return t('steam-market-err-far', { defaultValue: 'That price is far above recent sales of this card.' });
    case 'TOO_MANY_LISTINGS':
      return t('steam-market-err-many', { defaultValue: 'You have too many active listings.' });
    case 'ACCOUNT_TOO_NEW':
      return t('steam-market-err-new', { defaultValue: 'Your account must be 7 days old before you can sell.' });
    case 'LEVEL_TOO_LOW':
      return t('steam-market-err-level', { defaultValue: 'You must be level 3 or higher to sell.' });
    case 'TOO_MANY_ORDERS':
      return t('steam-market-err-orders', { defaultValue: 'You have too many open buy orders.' });
    case 'ALREADY_ORDERED':
      return t('steam-market-err-ordered', { defaultValue: 'You already have a buy order for this card.' });
    default:
      return t('steam-market-err', { defaultValue: 'Something went wrong. Try again.' });
  }
}
