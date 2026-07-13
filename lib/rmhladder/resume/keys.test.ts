import { describe, expect, it } from 'vitest';
import { isOwnedResumeKey, resumeObjectKey } from './keys';

describe('resume storage keys', () => {
  it('namespaces private objects by owner, resume, and version', () => {
    const key = resumeObjectKey({ userId: 'user_1', resumeId: 'resume_1', versionId: 'version_1', mimeType: 'application/pdf' });
    expect(key).toBe('private/rmhladder/resumes/user_1/resume_1/version_1.pdf');
    expect(isOwnedResumeKey(key, 'user_1')).toBe(true);
    expect(isOwnedResumeKey(key, 'user_2')).toBe(false);
  });

  it('rejects traversal segments and unsupported files', () => {
    expect(() => resumeObjectKey({ userId: '../user', resumeId: 'r', versionId: 'v', mimeType: 'application/pdf' })).toThrow();
    expect(() => resumeObjectKey({ userId: 'u', resumeId: 'r', versionId: 'v', mimeType: 'application/msword' })).toThrow();
  });

  it('uses a docx extension for Word resumes', () => {
    expect(resumeObjectKey({
      userId: 'u', resumeId: 'r', versionId: 'v',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })).toBe('private/rmhladder/resumes/u/r/v.docx');
  });
});
