/**
 * Library reader sync — server side. A signed-in reader's place, bookmarks and page
 * notes per book (`LibraryReaderMark`), the Continue reading row and the account
 * export. Every function takes the caller's `userId` and puts it in every query's
 * `where`, so a member's marks are never readable or writable by anyone else (the
 * book's uploader included); a book the member cannot open (hidden or missing)
 * refuses reads and writes alike. The conflict rule is the pure one in
 * `reader-sync.ts`, so the server and the device pick the same winner.
 */
import type { LibraryReaderMark } from '@prisma/client';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getBook } from '@/lib/library/library.server';
import { prisma } from '@/lib/prisma.server';
import { RESUME_MAX_RATIO } from '@/lib/history/constants';
import type { ContinueBook, ReaderMarksRes } from '@/lib/library/reader-sync.contract';
import type { PutMarksBody } from '@/lib/library/reader-sync-schema';
import {
  admitNewMarks,
  clampEditTime,
  isTombstone,
  percentRead,
  PLACE_CLIENT_ID,
  TOMBSTONE_TTL_MS,
  winner,
  type MarkRecord,
  type PlaceRecord,
} from '@/lib/library/reader-sync';

/** The Continue reading row, and the resume rail's library cards, show at most this many. */
export const CONTINUE_LIMIT = 6;
/** More place rows than the row shows are read, because hidden and finished books drop out. */
const CONTINUE_SCAN = 24;
const MARK_KINDS_DB = ['bookmark', 'note'];

function toRecord(row: LibraryReaderMark): MarkRecord {
  return {
    id: row.clientId,
    kind: row.kind === 'note' ? 'note' : 'bookmark',
    page: row.page,
    label: row.label,
    body: row.body,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    deletedAt: row.deletedAt ? row.deletedAt.getTime() : null,
  };
}

function toPlace(row: LibraryReaderMark): PlaceRecord {
  return {
    page: row.page,
    location: row.location,
    updatedAt: row.updatedAt.getTime(),
  };
}

/** Whether this member can open the book: it exists and is not hidden. */
async function readable(slug: string): Promise<boolean> {
  return (await getBook(slug)) !== undefined;
}

/** The caller's place and marks for one book, or null when the book is not readable. */
export async function getReaderMarks(
  userId: string,
  slug: string,
  now: number = Date.now(),
): Promise<ReaderMarksRes | null> {
  if (!(await readable(slug))) return null;
  const rows = await prisma.libraryReaderMark.findMany({
    where: {
      userId,
      docSlug: slug,
      OR: [
        {
          deletedAt: null,
        },
        {
          deletedAt: {
            gt: new Date(now - TOMBSTONE_TTL_MS),
          },
        },
      ],
    },
    orderBy: [
      {
        page: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
    take: 2000,
  });
  const placeRow = rows.find((r) => r.kind === 'place');
  return {
    place: placeRow ? toPlace(placeRow) : null,
    marks: rows.filter((r) => r.kind !== 'place').map(toRecord),
    rejected: [],
  };
}

/**
 * Apply a batch of upserts and tombstones for one book. Per id the newer edit wins
 * (the same rule the device uses), so replaying a batch, or a stale device's batch,
 * changes nothing it should not. New live marks are admitted under the 500 per book
 * and 5,000 per member caps inside the transaction, after taking the member's lock,
 * so two devices cannot both slip past the check. The answer is the server's
 * canonical record for every id sent, which the client adopts.
 */
export async function putReaderMarks(
  userId: string,
  slug: string,
  body: PutMarksBody,
  now: number = Date.now(),
): Promise<ReaderMarksRes | null> {
  if (!(await readable(slug))) return null;

  // One entry per id: when the batch names an id twice the later one is the intent.
  const incoming = new Map<string, MarkRecord>();
  for (const m of body.marks) {
    const updatedAt = clampEditTime(m.updatedAt, now);
    incoming.set(m.id, {
      ...m,
      // A deleted note's words are not kept.
      label: m.deletedAt === null ? m.label : null,
      body: m.deletedAt === null ? m.body : null,
      createdAt: clampEditTime(m.createdAt, now),
      updatedAt,
      deletedAt: m.deletedAt === null ? null : updatedAt, // a tombstone is stamped with its own edit time
    });
  }
  const ids = [...incoming.keys()];

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `reader-marks:${userId}`);

    await tx.libraryReaderMark.deleteMany({
      where: {
        // Every book's expired tombstones, not just this one's: a book not opened again would never be pruned.
        userId,
        deletedAt: {
          lt: new Date(now - TOMBSTONE_TTL_MS),
        },
      },
    });

    const existingRows = await tx.libraryReaderMark.findMany({
      where: {
        userId,
        docSlug: slug,
        clientId: {
          in: body.place ? [...ids, PLACE_CLIENT_ID] : ids,
        },
      },
    });
    const existing = new Map(existingRows.map((r) => [r.clientId, r]));

    // Decide each mark: leave the stored one, or queue the incoming one for writing.
    const canonical = new Map<string, MarkRecord>();
    const pending: Array<{
      record: MarkRecord;
      stored: MarkRecord | null;
      addsLive: boolean;
    }> = [];
    for (const rec of incoming.values()) {
      const row = existing.get(rec.id);
      if (!row) {
        // Nothing stored to delete: the device is done with a tombstone for a mark the server never had.
        if (isTombstone(rec)) canonical.set(rec.id, rec);
        else
          pending.push({
            record: rec,
            stored: null,
            addsLive: true,
          });
        continue;
      }
      const stored = toRecord(row);
      // A bookmark never turns into a note: kind is fixed by the first write.
      if (row.kind !== rec.kind || winner(rec, stored) === stored) {
        canonical.set(rec.id, stored);
        continue;
      }
      pending.push({
        record: rec,
        stored,
        addsLive: isTombstone(stored) && !isTombstone(rec), // a newer edit undoes an older deletion
      });
    }

    const adding = pending.filter((p) => p.addsLive).map((p) => p.record.id);
    let rejected: string[] = [];
    let writes = pending;
    if (adding.length > 0) {
      const [bookLive, userLive] = await Promise.all([
        tx.libraryReaderMark.count({
          where: {
            userId,
            docSlug: slug,
            kind: {
              in: MARK_KINDS_DB,
            },
            deletedAt: null,
          },
        }),
        tx.libraryReaderMark.count({
          where: {
            userId,
            kind: {
              in: MARK_KINDS_DB,
            },
            deletedAt: null,
          },
        }),
      ]);
      const plan = admitNewMarks(adding, bookLive, userLive);
      rejected = plan.rejected;
      const turnedAway = new Set(plan.rejected);
      writes = [];
      for (const p of pending) {
        if (!turnedAway.has(p.record.id)) writes.push(p);
        else if (p.stored) canonical.set(p.record.id, p.stored);
      }
    }

    for (const { record, stored } of writes) {
      const data = {
        kind: record.kind,
        page: record.page,
        label: record.label,
        body: record.body,
        deletedAt: record.deletedAt === null ? null : new Date(record.deletedAt),
        updatedAt: new Date(record.updatedAt),
      };
      if (!stored) {
        await tx.libraryReaderMark.create({
          data: {
            userId,
            docSlug: slug,
            clientId: record.id,
            createdAt: new Date(record.createdAt),
            ...data,
          },
        });
      } else {
        await tx.libraryReaderMark.update({
          where: {
            userId_docSlug_clientId: {
              userId,
              docSlug: slug,
              clientId: record.id,
            },
          },
          data,
        });
      }
      canonical.set(record.id, record);
    }

    // The place: a plain last-write-wins row with the fixed client id.
    let place: PlaceRecord | null = null;
    const placeRow = existing.get(PLACE_CLIENT_ID);
    if (placeRow) place = toPlace(placeRow);
    if (body.place) {
      const updatedAt = clampEditTime(body.place.updatedAt, now);
      if (!placeRow || updatedAt > placeRow.updatedAt.getTime()) {
        const data = {
          kind: 'place',
          page: body.place.page,
          location: body.place.location,
          updatedAt: new Date(updatedAt),
        };
        await tx.libraryReaderMark.upsert({
          where: {
            userId_docSlug_clientId: {
              userId,
              docSlug: slug,
              clientId: PLACE_CLIENT_ID,
            },
          },
          create: {
            userId,
            docSlug: slug,
            clientId: PLACE_CLIENT_ID,
            ...data,
          },
          update: data,
        });
        place = {
          page: body.place.page,
          location: body.place.location,
          updatedAt,
        };
      }
    }

    return {
      place,
      marks: ids.flatMap((id) => canonical.get(id) ?? []),
      rejected,
    };
  });
}

/** Remove everything the caller has synced for one book. Own data, so it needs no book access. */
export async function deleteReaderMarks(userId: string, slug: string): Promise<number> {
  const { count } = await prisma.libraryReaderMark.deleteMany({
    where: {
      userId,
      docSlug: slug,
    },
  });
  return count;
}

/** The caller's books by latest place, finished and unreadable ones left out. */
export async function listContinueReading(userId: string, limit: number = CONTINUE_LIMIT): Promise<ContinueBook[]> {
  const rows = await prisma.libraryReaderMark.findMany({
    where: {
      userId,
      kind: 'place',
      deletedAt: null,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: CONTINUE_SCAN,
  });
  const books = await Promise.all(rows.map((r) => getBook(r.docSlug)));
  const out: ContinueBook[] = [];
  rows.forEach((row, i) => {
    const book = books[i];
    if (!book) return;
    const percent = percentRead(row.page, book.pages);
    if (percent >= RESUME_MAX_RATIO * 100) return;
    out.push({
      slug: book.slug,
      title: book.title,
      coverUrl: book.coverUrl,
      hue: book.hue,
      page: row.page,
      pages: book.pages,
      percent,
      updatedAt: row.updatedAt.getTime(),
    });
  });
  return out.slice(0, limit);
}

export interface ReaderMarkExport {
  book: string;
  kind: string;
  page: number;
  location: string | null;
  label: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Everything the member has synced, for the account export. Deleted marks are not included. */
export async function exportReaderMarks(userId: string): Promise<ReaderMarkExport[]> {
  const rows = await prisma.libraryReaderMark.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    orderBy: [
      {
        docSlug: 'asc',
      },
      {
        page: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
  });
  return rows.map((r) => ({
    book: r.docSlug,
    kind: r.kind,
    page: r.page,
    location: r.location,
    label: r.label,
    note: r.body,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
