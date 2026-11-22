/** Contracts for /api/settings/read-receipts (sprint 06 #17). Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';

export interface ReadReceiptSettings {
  readReceipts: boolean;
  typingIndicators: boolean;
}

export const getReadReceiptsApi = endpoint<{
  res: ReadReceiptSettings;
}>()({
  method: 'GET',
  path: '/api/settings/read-receipts',
});

export const setReadReceiptsApi = endpoint<{
  body: {
    readReceipts?: boolean;
    typingIndicators?: boolean;
  };
  res: ReadReceiptSettings;
}>()({
  method: 'PUT',
  path: '/api/settings/read-receipts',
});
