/** CRC-32 (IEEE 802.3, as tier1's CRC32_ProcessSingleBuffer): the key of caption and scene lookups. */

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

/** CRC-32 of a Latin-1 string (the engine hashes the bytes of its char strings). */
export function crc32(text: string): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < text.length; i++) c = t[(c ^ text.charCodeAt(i)) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
