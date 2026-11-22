/**
 * Message requests, the pure half (sprint 04 #16).
 *
 * A member whose DM privacy is `FOLLOWERS` or `NONE` can switch on "Let others
 * send message requests". A sender the privacy rule refuses may then open one
 * conversation with one text message, which waits in the recipient's Requests
 * folder. This module is the decision table; `requests.server.ts` loads the
 * facts it needs and writes the rows.
 *
 * Request states, on `MessageRequest.status`:
 *  - `draft`    the sender opened the conversation but has sent nothing; nobody
 *               else can see it, and it does not count against the daily cap
 *  - `pending`  one text message waits for the recipient
 *  - `accepted` an ordinary conversation; privacy no longer applies to the pair
 *  - `declined` hidden from the recipient; the sender may not ask again for 30 days
 */

export const REQUEST_DAILY_CAP = 20;
export const REQUEST_COOLDOWN_DAYS = 30;
export const REQUEST_COOLDOWN_MS = REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
export const REQUEST_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type RequestStatus = 'draft' | 'pending' | 'accepted' | 'declined';
export type DmPrivacyValue = 'EVERYONE' | 'FOLLOWERS' | 'NONE';

/** The columns of a request the rules read. */
export interface RequestFacts {
  senderId: string;
  recipientId: string;
  status: string;
  decidedAt: Date | null;
}

/**
 * What a DM write path may do. `refused` carries why, so each path can keep the
 * refusal text it always had: `NONE` and `FOLLOWERS` are the recipient's privacy
 * rule (also the answer to a declined sender, so a decline is indistinguishable
 * from the rule); `pending` is the sender's own request still waiting; `incoming`
 * is a request from the other person that the viewer has not answered; `cap` is
 * the daily limit.
 */
export type GateDecision =
  | { outcome: 'allowed' }
  | { outcome: 'request'; privacy: 'FOLLOWERS' | 'NONE' }
  | { outcome: 'refused'; reason: 'NONE' | 'FOLLOWERS' | 'pending' | 'incoming' | 'cap' };

export interface GateFacts {
  senderId: string;
  recipientId: string;
  privacy: DmPrivacyValue;
  /** The recipient follows the sender (what `FOLLOWERS` asks for). */
  recipientFollowsSender: boolean;
  /** The recipient's "Let others send message requests" switch. */
  requestsOn: boolean;
  /** The request on the pair's chat, if it has one. */
  request: RequestFacts | null;
  /** The pair's chat already holds messages (only read when there is no request). */
  hasHistory: boolean;
  /** Requests this sender created in the last 24 hours. */
  sentInWindow: number;
  now: Date;
}

/** The privacy rule on its own: does `privacy` let this sender message the recipient? */
export function privacyAllows(privacy: DmPrivacyValue, recipientFollowsSender: boolean): boolean {
  if (privacy === 'EVERYONE') return true;
  if (privacy === 'FOLLOWERS') return recipientFollowsSender;
  return false;
}

/** A decline stops the sender asking again for 30 days. */
export function cooldownActive(decidedAt: Date | null, now: Date): boolean {
  if (!decidedAt) return false;
  return now.getTime() - decidedAt.getTime() < REQUEST_COOLDOWN_MS;
}

/** The instant a declined sender may ask again, for the export and tests. */
export function cooldownEndsAt(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + REQUEST_COOLDOWN_MS);
}

/**
 * The one decision every DM write path asks for. Order matters:
 *  1. a note to yourself is always allowed;
 *  2. a pending request stops everything, whoever asks, until the recipient decides;
 *  3. an accepted request lifts the privacy rule for the pair;
 *  4. otherwise the privacy rule decides, and only a refusal can become a request;
 *  5. a request needs the switch, a chat with no history (or this sender's own
 *     declined request past its cooldown), and room under the daily cap.
 * Everything that is not a request-or-allow answers with the privacy refusal the
 * recipient's setting gives today.
 */
export function decideGate(f: GateFacts): GateDecision {
  if (f.senderId === f.recipientId) return { outcome: 'allowed' };
  const req = f.request;
  if (req?.status === 'pending') {
    return { outcome: 'refused', reason: req.senderId === f.senderId ? 'pending' : 'incoming' };
  }
  if (req?.status === 'accepted') return { outcome: 'allowed' };
  if (privacyAllows(f.privacy, f.recipientFollowsSender)) return { outcome: 'allowed' };

  const privacy = f.privacy === 'NONE' ? 'NONE' : 'FOLLOWERS';
  if (!f.requestsOn) return { outcome: 'refused', reason: privacy };
  if (req) {
    // Someone else's request on this chat (or a draft of theirs): not this sender's to reopen.
    if (req.senderId !== f.senderId) return { outcome: 'refused', reason: privacy };
    if (req.status === 'declined' && cooldownActive(req.decidedAt, f.now)) {
      return { outcome: 'refused', reason: privacy };
    }
  } else if (f.hasHistory) {
    return { outcome: 'refused', reason: privacy };
  }
  if (f.sentInWindow >= REQUEST_DAILY_CAP) return { outcome: 'refused', reason: 'cap' };
  return { outcome: 'request', privacy };
}

/**
 * Is this chat's request hidden from the viewer entirely (they are the recipient
 * and have not accepted)? A draft or pending request is invisible to its
 * recipient everywhere but the Requests folder.
 */
export function hiddenFromRecipient(
  request: Pick<RequestFacts, 'recipientId' | 'status'> | null | undefined,
  viewerId: string,
): boolean {
  if (!request) return false;
  return request.recipientId === viewerId && (request.status === 'pending' || request.status === 'draft');
}

/**
 * Is this viewer's own request out, unanswered or declined alike? Its message is
 * stored as read so it never counts as unread for the recipient, which means the
 * sender must never be shown that flag: a read mark would say it was seen.
 */
export function requestOut(
  request: Pick<RequestFacts, 'senderId' | 'status'> | null | undefined,
  viewerId: string,
): boolean {
  return !!request && request.senderId === viewerId && (request.status === 'pending' || request.status === 'declined');
}

/** What the sender's composer shows: write a request, or the request is out. */
export type SenderRequestState = 'compose' | 'sent';

/**
 * The sender's view. A declined request reads "sent" exactly like a pending one,
 * so the sender is never told which happened. Only the requester ever sees a state.
 */
export function senderRequestState(
  decision: GateDecision,
  request: Pick<RequestFacts, 'senderId' | 'status'> | null | undefined,
  viewerId: string,
): SenderRequestState | null {
  if (decision.outcome === 'request') return 'compose';
  return requestOut(request, viewerId) ? 'sent' : null;
}

/** Whether a message may travel in a request: text only, non-empty. */
export function requestContentProblem(input: {
  content?: string | undefined;
  gifUrl?: string | undefined;
  imageUrls?: string[] | undefined;
}): 'text-only' | 'empty' | null {
  if (input.gifUrl || (input.imageUrls?.length ?? 0) > 0) return 'text-only';
  if (!input.content?.trim()) return 'empty';
  return null;
}

/** The refusal a path answers for a `refused` decision it cannot phrase itself. */
export function gateRefusalCopy(reason: 'pending' | 'incoming' | 'cap'): string {
  if (reason === 'pending') return 'Your message request is waiting for a reply.';
  if (reason === 'incoming') {
    return 'This person sent you a message request. Accept it from Requests to reply.';
  }
  return 'You have sent too many message requests today. Try again tomorrow.';
}
