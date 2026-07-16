import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const FILE_MAGIC = Buffer.from('RMHL1');

function configuredSecret(): string {
  const dedicated = process.env.LADDER_RESUME_ENCRYPTION_KEY;
  if (dedicated) return dedicated;
  if (process.env.NODE_ENV !== 'production' && process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  throw new Error('LADDER_RESUME_ENCRYPTION_KEY must be configured');
}

function encryptionKey(secret = configuredSecret()): Buffer {
  if (secret.length < 32) throw new Error('Resume encryption key must be at least 32 characters');
  if (/^[a-f0-9]{64}$/i.test(secret)) return Buffer.from(secret, 'hex');
  const base64 = Buffer.from(secret, 'base64');
  if (base64.length === 32 && base64.toString('base64').replace(/=+$/, '') === secret.replace(/=+$/, '')) return base64;
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptResumeText(plaintext: string, opts: { secret?: string; aad?: string } = {}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(opts.secret), iv);
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptResumeText(payload: string, opts: { secret?: string; aad?: string } = {}): string {
  const [version, ivRaw, tagRaw, encryptedRaw, ...extra] = payload.split(':');
  if (version !== VERSION || !ivRaw || !tagRaw || encryptedRaw === undefined || extra.length) throw new Error('Invalid encrypted resume payload');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(opts.secret), Buffer.from(ivRaw, 'base64url'));
  if (opts.aad) decipher.setAAD(Buffer.from(opts.aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function encryptResumeFile(plaintext: Buffer, opts: { secret?: string; aad?: string } = {}): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(opts.secret), iv);
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptResumeFile(payload: Buffer, opts: { secret?: string; aad?: string } = {}): Buffer {
  if (payload.length < FILE_MAGIC.length + 28 || !payload.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) {
    throw new Error('Invalid encrypted resume file');
  }
  const ivStart = FILE_MAGIC.length;
  const tagStart = ivStart + 12;
  const dataStart = tagStart + 16;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(opts.secret), payload.subarray(ivStart, tagStart));
  if (opts.aad) decipher.setAAD(Buffer.from(opts.aad, 'utf8'));
  decipher.setAuthTag(payload.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(payload.subarray(dataStart)), decipher.final()]);
}

/**
 * True when a usable resume-encryption secret is configured — the dedicated
 * LADDER_RESUME_ENCRYPTION_KEY, or (dev only) the BETTER_AUTH_SECRET fallback.
 * Never throws; mirrors the resolution order in configuredSecret()/encryptionKey().
 */
export function resumeEncryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
