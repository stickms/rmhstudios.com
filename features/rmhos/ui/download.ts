/** Hands bytes to the browser as a file download. */
export function downloadBytes(
  name: string,
  bytes: Uint8Array,
  type = 'application/gzip',
): void {
  const url =
    URL.createObjectURL(
      new Blob(
        [
          bytes as BlobPart,
        ],
        {
          type,
        },
      ),
    );
  const a =
    document.createElement(
      'a',
    );
  a.href =
    url;
  a.download =
    name;
  a.rel =
    'noopener';
  document.body.appendChild(
    a,
  );
  a.click();
  a.remove();
  setTimeout(
    () =>
      URL.revokeObjectURL(
        url,
      ),
    10_000,
  );
}

export const BACKUP_FILE =
  'rmhos-home.tar.gz';
export const DAMAGED_FILE =
  'rmhos-home-damaged.gz';
export const LAST_SAVED_FILE =
  'rmhos-home-last-saved.tar.gz';
export const REPLACED_FILE =
  'rmhos-home-replaced.tar.gz';

/** The file a stored copy downloads as. An unreadable current archive carries the damaged name. */
export function copyFileName(
  kind:
    | 'current'
    | 'replaced'
    | 'damaged',
  currentDamaged: boolean,
): string {
  if (
    kind ===
    'replaced'
  )
    return REPLACED_FILE;
  if (
    kind ===
    'damaged'
  )
    return DAMAGED_FILE;
  return currentDamaged
    ? DAMAGED_FILE
    : BACKUP_FILE;
}
