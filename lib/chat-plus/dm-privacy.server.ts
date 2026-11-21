/**
 * Can `senderId` message `recipientId`? The same rule the DM send routes apply
 * (`UserProfile.dmPrivacy`, and the message-request gate of s04-16), for the P04
 * paths that write DMs on the sender's behalf (forwarding, call auto-replies). A
 * note-to-self is always allowed. A refused sender who could only open a message
 * request is not allowed here: a request is one text message from the composer.
 */

import { requestGate } from '@/lib/messages/requests.server';

export async function canDirectMessage(senderId: string, recipientId: string): Promise<boolean> {
  if (senderId === recipientId) return true;
  const gate = await requestGate(senderId, recipientId);
  return gate.outcome === 'allowed';
}
