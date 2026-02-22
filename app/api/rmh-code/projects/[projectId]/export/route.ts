import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

/** CRC-32 checksum for ZIP STORE method */
function crc32(data: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (table[(crc ^ data[i]) & 0xff]!) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a minimal ZIP archive using the STORE (no compression) method */
function buildZip(files: Array<{ path: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let localOffset = 0;

  for (const { path, content } of files) {
    const data = Buffer.from(content, 'utf8');
    const name = Buffer.from(path, 'utf8');
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 bytes + filename)
    const lh = Buffer.alloc(30 + name.length);
    lh.writeUInt32LE(0x04034b50, 0);   // Local file header signature
    lh.writeUInt16LE(20, 4);           // Version needed to extract
    lh.writeUInt16LE(0, 6);            // General purpose bit flag
    lh.writeUInt16LE(0, 8);            // Compression method: STORE
    lh.writeUInt16LE(0, 10);           // Last mod file time
    lh.writeUInt16LE(0, 12);           // Last mod file date
    lh.writeUInt32LE(crc, 14);         // CRC-32
    lh.writeUInt32LE(size, 18);        // Compressed size
    lh.writeUInt32LE(size, 22);        // Uncompressed size
    lh.writeUInt16LE(name.length, 26); // File name length
    lh.writeUInt16LE(0, 28);           // Extra field length
    name.copy(lh, 30);

    localParts.push(lh, data);

    // Central directory header (46 bytes + filename)
    const ch = Buffer.alloc(46 + name.length);
    ch.writeUInt32LE(0x02014b50, 0);   // Central directory signature
    ch.writeUInt16LE(20, 4);           // Version made by
    ch.writeUInt16LE(20, 6);           // Version needed
    ch.writeUInt16LE(0, 8);            // General purpose bit flag
    ch.writeUInt16LE(0, 10);           // Compression method
    ch.writeUInt16LE(0, 12);           // Last mod file time
    ch.writeUInt16LE(0, 14);           // Last mod file date
    ch.writeUInt32LE(crc, 16);         // CRC-32
    ch.writeUInt32LE(size, 20);        // Compressed size
    ch.writeUInt32LE(size, 24);        // Uncompressed size
    ch.writeUInt16LE(name.length, 28); // File name length
    ch.writeUInt16LE(0, 30);           // Extra field length
    ch.writeUInt16LE(0, 32);           // File comment length
    ch.writeUInt16LE(0, 34);           // Disk number start
    ch.writeUInt16LE(0, 36);           // Internal file attributes
    ch.writeUInt32LE(0, 38);           // External file attributes
    ch.writeUInt32LE(localOffset, 42); // Relative offset of local header
    name.copy(ch, 46);

    centralHeaders.push(ch);
    localOffset += 30 + name.length + size;
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralHeaders);

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);           // End of central dir signature
  eocd.writeUInt16LE(0, 4);                    // Disk number
  eocd.writeUInt16LE(0, 6);                    // Disk with start of central dir
  eocd.writeUInt16LE(files.length, 8);         // Number of entries on this disk
  eocd.writeUInt16LE(files.length, 10);        // Total number of entries
  eocd.writeUInt32LE(centralData.length, 12);  // Size of central directory
  eocd.writeUInt32LE(localData.length, 16);    // Offset of central directory
  eocd.writeUInt16LE(0, 20);                   // Comment length

  return Buffer.concat([localData, centralData, eocd]);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await params;

  const project = await prisma.codeProject.findUnique({
    where: { id: projectId },
    include: {
      files: {
        orderBy: { path: 'asc' },
        select: { path: true, content: true },
      },
    },
  });

  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const zipBuffer = buildZip(project.files);
  const safeName = project.name.replace(/[^a-zA-Z0-9_\-]/g, '_');

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Content-Length': zipBuffer.length.toString(),
    },
  });
}
