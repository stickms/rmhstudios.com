import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  MAX_ALLOWED_ENTRIES,
  ipAllowed,
  maskAddress,
  parseAllowlist,
  parseCidr,
} from '@/lib/api/ip-allowlist';
import {
  effectiveMinuteLimit,
  parseLimitInput,
  tierMinuteLimit,
} from '@/lib/api/tier-limits';

function ok(
  text: string,
) {
  const r =
    parseCidr(
      text,
    );
  if (
    !r.ok
  )
    throw new Error(
      `expected ${text} to parse, got ${r.code}`,
    );
  return r.cidr;
}

describe('parseCidr: accepted forms', () => {
  it('reads a bare IPv4 address as a /32 and a bare IPv6 address as a /128', () => {
    expect(
      ok(
        '203.0.113.7',
      ),
    ).toMatchObject(
      {
        version: 4,
        prefix: 32,
      },
    );
    expect(
      ok(
        '2001:db8::1',
      ),
    ).toMatchObject(
      {
        version: 6,
        prefix: 128,
      },
    );
  });

  it('accepts the documented prefix bounds', () => {
    expect(
      ok(
        '10.0.0.0/8',
      )
        .prefix,
    ).toBe(
      8,
    );
    expect(
      ok(
        '10.0.0.1/32',
      )
        .prefix,
    ).toBe(
      32,
    );
    expect(
      ok(
        '2001::/16',
      )
        .prefix,
    ).toBe(
      16,
    );
    expect(
      ok(
        '2001:db8::1/128',
      )
        .prefix,
    ).toBe(
      128,
    );
  });

  it('clears host bits so 10.1.2.3/24 is the 10.1.2.0/24 network', () => {
    expect(
      ok(
        '10.1.2.3/24',
      ),
    ).toEqual(
      ok(
        '10.1.2.0/24',
      ),
    );
    expect(
      ok(
        '2001:db8:1:2:3:4:5:6/48',
      ),
    ).toEqual(
      ok(
        '2001:db8:1::/48',
      ),
    );
  });

  it('parses every IPv6 spelling of the same address identically', () => {
    const a =
      ok(
        '2001:0db8:0000:0000:0000:0000:0000:0001',
      );
    expect(
      ok(
        '2001:db8::1',
      ),
    ).toEqual(
      a,
    );
    expect(
      ok(
        '2001:DB8:0:0:0:0:0:1',
      ),
    ).toEqual(
      a,
    );
    expect(
      ok(
        '::1',
      ),
    ).toMatchObject(
      {
        version: 6,
      },
    );
    expect(
      ok(
        '1::',
      ),
    ).toMatchObject(
      {
        version: 6,
      },
    );
    expect(
      ok(
        '1:2:3:4:5:6:7::',
      ),
    ).toMatchObject(
      {
        version: 6,
      },
    );
  });

  it('trims surrounding whitespace', () => {
    expect(
      ok(
        '  203.0.113.7  ',
      ),
    ).toEqual(
      ok(
        '203.0.113.7',
      ),
    );
  });

  it('folds IPv4-mapped IPv6 into IPv4, ranges included', () => {
    expect(
      ok(
        '::ffff:203.0.113.7',
      ),
    ).toEqual(
      ok(
        '203.0.113.7',
      ),
    );
    expect(
      ok(
        '::ffff:cb00:7107',
      ),
    ).toEqual(
      ok(
        '203.0.113.7',
      ),
    );
    expect(
      ok(
        '::ffff:10.0.0.0/104',
      ),
    ).toEqual(
      ok(
        '10.0.0.0/8',
      ),
    );
    expect(
      ok(
        '0:0:0:0:0:ffff:1.2.3.4',
      ),
    ).toEqual(
      ok(
        '1.2.3.4',
      ),
    );
  });
});

describe('parseCidr: rejections', () => {
  it('names the open ranges and tells the owner what to do instead', () => {
    expect(
      parseCidr(
        '0.0.0.0/0',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'open_range',
      },
    );
    expect(
      parseCidr(
        '::/0',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'open_range',
      },
    );
    expect(
      parseCidr(
        '203.0.113.7/0',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'open_range',
      },
    );
  });

  it('bounds the prefix length by family', () => {
    expect(
      parseCidr(
        '10.0.0.0/7',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'prefix_out_of_range',
        min: 8,
        max: 32,
      },
    );
    expect(
      parseCidr(
        '10.0.0.0/33',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'prefix_out_of_range',
        min: 8,
        max: 32,
      },
    );
    expect(
      parseCidr(
        '2001::/15',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'prefix_out_of_range',
        min: 16,
        max: 128,
      },
    );
    expect(
      parseCidr(
        '2001::/129',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'prefix_out_of_range',
        min: 16,
        max: 128,
      },
    );
    // A mapped range is an IPv4 range: /104 is IPv4 /8, so /103 (IPv4 /7) is too wide and /96 is everything.
    expect(
      parseCidr(
        '::ffff:10.0.0.0/103',
      ),
    ).toMatchObject(
      {
        ok: false,
        code: 'prefix_out_of_range',
      },
    );
    expect(
      parseCidr(
        '::ffff:10.0.0.0/96',
      ),
    ).toEqual(
      {
        ok: false,
        code: 'open_range',
      },
    );
  });

  it.each(
    [
      'example.com',
      'localhost',
      '*',
      '10.*.*.*',
      '10.0.0.*',
      '',
      '   ',
      '10.0.0',
      '10.0.0.0.1',
      '256.1.1.1',
      '1.2.3.-4',
      '01.2.3.4',
      '1.2.3.04',
      '1.2.3.4.',
      '.1.2.3.4',
      '1.2.3.4/',
      '/24',
      '1.2.3.4/24/8',
      '1.2.3.4/+24',
      '1.2.3.4/-1',
      '1.2.3.4/2.5',
      '1.2.3.4/0x18',
      '1.2.3.4/ 24',
      '1.2.3.4 /24',
      '0x7f.0.0.1',
      '2130706433',
      '1e2.0.0.1',
      ':::',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3:4:5:6:7',
      '1::2::3',
      '12345::',
      'g::1',
      '2001:db8::1%eth0',
      '[2001:db8::1]',
      '2001:db8::1:',
      ':2001:db8::1',
      '1:2:3:4:5:6:7:8::',
      '::1.2.3',
      '::1.2.3.256',
      '1.2.3.4::1',
      '2001:db8::1.2.3.4:5',
      '2001:db8::1/abc',
      '10.0.0.1;rm',
      '10.0.0.1\n10.0.0.2',
    ],
  )(
    'rejects %j',
    (
      text,
    ) => {
      expect(
        parseCidr(
          text,
        ),
      ).toMatchObject(
        {
          ok: false,
          code: 'invalid_address',
        },
      );
    },
  );

  it('never throws on arbitrary input', () => {
    for (const text of [
      '\u0000',
      '😀',
      '1.2.3.4/99999999999999999999',
      ':'.repeat(
        500,
      ),
      '1'.repeat(
        500,
      ),
    ]) {
      expect(
        () =>
          parseCidr(
            text,
          ),
      ).not.toThrow();
    }
  });
});

describe('ipAllowed', () => {
  it('allows everything when the list is empty', () => {
    expect(
      ipAllowed(
        '192.0.2.1',
        [],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        'not an address',
        [],
      ),
    ).toBe(
      true,
    );
  });

  it('matches single addresses exactly', () => {
    expect(
      ipAllowed(
        '203.0.113.7',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '203.0.113.8',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      false,
    );
  });

  it('matches IPv4 range edges', () => {
    const list =
      [
        '198.51.100.0/24',
      ];
    expect(
      ipAllowed(
        '198.51.100.0',
        list,
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '198.51.100.255',
        list,
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '198.51.99.255',
        list,
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '198.51.101.0',
        list,
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '10.255.255.255',
        [
          '10.0.0.0/8',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '11.0.0.0',
        [
          '10.0.0.0/8',
        ],
      ),
    ).toBe(
      false,
    );
    // A non-octet-aligned prefix.
    expect(
      ipAllowed(
        '192.168.1.127',
        [
          '192.168.1.0/25',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '192.168.1.128',
        [
          '192.168.1.0/25',
        ],
      ),
    ).toBe(
      false,
    );
  });

  it('matches IPv6 ranges, including non-nibble prefixes', () => {
    expect(
      ipAllowed(
        '2001:db8:abcd:ffff:ffff:ffff:ffff:ffff',
        [
          '2001:db8:abcd::/48',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '2001:db8:abce::',
        [
          '2001:db8:abcd::/48',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '2001:db8:8000::1',
        [
          '2001:db8:8000::/33',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '2001:db8:7fff::1',
        [
          '2001:db8:8000::/33',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '2001:db8::1',
        [
          '2001:db8::1',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '2001:0db8:0:0:0:0:0:1',
        [
          '2001:db8::1',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '2001:db8::2',
        [
          '2001:db8::1',
        ],
      ),
    ).toBe(
      false,
    );
  });

  it('never matches across families', () => {
    expect(
      ipAllowed(
        '2001:db8::1',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '203.0.113.7',
        [
          '2001:db8::1',
        ],
      ),
    ).toBe(
      false,
    );
    // ::7107 is not an IPv4-mapped address.
    expect(
      ipAllowed(
        '::cb00:7107',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      false,
    );
  });

  it('normalises an IPv4-mapped client address before matching', () => {
    expect(
      ipAllowed(
        '::ffff:203.0.113.7',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '::ffff:cb00:7107',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '::ffff:203.0.113.9',
        [
          '203.0.113.0/24',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      ipAllowed(
        '::ffff:203.0.114.9',
        [
          '203.0.113.0/24',
        ],
      ),
    ).toBe(
      false,
    );
    // And a mapped list entry matches the plain IPv4 client.
    expect(
      ipAllowed(
        '203.0.113.7',
        [
          '::ffff:203.0.113.7',
        ],
      ),
    ).toBe(
      true,
    );
  });

  it('fails closed on an unparseable client address or a corrupt entry', () => {
    expect(
      ipAllowed(
        'unknown',
        [
          '203.0.113.0/24',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '',
        [
          '203.0.113.0/24',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '203.0.113.7',
        [
          'garbage',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '203.0.113.7',
        [
          'garbage',
          '0.0.0.0/0',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '203.0.113.7',
        [
          'garbage',
          '203.0.113.7',
        ],
      ),
    ).toBe(
      true,
    );
  });

  it('does not treat a forwarded chain or a port as an address', () => {
    expect(
      ipAllowed(
        '203.0.113.7, 10.0.0.1',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      ipAllowed(
        '203.0.113.7:443',
        [
          '203.0.113.7',
        ],
      ),
    ).toBe(
      false,
    );
  });
});

describe('maskAddress', () => {
  it('hides the last IPv4 octet', () => {
    expect(
      maskAddress(
        '203.0.113.77',
      ),
    ).toBe(
      '203.0.113.x',
    );
    expect(
      maskAddress(
        ' 10.0.0.1 ',
      ),
    ).toBe(
      '10.0.0.x',
    );
  });

  it('hides the last 80 bits of an IPv6 address', () => {
    expect(
      maskAddress(
        '2001:db8:1:2:3:4:5:6',
      ),
    ).toBe(
      '2001:db8:1::x',
    );
    expect(
      maskAddress(
        '2001:0db8:00a1::1',
      ),
    ).toBe(
      '2001:db8:a1::x',
    );
    expect(
      maskAddress(
        '::1',
      ),
    ).toBe(
      '0:0:0::x',
    );
  });

  it('masks a mapped address as IPv4', () => {
    expect(
      maskAddress(
        '::ffff:203.0.113.77',
      ),
    ).toBe(
      '203.0.113.x',
    );
  });

  it('returns null for anything that is not an address, so junk is never stored', () => {
    expect(
      maskAddress(
        'unknown',
      ),
    ).toBeNull();
    expect(
      maskAddress(
        '',
      ),
    ).toBeNull();
    expect(
      maskAddress(
        '203.0.113.7, 10.0.0.1',
      ),
    ).toBeNull();
  });

  it('never leaves the masked part in the output', () => {
    expect(
      maskAddress(
        '203.0.113.77',
      ),
    ).not.toContain(
      '77',
    );
    expect(
      maskAddress(
        '2001:db8:1:2:3:4:5:6',
      ),
    ).not.toMatch(
      /:2:|:3:|:4:|:5:|:6/,
    );
  });
});

describe('parseAllowlist', () => {
  it('collects entries, skipping blank lines and removing duplicates', () => {
    const r =
      parseAllowlist(
        ' 203.0.113.7 \n\n198.51.100.0/24\r\n203.0.113.7\n10.1.2.3/8\n10.0.0.0/8\n',
      );
    expect(
      r.errors,
    ).toEqual(
      [],
    );
    expect(
      r.entries,
    ).toEqual(
      [
        '203.0.113.7',
        '198.51.100.0/24',
        '10.1.2.3/8',
      ],
    );
  });

  it('puts each error on its own 1-based line', () => {
    const r =
      parseAllowlist(
        '203.0.113.7\nexample.com\n\n0.0.0.0/0\n10.0.0.0/4\n::/0',
      );
    expect(
      r.entries,
    ).toEqual(
      [
        '203.0.113.7',
      ],
    );
    expect(
      r.errors,
    ).toEqual(
      [
        {
          line: 2,
          code: 'invalid_address',
          value:
            'example.com',
          min: undefined,
          max: undefined,
        },
        {
          line: 4,
          code: 'open_range',
          value:
            '0.0.0.0/0',
          min: undefined,
          max: undefined,
        },
        {
          line: 5,
          code: 'prefix_out_of_range',
          value:
            '10.0.0.0/4',
          min: 8,
          max: 32,
        },
        {
          line: 6,
          code: 'open_range',
          value:
            '::/0',
          min: undefined,
          max: undefined,
        },
      ],
    );
  });

  it('allows exactly 20 entries and flags the 21st on its own line', () => {
    const lines =
      Array.from(
        {
          length: 21,
        },
        (
          _,
          i,
        ) =>
          `10.0.${i}.1`,
      );
    expect(
      parseAllowlist(
        lines
          .slice(
            0,
            MAX_ALLOWED_ENTRIES,
          )
          .join(
            '\n',
          ),
      )
        .errors,
    ).toEqual(
      [],
    );
    const r =
      parseAllowlist(
        lines.join(
          '\n',
        ),
      );
    expect(
      r.entries,
    ).toHaveLength(
      MAX_ALLOWED_ENTRIES,
    );
    expect(
      r.errors,
    ).toEqual(
      [
        {
          line: 21,
          code: 'too_many',
          value:
            '',
          max: 20,
        },
      ],
    );
  });

  it('does not count duplicates towards the cap', () => {
    const lines =
      [
        ...Array.from(
          {
            length: 20,
          },
          (
            _,
            i,
          ) =>
            `10.0.${i}.1`,
        ),
        '10.0.0.1',
      ];
    expect(
      parseAllowlist(
        lines.join(
          '\n',
        ),
      )
        .errors,
    ).toEqual(
      [],
    );
  });

  it('treats an empty text as no restriction', () => {
    expect(
      parseAllowlist(
        '',
      ),
    ).toEqual(
      {
        entries:
          [],
        errors:
          [],
      },
    );
    expect(
      parseAllowlist(
        '\n  \n',
      ),
    ).toEqual(
      {
        entries:
          [],
        errors:
          [],
      },
    );
  });

  it('rejects a line carrying two addresses', () => {
    expect(
      parseAllowlist(
        '10.0.0.1, 10.0.0.2',
      )
        .errors[0],
    ).toMatchObject(
      {
        line: 1,
        code: 'invalid_address',
      },
    );
    expect(
      parseAllowlist(
        '10.0.0.1 10.0.0.2',
      )
        .errors[0],
    ).toMatchObject(
      {
        line: 1,
        code: 'invalid_address',
      },
    );
  });
});

describe('per-minute limits', () => {
  it('uses the key limit when lower and never exceeds the tier', () => {
    expect(
      effectiveMinuteLimit(
        'starter',
        null,
      ),
    ).toBe(
      120,
    );
    expect(
      effectiveMinuteLimit(
        'starter',
        10,
      ),
    ).toBe(
      10,
    );
    expect(
      effectiveMinuteLimit(
        'starter',
        120,
      ),
    ).toBe(
      120,
    );
    expect(
      effectiveMinuteLimit(
        'starter',
        600,
      ),
    ).toBe(
      120,
    );
    expect(
      effectiveMinuteLimit(
        'pro',
        600,
      ),
    ).toBe(
      600,
    );
    expect(
      effectiveMinuteLimit(
        'pro',
        200,
      ),
    ).toBe(
      200,
    );
    expect(
      tierMinuteLimit(
        'unknown-tier',
      ),
    ).toBe(
      120,
    );
  });

  it('parses the field: blank is the tier default, otherwise 1 to the maximum', () => {
    expect(
      parseLimitInput(
        '',
        120,
      ),
    ).toEqual(
      {
        ok: true,
        value:
          null,
      },
    );
    expect(
      parseLimitInput(
        '  ',
        120,
      ),
    ).toEqual(
      {
        ok: true,
        value:
          null,
      },
    );
    expect(
      parseLimitInput(
        '10',
        120,
      ),
    ).toEqual(
      {
        ok: true,
        value: 10,
      },
    );
    expect(
      parseLimitInput(
        '120',
        120,
      ),
    ).toEqual(
      {
        ok: true,
        value: 120,
      },
    );
    expect(
      parseLimitInput(
        '121',
        120,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'out_of_range',
      },
    );
    expect(
      parseLimitInput(
        '0',
        120,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'out_of_range',
      },
    );
    expect(
      parseLimitInput(
        '1.5',
        120,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'not_whole_number',
      },
    );
    expect(
      parseLimitInput(
        '-3',
        120,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'not_whole_number',
      },
    );
    expect(
      parseLimitInput(
        '1e2',
        120,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'not_whole_number',
      },
    );
  });
});

describe('adversarial matching', () => {
  const allowed = (ip: string, list: string[]) => ipAllowed(ip, list);
  it('a /32 matches only its own address', () => {
    expect(allowed('1.2.3.4', ['1.2.3.4/32'])).toBe(true);
    expect(allowed('1.2.3.5', ['1.2.3.4/32'])).toBe(false);
  });
  it('an IPv6 /32 stops at the prefix boundary', () => {
    expect(allowed('2001:db8:ffff::1', ['2001:db8::/32'])).toBe(true);
    expect(allowed('2001:db9::1', ['2001:db8::/32'])).toBe(false);
  });
  it('hex case and compressed forms do not matter', () => {
    expect(allowed('2001:DB8:0:0:0:0:0:ABCD', ['2001:db8::abcd'])).toBe(true);
    expect(allowed('2001:db8::abcd', ['2001:DB8:0000:0000:0000:0000:0000:ABCD'])).toBe(true);
  });
  it('mapped client addresses match IPv4 entries and the reverse', () => {
    expect(allowed('::FFFF:1.2.3.4', ['1.2.3.4'])).toBe(true);
    expect(allowed('::ffff:102:304', ['1.2.3.0/24'])).toBe(true);
    expect(allowed('1.2.3.4', ['::ffff:1.2.3.4'])).toBe(true);
    expect(allowed('::ffff:1.2.4.4', ['1.2.3.0/24'])).toBe(false);
  });
  it('a mapped address never matches a native IPv6 range, nor an IPv6 client an IPv4 entry', () => {
    expect(allowed('::ffff:1.2.3.4', ['2001:db8::/32'])).toBe(false);
    expect(allowed('2001:db8::1', ['1.2.3.4'])).toBe(false);
  });
  it('garbage client addresses are refused', () => {
    expect(allowed('', ['1.2.3.4'])).toBe(false);
    expect(allowed('1.2.3.4, 5.6.7.8', ['1.2.3.4'])).toBe(false);
    expect(allowed('1.2.3.4%eth0', ['1.2.3.4'])).toBe(false);
  });
});
