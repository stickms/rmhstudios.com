/**
 * Deciding a mod-queue item (s10-13, server-only): the one path the site's route and the developer API both
 * take. It owns what used to live in the route: checking the cited rule belongs to the community, resolving
 * the item (`resolveModItem`: claim, log row, content change), queueing a released post's alerts, recording
 * the rule citation and telling the author. Callers do the moderator check (`requireMod` or its API twin)
 * before they call; nothing here takes a moderator id from a request body.
 */
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { AutomodError, resolveModItem } from '@/lib/communities/automod.server';
import { getRule, recordCitation } from '@/lib/communities/rules.server';
import { removalNoticeText } from '@/lib/communities/rules';
import { enqueuePostAlert } from '@/lib/communities/post-alerts.server';
import type { ModVia } from '@/lib/communities/modlog';

export interface DecideModItemInput {
  community: { id: string; name: string };
  itemId: string;
  decision: 'approve' | 'remove';
  moderatorId: string;
  /** The community rule a removal cites. */
  ruleId?: string | undefined;
  /** A note sent to the author with a removal. */
  message?: string | undefined;
  /** `'api'` when a developer-API key made the call (moderators' log detail only). */
  via?: ModVia | undefined;
}

export type DecideModItemResult =
  | { ok: true; status: 'APPROVED' | 'REMOVED' }
  | { ok: false; reason: 'rule_not_found'; status: 400; error: string }
  | { ok: false; reason: 'not_found' | 'resolved' | 'refused'; status: 400 | 404 | 409; error: string };

/**
 * Approve or remove one queue item. A removal may cite one of the community's rules; the author's notice then
 * names it ("Removed from X for breaking rule 3: Title"). Throws what `resolveModItem` throws that is not an
 * `AutomodError` (the claim is taken back first), so a caller's own error handling reports it.
 */
export async function decideModItem(input: DecideModItemInput): Promise<DecideModItemResult> {
  const { community, itemId, decision, moderatorId } = input;
  const removing = decision === 'remove';
  // Check the cited rule belongs to this community before anything is resolved.
  const rule = removing && input.ruleId ? await getRule(community.id, input.ruleId) : null;
  if (removing && input.ruleId && !rule) {
    return { ok: false, reason: 'rule_not_found', status: 400, ...refusalBody('COMMUNITY_RULE_NOT_FOUND') };
  }
  try {
    const result = await resolveModItem(community.id, itemId, decision, moderatorId, {
      ...(removing ? { rule: rule ? { id: rule.id, title: rule.title } : null, reason: input.message ?? null } : {}),
      ...(input.via ? { via: input.via } : {}),
    });
    // A held post that a moderator approves becomes visible now: its alerts go out on approval, not on creation.
    if (!removing) {
      const approved = await prisma.communityModItem.findUnique({
        where: { id: itemId },
        select: { action: true, entityType: true, entityId: true },
      });
      if (approved?.action === 'hold' && approved.entityType === 'rmhark' && approved.entityId) {
        await enqueuePostAlert(approved.entityId);
      }
    }
    if (removing && (input.message || rule)) {
      const item = await prisma.communityModItem.findUnique({
        where: { id: itemId },
        select: { authorId: true },
      });
      if (rule) await recordCitation(itemId, rule);
      if (item) {
        await createNotification({
          userId: item.authorId,
          type: 'SYSTEM',
          entityType: 'community',
          entityId: community.id,
          preview: rule
            ? removalNoticeText({ communityName: community.name, rule, message: input.message })
            : (input.message ?? null),
        });
      }
    }
    return { ok: true, status: result.status };
  } catch (e) {
    if (e instanceof AutomodError) {
      const reason = e.status === 404 ? 'not_found' : e.status === 409 ? 'resolved' : 'refused';
      return { ok: false, reason, status: e.status, error: e.message };
    }
    throw e;
  }
}
