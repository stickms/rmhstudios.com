/**
 * The ghost boxes still to clean (steel-rules.test.ts, kind `ghost-box`): `rounded-site` with horizontal padding and no
 * fill, ring, shadow or border. Per file, the batch that removes it and how many it has now. A file may not gain one, a
 * file whose count fell must lower its number, and an entry with none left must be deleted. Entries only come out.
 */
export const STEEL_GHOST_BASELINE: Record<string, { batch: string; count: number }> = {
  'components/party/ConnectionsPages.tsx': { batch: 'E4 rest', count: 2 },
};
