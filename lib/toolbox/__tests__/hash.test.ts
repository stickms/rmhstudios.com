import { describe, expect, it } from 'vitest';
import { digestAll, digestHex, matchDigest, md5, normaliseHash, toHex } from '@/lib/toolbox/hash';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('md5', () => {
  it('matches the RFC 1321 test suite', () => {
    const vectors: [string, string][] = [
      ['', 'd41d8cd98f00b204e9800998ecf8427e'],
      ['a', '0cc175b9c0f1b6a831c399e269772661'],
      ['abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
      ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
      [
        '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
        '57edf4a22be3c955ac49da2e2107b67a',
      ],
    ];
    for (const [input, hex] of vectors) expect(toHex(md5(bytes(input))), input).toBe(hex);
  });

  it('handles lengths around the 56-byte padding boundary', () => {
    expect(toHex(md5(bytes('x'.repeat(55))))).toBe('04364420e25c512fd958a70738aa8f72');
    expect(toHex(md5(bytes('x'.repeat(56))))).toBe('668a72d5ba17f08e62dabcafad6db14b');
  });
});

describe('digestHex', () => {
  it('computes the SHA family through Web Crypto', async () => {
    expect(await digestHex('SHA-256', bytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await digestHex('SHA-1', bytes('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    const all = await digestAll(bytes(''));
    expect(all['SHA-512'].length).toBe(128);
    expect(all['SHA-384'].length).toBe(96);
  });
});

describe('matchDigest', () => {
  it('normalises pasted checksums and finds the algorithm', async () => {
    const all = await digestAll(bytes('abc'));
    expect(matchDigest('  0x900150983CD24FB0D6963F7D28E17F72 ', all)).toBe('MD5');
    expect(
      matchDigest(
        'ba:78:16:bf:8f:01:cf:ea:41:41:40:de:5d:ae:22:23:b0:03:61:a3:96:17:7a:9c:b4:10:ff:61:f2:00:15:ad',
        all,
      ),
    ).toBe('SHA-256');
    expect(matchDigest('deadbeef', all)).toBeNull();
    expect(matchDigest('not hex', all)).toBeNull();
    expect(normaliseHash('AB CD')).toBe('abcd');
  });
});
