import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getKeyboardPrefs, saveKeyboardPrefs } from '@/lib/preferences/keyboard.server';
import { keyboardPrefsSchema } from '@/lib/preferences/keyboard-schema';
import { getKeyboardPrefsApi, setKeyboardPrefsApi } from '@/lib/preferences/keyboard.contract';

/**
 * GET  /api/preferences/keyboard — the caller's keyboard shortcut mode and remaps.
 * PUT  /api/preferences/keyboard — replace them (WCAG 2.1.4). The body is
 *      validated against the registry ids, the key grammar, the reserved
 *      combinations and collisions, and holds at most 64 overrides.
 */
export const route = apiRoute('/api/preferences/keyboard', {
  GET: implement(
    getKeyboardPrefsApi,
    {
      rateLimit: 'read',
    },
    async ({ session }) => Response.json(await getKeyboardPrefs(session.user.id)),
  ),
  PUT: implement(
    setKeyboardPrefsApi,
    {
      rateLimit: 'write',
      body: keyboardPrefsSchema,
    },
    async ({ session, body }) => Response.json(await saveKeyboardPrefs(session.user.id, body)),
  ),
});
