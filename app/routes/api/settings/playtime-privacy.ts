import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import {
  dismissPlaytimeNotice,
  getPlaytimeSettings,
  setPlaytimePrivacy,
} from '@/lib/playtime/playtime.server';
import {
  dismissPlaytimeNoticeBody,
  playtimeSettings,
  setPlaytimePrivacyBody,
} from '@/lib/playtime/playtime-schema';
import {
  dismissPlaytimeNoticeApi,
  getPlaytimeSettingsApi,
  setPlaytimePrivacyApi,
} from '@/lib/playtime/playtime.contract';

/**
 * /api/settings/playtime-privacy — who may see this account's per-title playtime.
 *
 * Public by default (an owner decision) with opt-out. The setting is enforced in
 * every read path in `lib/playtime/playtime.server.ts`, never by a client; this
 * route only reads and writes the preference and the one-time notice flag.
 */
export const Route = createFileRoute('/api/settings/playtime-privacy')({
  server: {
    handlers: {
      GET: implement(
        getPlaytimeSettingsApi,
        { rateLimit: 'read', response: playtimeSettings },
        async ({ userId }) => getPlaytimeSettings(userId),
      ),
      PUT: implement(
        setPlaytimePrivacyApi,
        { rateLimit: 'write', body: setPlaytimePrivacyBody, response: playtimeSettings },
        async ({ userId, body }) => {
          await setPlaytimePrivacy(userId, body.playtimePrivacy);
          return getPlaytimeSettings(userId);
        },
      ),
      POST: implement(
        dismissPlaytimeNoticeApi,
        { rateLimit: 'write', body: dismissPlaytimeNoticeBody, response: playtimeSettings },
        async ({ userId }) => {
          await dismissPlaytimeNotice(userId);
          return getPlaytimeSettings(userId);
        },
      ),
    },
  },
});
