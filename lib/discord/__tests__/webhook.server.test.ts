/**
 * Webhook URL validation and masking.
 *
 * In the suite because both are security-critical in a way that is invisible at
 * runtime (moved from `lib/pf2ecal/discord.test.ts` with the module):
 *
 *  * `validateWebhookUrl` is the **only** thing standing between a settings
 *    field and an arbitrary server-side POST. A hole in it is an SSRF, and the
 *    interesting cases are the ones that *look* like Discord URLs.
 *  * `maskWebhookUrl` decides what leaves the server. A bug that returns too
 *    much leaks a bearer credential for a Discord channel.
 */

import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  maskWebhookUrl,
  validateWebhookUrl,
} from '../webhook.server';

const GOOD =
  'https://discord.com/api/webhooks/123456789012345678/abcDEF-ghiJKL_mnoPQR';

describe('validateWebhookUrl', () => {
  it('accepts a real Discord webhook URL', () => {
    const result =
      validateWebhookUrl(
        GOOD,
      );
    expect(
      result.ok,
    ).toBe(
      true,
    );
    expect(
      result.url,
    ).toBe(
      GOOD,
    );
  });

  it('accepts the legacy and release-channel hosts', () => {
    for (const host of [
      'discordapp.com',
      'ptb.discord.com',
      'canary.discord.com',
    ]) {
      const url =
        GOOD.replace(
          'discord.com',
          host,
        );
      expect(
        validateWebhookUrl(
          url,
        )
          .ok,
        host,
      ).toBe(
        true,
      );
    }
  });

  it('accepts a versioned API path', () => {
    expect(
      validateWebhookUrl(
        GOOD.replace(
          '/api/',
          '/api/v10/',
        ),
      )
        .ok,
    ).toBe(
      true,
    );
  });

  it('strips query and fragment so the stored URL is exactly what we POST to', () => {
    expect(
      validateWebhookUrl(
        `${GOOD}?wait=true#x`,
      )
        .url,
    ).toBe(
      GOOD,
    );
    expect(
      validateWebhookUrl(
        `${GOOD}/`,
      )
        .url,
    ).toBe(
      GOOD,
    );
  });

  /**
   * The whole point of the module. Each of these is a URL someone could
   * plausibly paste or plant, and every one must be refused — the check is on
   * the PARSED hostname, so none of the substring tricks work.
   */
  it.each(
    [
      [
        'a look-alike domain',
        'https://discord.com.evil.test/api/webhooks/1/tok',
      ],
      [
        'a subdomain of an attacker domain',
        'https://evil.test/discord.com/api/webhooks/1/tok',
      ],
      [
        'userinfo smuggling the host',
        'https://discord.com@evil.test/api/webhooks/1/tok',
      ],
      [
        'plain http',
        'http://discord.com/api/webhooks/123/tok',
      ],
      [
        'localhost',
        'https://127.0.0.1/api/webhooks/123/tok',
      ],
      [
        'link-local metadata',
        'https://169.254.169.254/api/webhooks/123/tok',
      ],
      [
        'a file URL',
        'file:///etc/passwd',
      ],
      [
        'a channel link, not a webhook',
        'https://discord.com/channels/123/456',
      ],
      [
        'the right host but wrong path',
        'https://discord.com/api/users/@me',
      ],
      [
        'not a URL at all',
        'webhook please',
      ],
      [
        'empty',
        '',
      ],
    ],
  )(
    'rejects %s',
    (
      _label,
      url,
    ) => {
      expect(
        validateWebhookUrl(
          url,
        )
          .ok,
      ).toBe(
        false,
      );
    },
  );

  it('always explains itself when it refuses', () => {
    for (const url of [
      '',
      'nope',
      'https://evil.test/x',
      'https://discord.com/channels/1/2',
    ]) {
      const result =
        validateWebhookUrl(
          url,
        );
      expect(
        result.ok,
      ).toBe(
        false,
      );
      expect(
        result.error,
        url,
      ).toBeTruthy();
    }
  });

  it('refuses an absurdly long string before parsing it', () => {
    expect(
      validateWebhookUrl(
        `${GOOD}${'a'.repeat(600)}`,
      )
        .ok,
    ).toBe(
      false,
    );
  });
});

describe('maskWebhookUrl', () => {
  it('never returns the token', () => {
    const masked =
      maskWebhookUrl(
        GOOD,
      );
    expect(
      masked,
    ).toBeTruthy();
    expect(
      masked,
    ).not.toContain(
      'abcDEF-ghiJKL_mnoPQR',
    );
    // The last four are shown so the group can tell two webhooks apart.
    expect(
      masked,
    ).toContain(
      'PQR',
    );
    expect(
      masked,
    ).toContain(
      '123456789012345678',
    );
  });

  it('returns null for no webhook', () => {
    expect(
      maskWebhookUrl(
        null,
      ),
    ).toBeNull();
    expect(
      maskWebhookUrl(
        undefined,
      ),
    ).toBeNull();
    expect(
      maskWebhookUrl(
        '',
      ),
    ).toBeNull();
  });

  it('degrades to a placeholder rather than echoing an unparseable value', () => {
    expect(
      maskWebhookUrl(
        'total nonsense',
      ),
    ).toBe(
      'a webhook',
    );
  });
});
