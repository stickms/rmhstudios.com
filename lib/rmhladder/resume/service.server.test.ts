import { describe, expect, it, vi } from 'vitest';
import { deleteResume, downloadResume } from './service.server';
import type { ResumePrisma } from './service.server';

function prismaWithResume(storageKey = 'private/rmhladder/resumes/user-1/resume-1/object.pdf') {
  const deleteRow = vi.fn().mockResolvedValue({ id: 'resume-1' });
  const prisma = {
    ladderResume: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'resume-1', userId: 'user-1', activeVersionId: 'version-1',
        versions: [{ id: 'version-1', storageKey, filename: 'resume.pdf', mimeType: 'application/pdf', sha256: 'abc' }],
      }),
      delete: deleteRow,
    },
  } as unknown as ResumePrisma;
  return { prisma, deleteRow };
}

describe('private resume ownership service', () => {
  it('keeps the DB ownership row when private object deletion fails', async () => {
    const { prisma, deleteRow } = prismaWithResume();
    const storage = { put: vi.fn(), get: vi.fn(), delete: vi.fn().mockRejectedValue(new Error('S3 unavailable')) };
    await expect(deleteResume(prisma, 'user-1', 'resume-1', storage)).rejects.toThrow('S3 unavailable');
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('refuses to read a storage key outside the authenticated owner namespace', async () => {
    const { prisma } = prismaWithResume('private/rmhladder/resumes/user-2/resume-1/object.pdf');
    const storage = { put: vi.fn(), get: vi.fn(), delete: vi.fn() };
    await expect(downloadResume(prisma, 'user-1', 'resume-1', storage)).rejects.toThrow('not found');
    expect(storage.get).not.toHaveBeenCalled();
  });
});

