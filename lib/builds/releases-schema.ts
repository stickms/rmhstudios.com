import { z } from 'zod';
import { CHANGELOG_MAX, VERSION_MAX, isValidCommitHash, isValidVersion } from '@/lib/builds/releases';

export const createReleaseBody = z.object({
  version: z
    .string()
    .trim()
    .min(1, 'Enter a version')
    .max(VERSION_MAX, `A version is at most ${VERSION_MAX} characters`)
    .refine(isValidVersion, 'Use letters, digits, dots, plus and hyphens, starting with a letter or digit'),
  changelog: z.string().max(CHANGELOG_MAX, `A changelog is at most ${CHANGELOG_MAX} characters`).optional(),
  commitHash: z.string().trim().refine(isValidCommitHash, 'A commit is 7 to 40 hexadecimal characters').optional(),
});

export type CreateReleaseInput = z.infer<typeof createReleaseBody>;
