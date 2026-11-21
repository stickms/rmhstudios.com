import { endpoint } from '@/lib/contract/endpoint';
import type { KeyboardPrefs } from '@/lib/shortcuts/bindings';
import type { KeyboardPrefsInput } from '@/lib/preferences/keyboard-schema';

export const getKeyboardPrefsApi = endpoint<{
  res: KeyboardPrefs;
}>()({
  method: 'GET',
  path: '/api/preferences/keyboard',
});

export const setKeyboardPrefsApi = endpoint<{
  body: KeyboardPrefsInput;
  res: KeyboardPrefs;
}>()({
  method: 'PUT',
  path: '/api/preferences/keyboard',
});
