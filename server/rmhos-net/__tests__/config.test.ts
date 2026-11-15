import {
  describe,
  expect,
  it,
} from 'vitest';
import { loadHubConfig } from '../config';

const SECRET =
  'a'.repeat(
    32,
  );

describe('loadHubConfig', () => {
  it('requires a ticket secret of at least 32 characters, with a clear line', () => {
    expect(
      () =>
        loadHubConfig(
          {},
        ),
    ).toThrow(
      'RMHOS_NET_TICKET_SECRET is required',
    );
    expect(
      () =>
        loadHubConfig(
          {
            RMHOS_NET_TICKET_SECRET:
              '',
          },
        ),
    ).toThrow(
      'is required',
    );
    expect(
      () =>
        loadHubConfig(
          {
            RMHOS_NET_TICKET_SECRET:
              'short',
          },
        ),
    ).toThrow(
      /at least 32 characters.*openssl rand -hex 32/,
    );
    expect(
      loadHubConfig(
        {
          RMHOS_NET_TICKET_SECRET:
            SECRET,
        },
      )
        .secret,
    ).toBe(
      SECRET,
    );
  });

  it('reads the deny-list from the environment', () => {
    const cfg =
      loadHubConfig(
        {
          RMHOS_NET_TICKET_SECRET:
            SECRET,
          RMHOS_NET_DENY_USERS:
            'u1,u2',
        },
      );
    expect(
      cfg.deny.has(
        'u1',
      ),
    ).toBe(
      true,
    );
    expect(
      cfg.deny.has(
        'u3',
      ),
    ).toBe(
      false,
    );
  });
});
