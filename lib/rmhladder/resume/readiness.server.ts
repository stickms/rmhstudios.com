import { s3Configured } from '@/lib/storage/s3.server';
import { resumeEncryptionConfigured } from './crypto.server';

export interface ResumeReadiness {
  ready: boolean;
  objectStorageConfigured: boolean;
  encryptionKeyConfigured: boolean;
  /** Operator-facing capability descriptions that are missing (never secret values). */
  missing: string[];
}

const OBJECT_STORAGE_LABEL =
  'object storage (S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)';
const ENCRYPTION_LABEL = 'resume encryption key (LADDER_RESUME_ENCRYPTION_KEY)';

/**
 * Single source of truth for whether resumes can be stored. Resumes are PII and
 * require object storage (no local-FS fallback in production) plus an encryption
 * key. Read fresh each call so operators can fix env without a rebuild.
 */
export function resumeSubsystemReadiness(): ResumeReadiness {
  const objectStorageConfigured = s3Configured();
  const encryptionKeyConfigured = resumeEncryptionConfigured();
  const missing: string[] = [];
  if (!objectStorageConfigured) missing.push(OBJECT_STORAGE_LABEL);
  if (!encryptionKeyConfigured) missing.push(ENCRYPTION_LABEL);
  return {
    ready: missing.length === 0,
    objectStorageConfigured,
    encryptionKeyConfigured,
    missing,
  };
}

/** Operator-facing message for logs / admin surfaces. Empty when ready. */
export function resumeReadinessError(readiness: ResumeReadiness): string {
  if (readiness.ready) return '';
  return `Resume storage is not configured — missing: ${readiness.missing.join('; ')}.`;
}
