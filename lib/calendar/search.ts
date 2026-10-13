/** Search-param contract for /when — kept out of the route file's component imports. */
export interface WhenSearch {
  communityId?: string;
  groupChatId?: string;
}

export function validateWhenSearch(raw: Record<string, unknown>): WhenSearch {
  const pick = (v: unknown) =>
    typeof v === 'string' && v.length > 0 && v.length <= 40 ? v : undefined;
  return { communityId: pick(raw.communityId), groupChatId: pick(raw.groupChatId) };
}
