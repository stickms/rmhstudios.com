/**
 * Family names inside a TrueType/OpenType file.
 *
 * `clientscheme.res` refers to faces by their *internal* family name
 * (`"name" "TF2 Build"`), not by file name, so to make a bundled `.ttf` answer
 * to the right scheme font we read its `name` table.
 */

function decode(view: DataView, start: number, length: number, utf16: boolean): string {
  let out = '';
  if (utf16) {
    for (let i = 0; i + 1 < length; i += 2) out += String.fromCharCode(view.getUint16(start + i));
  } else {
    for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(start + i));
  }
  return out;
}

export function readFontNames(bytes: Uint8Array): string[] {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let base = 0;
    // `ttcf` collection: use the first font.
    if (v.getUint32(0) === 0x74746366) base = v.getUint32(12);
    const numTables = v.getUint16(base + 4);
    let nameOff = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + i * 16;
      const tag = String.fromCharCode(
        v.getUint8(rec),
        v.getUint8(rec + 1),
        v.getUint8(rec + 2),
        v.getUint8(rec + 3),
      );
      if (tag === 'name') {
        nameOff = v.getUint32(rec + 8);
        break;
      }
    }
    if (nameOff < 0) return [];
    const count = v.getUint16(nameOff + 2);
    const strings = nameOff + v.getUint16(nameOff + 4);
    const found = new Set<string>();
    for (let i = 0; i < count; i++) {
      const rec = nameOff + 6 + i * 12;
      const platform = v.getUint16(rec);
      const nameId = v.getUint16(rec + 6);
      if (nameId !== 1 && nameId !== 16) continue;
      const len = v.getUint16(rec + 8);
      const off = v.getUint16(rec + 10);
      const s = decode(v, strings + off, len, platform === 3 || platform === 0).trim();
      if (s) found.add(s);
    }
    return [...found];
  } catch {
    return [];
  }
}
