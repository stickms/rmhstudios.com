import { useCallback, useMemo, useState } from 'react';
import { useRequireAltText } from '@/components/feed/AltTextNotice';
import { missingAltIndexes } from '@/lib/feed/alt-text';

/**
 * The descriptions for the images pending in a message composer, shared by the
 * direct and the group composer. Kept by image URL rather than by position so
 * removing an image can never leave its description on the next one; `alts` is
 * the index-aligned list the endpoints take (an empty string is "none").
 *
 * With the member's "Require image descriptions" setting on, `missing` names the
 * images that still need one and the composer blocks sending. The server
 * enforces the same rule (`422`, code `alt-text-required`); `markRequired` turns
 * the check on when it answers that, so a setting changed in another tab is
 * handled the same way.
 */
export function useMessageImageAlts(imageUrls: string[]) {
  const [byUrl, setByUrl] = useState<Record<string, string>>({});
  const [forced, setForced] = useState(false);
  const requireSetting = useRequireAltText(imageUrls.length > 0);
  const required = requireSetting || forced;

  const alts = useMemo(() => imageUrls.map((url) => byUrl[url] ?? ''), [imageUrls, byUrl]);
  const missing = useMemo(() => (required ? missingAltIndexes(imageUrls, alts) : []), [required, imageUrls, alts]);

  const setAlt = useCallback((url: string, value: string) => {
    setByUrl((prev) => ({
      ...prev,
      [url]: value,
    }));
  }, []);
  const markRequired = useCallback(() => setForced(true), []);

  return {
    alts,
    missing,
    setAlt,
    markRequired,
  };
}

export type MessageImageAlts = ReturnType<typeof useMessageImageAlts>;
