const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

export const LADDER_RESUME_PREFIX = 'private/rmhladder/resumes/';

function safeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function resumeExtension(mimeType: string): 'pdf' | 'docx' | 'txt' {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mimeType === 'text/plain') return 'txt';
  throw new Error('Unsupported resume MIME type');
}

export function resumeObjectKey(args: {
  userId: string;
  resumeId: string;
  versionId: string;
  mimeType: string;
}): string {
  return `${LADDER_RESUME_PREFIX}${safeSegment(args.userId, 'user id')}/${safeSegment(args.resumeId, 'resume id')}/${safeSegment(args.versionId, 'version id')}.${resumeExtension(args.mimeType)}`;
}

export function isOwnedResumeKey(key: string, userId: string): boolean {
  if (!SAFE_SEGMENT.test(userId)) return false;
  return key.startsWith(`${LADDER_RESUME_PREFIX}${userId}/`) && !key.includes('..') && !key.includes('\\');
}
