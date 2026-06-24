import { describe, test, expect, vi } from 'vitest';
import { processLibraryUpload, type UploadDeps } from '@/lib/library/upload';

const PDF = Buffer.from('%PDF-1.7\n...body...');
const COVER = Buffer.from('\xff\xd8\xffcover');

function makeDeps(over: Partial<UploadDeps> = {}): UploadDeps {
  return {
    putObject: vi.fn(async () => {}),
    createDoc: vi.fn(async (d) => ({ slug: d.slug })),
    countUserDocs: vi.fn(async () => 0),
    slugExists: vi.fn(async () => false),
    newId: () => 'id1',
    compress: vi.fn((b: Buffer) => b),
    ...over,
  };
}

const input = {
  userId: 'u1',
  pdf: PDF,
  cover: COVER,
  title: 'Field Manual',
  description: 'A manual.',
  pages: 5,
  isAdmin: false,
};

describe('processLibraryUpload', () => {
  test('stores pdf + cover and creates the document on the happy path', async () => {
    const deps = makeDeps();
    const res = await processLibraryUpload(deps, input);

    expect(res).toEqual({ ok: true, slug: 'field-manual' });
    expect(deps.putObject).toHaveBeenCalledWith('library/id1.pdf', PDF, 'application/pdf');
    expect(deps.putObject).toHaveBeenCalledWith('library/covers/id1.jpg', COVER, 'image/jpeg');
    expect(deps.createDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'id1',
        slug: 'field-manual',
        title: 'Field Manual',
        pages: 5,
        pdfKey: 'library/id1.pdf',
        coverKey: 'library/covers/id1.jpg',
        uploadedByUserId: 'u1',
        official: false,
      })
    );
  });

  test('compresses the pdf before storing it', async () => {
    const compressed = Buffer.from('GZIPPED');
    const deps = makeDeps({ compress: vi.fn(() => compressed) });
    await processLibraryUpload(deps, input);
    expect(deps.compress).toHaveBeenCalledWith(PDF);
    expect(deps.putObject).toHaveBeenCalledWith('library/id1.pdf', compressed, 'application/pdf');
  });

  test('resolves a unique slug when the base is taken', async () => {
    const slugExists = vi.fn(async (s: string) => s === 'field-manual');
    const deps = makeDeps({ slugExists });
    const res = await processLibraryUpload(deps, input);
    expect(res).toEqual({ ok: true, slug: 'field-manual-2' });
  });

  test('skips the cover upload when no cover is provided', async () => {
    const deps = makeDeps();
    await processLibraryUpload(deps, { ...input, cover: null });
    expect(deps.putObject).toHaveBeenCalledTimes(1);
    expect(deps.createDoc).toHaveBeenCalledWith(expect.objectContaining({ coverKey: null }));
  });

  test('marks admin uploads as curated (official)', async () => {
    const deps = makeDeps();
    await processLibraryUpload(deps, { ...input, isAdmin: true });
    expect(deps.createDoc).toHaveBeenCalledWith(expect.objectContaining({ official: true }));
  });

  test('rejects over quota with 429 and stores nothing', async () => {
    const deps = makeDeps({ countUserDocs: vi.fn(async () => 999) });
    const res = await processLibraryUpload(deps, input);
    expect(res).toEqual({ ok: false, status: 429, error: expect.any(String) });
    expect(deps.putObject).not.toHaveBeenCalled();
  });

  test('rejects a non-PDF with 415', async () => {
    const deps = makeDeps();
    const res = await processLibraryUpload(deps, { ...input, pdf: Buffer.from('nope') });
    expect(res).toMatchObject({ ok: false, status: 415 });
    expect(deps.putObject).not.toHaveBeenCalled();
  });

  test('rejects an empty title with 422', async () => {
    const deps = makeDeps();
    const res = await processLibraryUpload(deps, { ...input, title: '  ' });
    expect(res).toMatchObject({ ok: false, status: 422 });
  });

  test('rejects a pdf over the 10 MB non-admin cap with 413', async () => {
    const deps = makeDeps();
    const big = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(11 * 1024 * 1024)]);
    const res = await processLibraryUpload(deps, { ...input, pdf: big, isAdmin: false });
    expect(res).toMatchObject({ ok: false, status: 413 });
    expect(deps.putObject).not.toHaveBeenCalled();
  });

  test('allows the same pdf for an admin (64 MB cap)', async () => {
    const deps = makeDeps();
    const big = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(11 * 1024 * 1024)]);
    const res = await processLibraryUpload(deps, { ...input, pdf: big, isAdmin: true });
    expect(res).toMatchObject({ ok: true });
  });

  test('rejects an oversize pdf beyond the admin cap with 413', async () => {
    const deps = makeDeps();
    const big = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(65 * 1024 * 1024)]);
    const res = await processLibraryUpload(deps, { ...input, pdf: big, isAdmin: true });
    expect(res).toMatchObject({ ok: false, status: 413 });
    expect(deps.putObject).not.toHaveBeenCalled();
  });
});
