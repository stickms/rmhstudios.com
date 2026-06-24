/**
 * RMH Studios — Library upload orchestration.
 *
 * Pure, dependency-injected core of the upload endpoint: quota → validation →
 * unique slug → store to object storage → persist metadata. Keeping storage and
 * persistence behind `UploadDeps` makes the whole flow unit-testable and lets the
 * route stay a thin adapter.
 */
import {
  validatePdfBuffer,
  validateBookFields,
  libraryPdfMaxBytes,
  LIBRARY_USER_QUOTA,
} from './upload-validation';
import { libraryPdfKey, libraryCoverKey, slugifyTitle } from './keys';

export type CreateDocInput = {
  id: string;
  slug: string;
  title: string;
  description: string;
  pages: number;
  pdfKey: string;
  coverKey: string | null;
  sizeBytes: number;
  uploadedByUserId: string;
  /** Curated/official entry — admin uploads land in the curated section. */
  official: boolean;
};

export type UploadDeps = {
  putObject: (key: string, body: Buffer, contentType: string) => Promise<void>;
  createDoc: (data: CreateDocInput) => Promise<{ slug: string }>;
  countUserDocs: (userId: string) => Promise<number>;
  slugExists: (slug: string) => Promise<boolean>;
  newId: () => string;
  /** Compress the PDF for at-rest storage (gzip when smaller). */
  compress: (pdf: Buffer) => Buffer;
};

export type UploadInput = {
  userId: string;
  pdf: Buffer;
  cover: Buffer | null;
  title: string;
  description: string;
  pages: number;
  /** Whether the uploader is an admin (raises the size ceiling, marks curated). */
  isAdmin: boolean;
};

export type UploadResult =
  | { ok: true; slug: string }
  | { ok: false; status: number; error: string };

async function resolveUniqueSlug(
  base: string,
  slugExists: (slug: string) => Promise<boolean>
): Promise<string> {
  if (!(await slugExists(base))) return base;
  let n = 2;
  while (await slugExists(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function processLibraryUpload(
  deps: UploadDeps,
  input: UploadInput
): Promise<UploadResult> {
  const count = await deps.countUserDocs(input.userId);
  if (count >= LIBRARY_USER_QUOTA) {
    return {
      ok: false,
      status: 429,
      error: `You've reached the upload limit of ${LIBRARY_USER_QUOTA} books.`,
    };
  }

  const pdfCheck = validatePdfBuffer(input.pdf);
  if (!pdfCheck.ok) return { ok: false, status: 415, error: pdfCheck.error };

  const maxBytes = libraryPdfMaxBytes(input.isAdmin);
  if (input.pdf.length > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `PDF too large. Maximum size is ${maxBytes / 1024 / 1024} MB.`,
    };
  }

  const fieldCheck = validateBookFields({
    title: input.title,
    pages: input.pages,
    description: input.description,
  });
  if (!fieldCheck.ok) return { ok: false, status: 422, error: fieldCheck.error };

  const id = deps.newId();
  const slug = await resolveUniqueSlug(slugifyTitle(input.title), deps.slugExists);
  const pdfKey = libraryPdfKey(id);
  const coverKey = input.cover ? libraryCoverKey(id) : null;

  // Compress the PDF before storage (served back with Content-Encoding: gzip).
  await deps.putObject(pdfKey, deps.compress(input.pdf), 'application/pdf');
  if (input.cover && coverKey) {
    await deps.putObject(coverKey, input.cover, 'image/jpeg');
  }

  await deps.createDoc({
    id,
    slug,
    title: input.title.trim(),
    description: input.description ?? '',
    pages: input.pages,
    pdfKey,
    coverKey,
    sizeBytes: input.pdf.length,
    uploadedByUserId: input.userId,
    official: input.isAdmin,
  });

  return { ok: true, slug };
}
