/** Decode numeric HTML entities without truncating astral characters or throwing on invalid input. */
export function decodeNumericEntities(value: string): string {
  return value.replace(
    /&#(?:x([0-9a-f]+)|([0-9]+));/gi,
    (match, hex: string | undefined, decimal: string | undefined) => {
      const code = Number.parseInt(hex ?? decimal!, hex === undefined ? 10 : 16);
      if (!Number.isSafeInteger(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
        return match;
      return String.fromCodePoint(code);
    },
  );
}
