import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  CodecError,
  decodeFromStorage,
  decodeUpload,
  encodeForStorage,
  looksCompressed,
} from '../blob-codec.server';

const text = Buffer.from(
  '"Resource/UI/X.res"\n{\n\t"Panel"\n\t{\n\t\t"xpos"\t"10"\n\t}\n}\n'.repeat(200),
);

describe('stored blob encoding', () => {
  it('compresses compressible files and round-trips them', () => {
    const { body, encoding } = encodeForStorage(text);
    expect(encoding).toBe('br');
    expect(body.length).toBeLessThan(text.length / 5);
    expect(decodeFromStorage(body, encoding, text.length).equals(text)).toBe(true);
  });

  it('leaves tiny, already-compressed and incompressible files alone', () => {
    expect(encodeForStorage(Buffer.from('tiny')).encoding).toBe('none');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(500, 7)]);
    expect(looksCompressed(png)).toBe(true);
    expect(encodeForStorage(png).encoding).toBe('none');
    const noise = randomBytes(4096);
    expect(encodeForStorage(noise).encoding).toBe('none');
  });

  it('refuses a stored object that inflates past its recorded size', () => {
    const { body } = encodeForStorage(text);
    expect(() => decodeFromStorage(body, 'br', 100)).toThrow(CodecError);
  });
});

describe('upload decoding', () => {
  it('accepts identity and gzip within the ceiling', () => {
    expect(decodeUpload(text, 'identity', 1e6).equals(text)).toBe(true);
    expect(decodeUpload(gzipSync(text), 'gzip', 1e6).equals(text)).toBe(true);
  });

  it('rejects decompression bombs, oversize bodies, junk and unknown encodings', () => {
    const bomb = gzipSync(Buffer.alloc(5_000_000));
    expect(bomb.length).toBeLessThan(10_000);
    expect(() => decodeUpload(bomb, 'gzip', 1_000_000)).toThrowError(/too large/);
    expect(() => decodeUpload(Buffer.alloc(2000), null, 1000)).toThrowError(/too large/);
    expect(() => decodeUpload(Buffer.from('not gzip'), 'gzip', 1e6)).toThrow(CodecError);
    expect(() => decodeUpload(text, 'deflate', 1e6)).toThrow(CodecError);
  });
});
