/**
 * s10-20 — the sentences of the refusal taxonomy, one literal translate call per code (key, the `errors` namespace and
 * the English default). A `switch` and not a lookup of `ERROR_CODES[code].i18n` because `i18next-parser` reads only
 * literal keys, and only under `app/`, `components/` and `features/`; this file is why every key reaches
 * `locales/en/errors.json`. The English defaults here equal `ERROR_CODES[code].text`
 * (`lib/errors/__tests__/error-codes-catalogue.test.ts` holds them equal).
 *
 * This module and the catalogue it reads (`lib/errors/refusal.ts` -> `lib/errors/codes.ts`) are loaded on demand by
 * `useRefusalText` (`preloadRefusalSentences`), never statically: together they are about 45 KB of JavaScript that
 * only a failed request needs, and every route reaches the hook, so a static import put them on the critical path of
 * every page (`scripts/check-bundle-budget.ts`).
 */
import type { ErrorCode } from '@/lib/errors/codes';
import { readRefusal } from '@/lib/errors/refusal';
import type { Translate } from './useRefusalText';

/** One literal `t()` call per code. `p` holds the validated params; a date param is already in the reader's locale. */
function sentence(t: Translate, code: ErrorCode, p: Record<string, string | number>): string {
  switch (code) {
    case 'COMMUNITY_BANNED':
      return p.endsAt !== undefined
        ? t('refusal-ban-until', {
            ns: 'community-bans',
            date: p.endsAt,
            defaultValue: 'You are banned from this community until {{date}}.',
          })
        : t('refusal-ban-open', {
            ns: 'community-bans',
            defaultValue: 'You are banned from this community until a moderator lifts it.',
          });
    case 'COMMUNITY_TIMED_OUT':
      return p.endsAt !== undefined
        ? t('refusal-timeout-until', {
            ns: 'community-bans',
            date: p.endsAt,
            defaultValue: 'You are timed out of this community until {{date}}. You can read but not post.',
          })
        : t('refusal-timeout-open', {
            ns: 'community-bans',
            defaultValue: 'You are timed out of this community. You can read but not post.',
          });
    case 'UNAUTHORIZED':
      return t('unauthorized', { ns: 'errors', defaultValue: 'Sign in to continue', ...p });
    case 'FORBIDDEN':
      return t('forbidden', { ns: 'errors', defaultValue: "You don't have access to this", ...p });
    case 'UPGRADE_REQUIRED':
      return t('upgradeRequired', { ns: 'errors', defaultValue: 'This feature needs a membership', ...p });
    case 'INVALID_INPUT':
      return t('invalidInput', { ns: 'errors', defaultValue: 'Check the form and try again', ...p });
    case 'NOT_FOUND':
      return t('notFound', { ns: 'errors', defaultValue: "That doesn't exist (or was removed)", ...p });
    case 'CONFLICT':
      return t('conflict', { ns: 'errors', defaultValue: 'Someone else changed this first', ...p });
    case 'GONE':
      return t('gone', { ns: 'errors', defaultValue: 'That has expired', ...p });
    case 'RATE_LIMITED':
      return t('rateLimited', { ns: 'errors', defaultValue: 'Slow down for a moment', ...p });
    case 'QUOTA_EXCEEDED':
      return t('quotaExceeded', { ns: 'errors', defaultValue: "You're out of storage", ...p });
    case 'QUERY_BUDGET_EXCEEDED':
      return t('queryBudget', { ns: 'errors', defaultValue: 'That request was too expensive to serve', ...p });
    case 'INSUFFICIENT_COINS':
      return t('insufficientCoins', { ns: 'errors', defaultValue: "You don't have enough coins", ...p });
    case 'STAKE_LIMIT_REACHED':
      return t('stakeLimit', { ns: 'errors', defaultValue: "You've reached the limit you set", ...p });
    case 'SELF_EXCLUDED':
      return t('selfExcluded', { ns: 'errors', defaultValue: "You've excluded yourself from staking coins", ...p });
    case 'COOL_OFF_ACTIVE':
      return t('coolOff', { ns: 'errors', defaultValue: "You're taking a break from staking coins", ...p });
    case 'AI_UNAVAILABLE':
      return t('aiUnavailable', { ns: 'errors', defaultValue: 'AI features are offline', ...p });
    case 'AI_BUDGET_EXCEEDED':
      return t('aiBudget', { ns: 'errors', defaultValue: "You've used this month's AI allowance", ...p });
    case 'STORAGE_UNAVAILABLE':
      return t('storageUnavailable', { ns: 'errors', defaultValue: 'Uploads are temporarily unavailable', ...p });
    case 'INTERNAL':
      return t('internal', { ns: 'errors', defaultValue: 'Something went wrong on our side', ...p });
    case 'SPEND_BUDGET_REACHED':
      return t('overBudget', {
        ns: 'spending-budget',
        defaultValue: 'This would go over your monthly budget',
        ...p,
      });
    case 'EVENT_FULL':
      return t('eventFull', { ns: 'errors', defaultValue: 'This event is full', ...p });
    case 'WAITLIST_CLOSED':
      return t('waitlistClosed', { ns: 'errors', defaultValue: 'The waitlist is closed', ...p });
    case 'WAITLIST_FULL':
      return t('waitlistFull', { ns: 'errors', defaultValue: 'The waitlist is full', ...p });
    case 'EVENT_CANCELED':
      return t('eventCanceled', { ns: 'errors', defaultValue: 'This event was canceled', ...p });
    case 'EVENT_DATE_SKIPPED':
      return t('eventDateSkipped', { ns: 'errors', defaultValue: 'This date was skipped', ...p });
    case 'RSVP_FAILED':
      return t('rsvpFailed', { ns: 'errors', defaultValue: 'Could not update RSVP', ...p });
    case 'EVENT_DATES_HOST_ONLY':
      return t('eventDatesHostOnly', {
        ns: 'errors',
        defaultValue: 'Only the host or a co-host can change dates',
        ...p,
      });
    case 'EVENT_DATE_LOCKED':
      return t('eventDateLocked', { ns: 'errors', defaultValue: 'That date cannot be changed', ...p });
    case 'EVENT_UPDATE_FAILED':
      return t('eventUpdateFailed', { ns: 'errors', defaultValue: 'That update could not be posted', ...p });
    case 'COMMUNITY_POST_JOIN_REQUIRED':
      return t('communityPostJoinRequired', { ns: 'errors', defaultValue: 'Join the community to post in it', ...p });
    case 'COMMUNITY_JOIN_REQUIRED':
      return t('communityJoinRequired', { ns: 'errors', defaultValue: 'Join the community first', ...p });
    case 'COMMUNITY_FLAIR_REQUIRED':
      return t('communityFlairRequired', {
        ns: 'errors',
        defaultValue: 'Choose a flair for your post — this community requires one.',
        ...p,
      });
    case 'COMMUNITY_MODS_ONLY':
      return t('communityModsOnly', { ns: 'errors', defaultValue: 'Only community mods can do that', ...p });
    case 'COMMUNITY_SANCTION_SELF':
      return t('communitySanctionSelf', { ns: 'errors', defaultValue: "You can't sanction yourself", ...p });
    case 'COMMUNITY_OWNER_PROTECTED':
      return t('communityOwnerProtected', {
        ns: 'errors',
        defaultValue: "The owner can't be banned or timed out",
        ...p,
      });
    case 'COMMUNITY_MOD_SANCTION_OWNER_ONLY':
      return t('communityModSanctionOwnerOnly', {
        ns: 'errors',
        defaultValue: 'Only the owner can sanction a mod',
        ...p,
      });
    case 'COMMUNITY_NOT_A_MEMBER':
      return t('communityNotAMember', { ns: 'errors', defaultValue: 'Not a member', ...p });
    case 'COMMUNITY_MEMBER_NOT_FOUND':
      return t('communityMemberNotFound', { ns: 'errors', defaultValue: 'Member not found', ...p });
    case 'COMMUNITY_RULE_NOT_FOUND':
      return t('communityRuleNotFound', { ns: 'errors', defaultValue: 'Rule not found', ...p });
    case 'COMMUNITY_ALREADY_MEMBER':
      return t('communityAlreadyMember', { ns: 'errors', defaultValue: 'You are already a member', ...p });
    case 'COMMUNITY_IS_OPEN':
      return t('communityIsOpen', { ns: 'errors', defaultValue: 'This community is open: just join it', ...p });
    case 'COMMUNITY_CREATOR_CANNOT_LEAVE':
      return t('communityCreatorCannotLeave', {
        ns: 'errors',
        defaultValue: 'The creator cannot leave the community',
        ...p,
      });
    case 'COMMUNITY_INVITE_INVALID':
      return t('communityInviteInvalid', { ns: 'errors', defaultValue: "This invite isn't valid", ...p });
    case 'COMMUNITY_INVITES_PRIVATE_ONLY':
      return t('communityInvitesPrivateOnly', {
        ns: 'errors',
        defaultValue: 'Only private communities have invite links',
        ...p,
      });
    case 'COMMUNITY_INVITE_LIMIT':
      return t('communityInviteLimit', {
        ns: 'errors',
        defaultValue: 'A community can have at most {{max}} live invite links',
        ...p,
      });
    case 'COMMUNITY_ANNOUNCE_MODS_ONLY':
      return t('communityAnnounceModsOnly', { ns: 'errors', defaultValue: 'Only mods can post announcements', ...p });
    case 'COMMUNITY_OWNER_ROLE_LOCKED':
      return t('communityOwnerRoleLocked', { ns: 'errors', defaultValue: "The owner's role can't be changed", ...p });
    case 'COMMUNITY_ADMIN_ROLE_LOCKED':
      return t('communityAdminRoleLocked', { ns: 'errors', defaultValue: "Can't change an admin", ...p });
    case 'COMMUNITY_OWNER_NOT_REMOVABLE':
      return t('communityOwnerNotRemovable', { ns: 'errors', defaultValue: "The owner can't be removed", ...p });
    case 'COMMUNITY_MOD_REMOVE_OWNER_ONLY':
      return t('communityModRemoveOwnerOnly', { ns: 'errors', defaultValue: 'Only the owner can remove a mod', ...p });
    case 'COMMUNITY_NOT_ALLOWED':
      return t('communityNotAllowed', { ns: 'errors', defaultValue: 'Not allowed', ...p });
    case 'COMMUNITY_MACRO_LIMIT':
      return t('communityMacroLimit', { ns: 'errors', defaultValue: 'Macro limit reached', ...p });
    case 'GROUP_OWNER_ONLY':
      return t('groupOwnerOnly', { ns: 'errors', defaultValue: 'Only the owner can do that', ...p });
    case 'GROUP_NOT_ALLOWED':
      return t('groupNotAllowed', { ns: 'errors', defaultValue: "You can't do that", ...p });
    case 'GROUP_OWNER_ABOVE_ADMINS':
      return t('groupOwnerAboveAdmins', { ns: 'errors', defaultValue: 'The owner is already above admins', ...p });
    case 'GROUP_ADMIN_LIMIT':
      return t('groupAdminLimit', { ns: 'errors', defaultValue: 'A group can have {{max}} admins', ...p });
    case 'GROUP_USE_LEAVE':
      return t('groupUseLeave', { ns: 'errors', defaultValue: 'Use leave instead', ...p });
    case 'GROUP_ALREADY_OWNER':
      return t('groupAlreadyOwner', { ns: 'errors', defaultValue: 'You already own this group', ...p });
    case 'GROUP_INVITE_UNUSABLE':
      return t('groupInviteUnusable', { ns: 'errors', defaultValue: "This invite can't be used", ...p });
    case 'GROUP_TOO_MANY':
      return t('groupTooMany', { ns: 'errors', defaultValue: 'You are in too many groups', ...p });
    case 'GROUP_NEEDS_MEMBER':
      return t('groupNeedsMember', { ns: 'errors', defaultValue: 'Add at least one other member', ...p });
    case 'GROUP_INVITE_LIMIT':
      return t('groupInviteLimit', {
        ns: 'errors',
        defaultValue: 'A group can have {{max}} invite links at a time',
        ...p,
      });
    case 'GROUP_NOT_A_MEMBER':
      return t('groupNotAMember', { ns: 'errors', defaultValue: 'Not a member', ...p });
    case 'GROUP_ONE_TO_ONE_ONLY':
      return t('groupOneToOneOnly', {
        ns: 'errors',
        defaultValue: 'Receipts and typing indicators only apply to one-to-one chats',
        ...p,
      });
    case 'CONVERSATION_NOT_FOUND':
      return t('conversationNotFound', { ns: 'errors', defaultValue: 'Conversation not found', ...p });
    case 'MESSAGE_NOT_FOUND':
      return t('messageNotFound', { ns: 'errors', defaultValue: 'Message not found', ...p });
    case 'MESSAGE_REQUEST_NOT_FOUND':
      return t('messageRequestNotFound', { ns: 'errors', defaultValue: 'Request not found', ...p });
    case 'MESSAGE_USER_NOT_FOUND':
      return t('messageUserNotFound', { ns: 'errors', defaultValue: 'User not found', ...p });
    case 'MESSAGE_NOT_ACCEPTING':
      return t('messageNotAccepting', { ns: 'errors', defaultValue: 'This user is not accepting messages.', ...p });
    case 'MESSAGE_FOLLOWS_ONLY':
      return t('messageFollowsOnly', {
        ns: 'errors',
        defaultValue: 'This user only accepts messages from people they follow.',
        ...p,
      });
    case 'MESSAGE_NO_LONGER_ALLOWED':
      return t('messageNoLongerAllowed', { ns: 'errors', defaultValue: 'You can no longer message this person', ...p });
    case 'MESSAGE_SELF':
      return t('messageSelf', { ns: 'errors', defaultValue: 'Cannot message yourself', ...p });
    case 'MESSAGE_TOO_FAST':
      return t('messageTooFast', {
        ns: 'errors',
        defaultValue: "You're sending messages too quickly. Please slow down.",
        ...p,
      });
    case 'MESSAGE_PAYLOAD_TOO_LARGE':
      return t('messagePayloadTooLarge', { ns: 'errors', defaultValue: 'Message payload too large', ...p });
    case 'MESSAGE_EMOJI_INVALID':
      return t('messageEmojiInvalid', { ns: 'errors', defaultValue: 'Invalid emoji', ...p });
    case 'MESSAGE_IMAGE_INVALID':
      return t('messageImageInvalid', { ns: 'errors', defaultValue: 'Invalid image reference', ...p });
    case 'MESSAGE_REQUEST_TEXT_ONLY':
      return t('messageRequestTextOnly', {
        ns: 'errors',
        defaultValue: 'A message request can only contain text.',
        ...p,
      });
    case 'MESSAGE_NO_LONGER_ACCEPTING':
      return t('messageNoLongerAccepting', {
        ns: 'errors',
        defaultValue: 'This user is no longer accepting messages.',
        ...p,
      });
    case 'MESSAGE_COULD_NOT_SEND':
      return t('messageCouldNotSend', { ns: 'errors', defaultValue: 'The message could not be sent', ...p });
    case 'VOICE_TOO_LARGE':
      return t('voiceTooLarge', { ns: 'errors', defaultValue: 'That recording is too large.', ...p });
    case 'VOICE_MISSING':
      return t('voiceMissing', { ns: 'errors', defaultValue: 'No recording provided', ...p });
    case 'VOICE_LENGTH_INVALID':
      return t('voiceLengthInvalid', { ns: 'errors', defaultValue: 'Invalid recording length', ...p });
    case 'AUDIO_FORMAT_UNSUPPORTED':
      return t('audioFormatUnsupported', { ns: 'errors', defaultValue: 'That audio format is not supported.', ...p });
    case 'ACCOUNT_SUSPENDED':
      return t('accountSuspended', { ns: 'errors', defaultValue: 'Your account is suspended', ...p });
    case 'SAVED_REPLY_LIMIT':
      return t('savedReplyLimit', { ns: 'errors', defaultValue: 'You can keep up to {{max}} saved replies', ...p });
    case 'SAVED_REPLY_NOT_FOUND':
      return t('savedReplyNotFound', { ns: 'errors', defaultValue: 'Saved reply not found', ...p });
    case 'FORWARD_NOTHING':
      return t('forwardNothing', { ns: 'errors', defaultValue: 'Nothing to forward', ...p });
    case 'FORWARD_KIND_BLOCKED':
      return t('forwardKindBlocked', { ns: 'errors', defaultValue: "This kind of message can't be forwarded", ...p });
    case 'FORWARD_ONE_CHAT_ONLY':
      return t('forwardOneChatOnly', {
        ns: 'errors',
        defaultValue: 'Messages forwarded many times can only go to one chat at a time',
        ...p,
      });
    case 'CHAT_NOT_FOUND':
      return t('chatNotFound', { ns: 'errors', defaultValue: 'Chat not found', ...p });
    case 'CHAT_FOLDER_NOT_FOUND':
      return t('chatFolderNotFound', { ns: 'errors', defaultValue: 'Folder not found', ...p });
    case 'CHAT_FOLDER_LIMIT':
      return t('chatFolderLimit', { ns: 'errors', defaultValue: 'You can have up to {{max}} folders', ...p });
    case 'CHAT_FOLDER_FULL':
      return t('chatFolderFull', { ns: 'errors', defaultValue: 'That folder is full', ...p });
    case 'CHAT_PIN_LIMIT':
      return t('chatPinLimit', { ns: 'errors', defaultValue: 'You can pin up to {{max}} messages', ...p });
    case 'CHAT_POLL_NOT_FOUND':
      return t('chatPollNotFound', { ns: 'errors', defaultValue: 'No such poll', ...p });
    case 'CHAT_POLL_OPTION_INVALID':
      return t('chatPollOptionInvalid', { ns: 'errors', defaultValue: 'Invalid option', ...p });
    case 'CHAT_THREAD_NOT_FOUND':
      return t('chatThreadNotFound', { ns: 'errors', defaultValue: 'Thread not found', ...p });
    case 'CHAT_CHECKLIST_NOT_FOUND':
      return t('chatChecklistNotFound', { ns: 'errors', defaultValue: 'Checklist not found', ...p });
    case 'TIP_SELF':
      return t('tipSelf', { ns: 'errors', defaultValue: "You can't tip yourself", ...p });
    case 'TIP_RECIPIENT_NOT_FOUND':
      return t('tipRecipientNotFound', { ns: 'errors', defaultValue: 'Recipient not found', ...p });
    case 'COINS_NOT_ENOUGH':
      return t('coinsNotEnough', { ns: 'errors', defaultValue: 'Not enough coins', ...p });
    case 'BUILD_NOT_FOUND':
      return t('buildNotFound', { ns: 'errors', defaultValue: 'Build not found', ...p });
    case 'BUILD_RELEASE_OWNER_ONLY':
      return t('buildReleaseOwnerOnly', {
        ns: 'errors',
        defaultValue: 'Only the build’s owner can publish a release',
        ...p,
      });
    case 'BUILD_RELEASE_DELETE_OWNER_ONLY':
      return t('buildReleaseDeleteOwnerOnly', {
        ns: 'errors',
        defaultValue: 'Only the build’s owner can delete a release',
        ...p,
      });
    case 'BUILD_VERSION_EXISTS':
      return t('buildVersionExists', { ns: 'errors', defaultValue: 'This build already has that version', ...p });
    case 'BUILD_RELEASE_NOT_FOUND':
      return t('buildReleaseNotFound', { ns: 'errors', defaultValue: 'Release not found', ...p });
    case 'BUILD_PICTURES_OWNER_ONLY':
      return t('buildPicturesOwnerOnly', {
        ns: 'errors',
        defaultValue: 'Only the build’s owner can add pictures',
        ...p,
      });
    case 'BUILD_SCREENSHOTS_OWNER_ONLY':
      return t('buildScreenshotsOwnerOnly', {
        ns: 'errors',
        defaultValue: 'Only the build’s owner can change screenshots',
        ...p,
      });
    case 'FILE_MISSING':
      return t('fileMissing', { ns: 'errors', defaultValue: 'No file provided', ...p });
    case 'STUDY_DECK_FULL':
      return t('studyDeckFull', { ns: 'errors', defaultValue: 'Deck is full', ...p });
    case 'STUDY_DECK_LIMIT':
      return t('studyDeckLimit', { ns: 'errors', defaultValue: 'Too many decks', ...p });
    case 'STUDY_DECK_NOT_FOUND':
      return t('studyDeckNotFound', { ns: 'errors', defaultValue: 'Deck not found', ...p });
    case 'STUDY_DECK_OWN':
      return t('studyDeckOwn', { ns: 'errors', defaultValue: 'You already own this deck', ...p });
    case 'STUDY_CARD_INVALID':
      return t('studyCardInvalid', { ns: 'errors', defaultValue: 'Invalid card', ...p });
    case 'STUDY_PICTURE_INVALID':
      return t('studyPictureInvalid', { ns: 'errors', defaultValue: 'Invalid picture', ...p });
    case 'STUDY_PICTURE_REUPLOAD':
      return t('studyPictureReupload', { ns: 'errors', defaultValue: 'Upload the picture again', ...p });
    case 'STUDY_PICTURE_ANIMATED':
      return t('studyPictureAnimated', {
        ns: 'errors',
        defaultValue: 'Use a still picture, not an animated one',
        ...p,
      });
    case 'STUDY_PICTURE_CARD_LIMIT':
      return t('studyPictureCardLimit', { ns: 'errors', defaultValue: 'Too many cards carry a picture', ...p });
    case 'STUDY_SOUND_INVALID':
      return t('studySoundInvalid', { ns: 'errors', defaultValue: 'Invalid sound', ...p });
    case 'STUDY_SOUND_REUPLOAD':
      return t('studySoundReupload', { ns: 'errors', defaultValue: 'Upload the sound again', ...p });
    case 'STUDY_SOUND_CARD_LIMIT':
      return t('studySoundCardLimit', { ns: 'errors', defaultValue: 'Too many cards carry a sound', ...p });
    case 'STUDY_SOUND_TOO_LARGE':
      return t('studySoundTooLarge', {
        ns: 'errors',
        defaultValue: 'That sound is too large. Keep it under 512 KB.',
        ...p,
      });
    case 'STUDY_SOUND_TOO_LONG':
      return t('studySoundTooLong', { ns: 'errors', defaultValue: 'A sound can be up to 15 seconds.', ...p });
    case 'STUDY_UPLOAD_LIMIT':
      return t('studyUploadLimit', { ns: 'errors', defaultValue: 'Daily upload limit reached.', ...p });
    case 'STUDY_IMPORT_INVALID':
      return t('studyImportInvalid', { ns: 'errors', defaultValue: 'Invalid import', ...p });
    case 'STUDY_FOLDER_LIMIT':
      return t('studyFolderLimit', { ns: 'errors', defaultValue: 'Too many folders', ...p });
    case 'STUDY_NAME_TAKEN':
      return t('studyNameTaken', { ns: 'errors', defaultValue: 'Name taken', ...p });
    case 'STUDY_NAME_INVALID':
      return t('studyNameInvalid', { ns: 'errors', defaultValue: 'Invalid name', ...p });
    case 'STUDY_TUTOR_OFFLINE':
      return t('studyTutorOffline', { ns: 'errors', defaultValue: 'AI tutor is not configured', ...p });
    case 'STUDY_TUTOR_SLOW':
      return t('studyTutorSlow', { ns: 'errors', defaultValue: 'Slow down a moment', ...p });
    case 'HANDLE_COOLDOWN':
      return t('handleCooldown', {
        ns: 'errors',
        defaultValue: 'You can only change your handle once every 30 days',
        ...p,
      });
    case 'HANDLE_TAKEN':
      return t('handleTaken', { ns: 'errors', defaultValue: 'This handle is already taken', ...p });
    case 'HANDLE_RECLAIM_BLOCKED':
      return t('handleReclaimBlocked', {
        ns: 'errors',
        defaultValue: 'That handle was released recently and is not available yet',
        ...p,
      });
    case 'HANDLE_UNCHANGED':
      return t('handleUnchanged', { ns: 'errors', defaultValue: 'That is already your handle', ...p });
    case 'ACCOUNT_NOT_FOUND':
      return t('accountNotFound', { ns: 'errors', defaultValue: 'Account not found', ...p });
    case 'FOLLOW_SELF':
      return t('followSelf', { ns: 'errors', defaultValue: 'Cannot follow yourself', ...p });
    case 'POST_NOT_FOUND':
      return t('postNotFound', { ns: 'errors', defaultValue: 'Post not found', ...p });
    case 'POST_LOCKED':
      return t('postLocked', { ns: 'errors', defaultValue: 'This post is locked', ...p });
    case 'POST_UNLOCK_TO_DRAFT':
      return t('postUnlockToDraft', { ns: 'errors', defaultValue: 'Unlock this post to draft a reply.', ...p });
    case 'POST_EMPTY':
      return t('postEmpty', { ns: 'errors', defaultValue: 'Post cannot be empty', ...p });
    case 'POST_QUOTED_NOT_FOUND':
      return t('postQuotedNotFound', { ns: 'errors', defaultValue: 'Quoted post not found', ...p });
    case 'POST_REPLY_LIMITED':
      return t('postReplyLimited', {
        ns: 'errors',
        defaultValue: 'The author limited who can reply to this post',
        ...p,
      });
    case 'POST_THREAD_TOO_SHORT':
      return t('postThreadTooShort', { ns: 'errors', defaultValue: 'A thread needs at least 2 posts', ...p });
    case 'POST_IMAGE_TOO_LARGE':
      return t('postImageTooLarge', { ns: 'errors', defaultValue: 'That image is too large.', ...p });
    case 'POST_IMAGE_MISSING':
      return t('postImageMissing', { ns: 'errors', defaultValue: 'No image provided', ...p });
    case 'AI_DRAFT_UNAVAILABLE':
      return t('aiDraftUnavailable', { ns: 'errors', defaultValue: 'AI drafting is not available right now.', ...p });
    case 'TOURNAMENT_NOT_FOUND':
      return t('tournamentNotFound', { ns: 'errors', defaultValue: 'Tournament not found', ...p });
    case 'TOURNAMENT_MATCH_NOT_FOUND':
      return t('tournamentMatchNotFound', { ns: 'errors', defaultValue: 'Match not found', ...p });
    case 'TOURNAMENT_NOT_YOUR_MATCH':
      return t('tournamentNotYourMatch', { ns: 'errors', defaultValue: 'Not your match', ...p });
    case 'TOURNAMENT_ONLY_PLAYERS':
      return t('tournamentOnlyPlayers', { ns: 'errors', defaultValue: 'Only the two players can do this', ...p });
    case 'TOURNAMENT_HOST_ONLY':
      return t('tournamentHostOnly', { ns: 'errors', defaultValue: 'Only the host can do this', ...p });
    case 'TOURNAMENT_NOT_LIVE':
      return t('tournamentNotLive', { ns: 'errors', defaultValue: 'Tournament is not live', ...p });
    case 'TOURNAMENT_MATCH_NOT_READY':
      return t('tournamentMatchNotReady', { ns: 'errors', defaultValue: 'Match is not ready', ...p });
    case 'TOURNAMENT_FULL':
      return t('tournamentFull', { ns: 'errors', defaultValue: 'Tournament is full', ...p });
    case 'TOURNAMENT_NO_CHECKIN':
      return t('tournamentNoCheckin', { ns: 'errors', defaultValue: 'This tournament has no check-in', ...p });
    case 'TOURNAMENT_RESULT_ANSWERED':
      return t('tournamentResultAnswered', { ns: 'errors', defaultValue: 'This result was already answered', ...p });
    case 'TOURNAMENT_RESULT_SETTLED':
      return t('tournamentResultSettled', { ns: 'errors', defaultValue: 'This result was already settled', ...p });
    case 'TOURNAMENT_RESULT_DISPUTED':
      return t('tournamentResultDisputed', {
        ns: 'errors',
        defaultValue: 'This result is disputed; the host decides it',
        ...p,
      });
    case 'TOURNAMENT_REGISTRATION_CLOSED':
      return t('tournamentRegistrationClosed', { ns: 'errors', defaultValue: 'Registration is closed', ...p });
    case 'TOURNAMENT_CHECKIN_CLOSED':
      return t('tournamentCheckinClosed', { ns: 'errors', defaultValue: 'Check-in is closed', ...p });
    case 'TOURNAMENT_CHECKIN_NOT_OPEN':
      return t('tournamentCheckinNotOpen', { ns: 'errors', defaultValue: 'Check-in has not opened yet', ...p });
    case 'TOURNAMENT_NOT_REGISTERED':
      return t('tournamentNotRegistered', { ns: 'errors', defaultValue: 'You are not registered', ...p });
    case 'TOURNAMENT_ALREADY_REGISTERED':
      return t('tournamentAlreadyRegistered', { ns: 'errors', defaultValue: 'Already registered', ...p });
    case 'TOURNAMENT_SEEDING_LOCKED':
      return t('tournamentSeedingLocked', {
        ns: 'errors',
        defaultValue: 'Seeding is locked once the tournament starts',
        ...p,
      });
    case 'TOURNAMENT_WITHDRAW_AFTER_START':
      return t('tournamentWithdrawAfterStart', { ns: 'errors', defaultValue: 'Cannot withdraw after start', ...p });
    case 'TOURNAMENT_ALREADY_STARTED':
      return t('tournamentAlreadyStarted', { ns: 'errors', defaultValue: 'Already started', ...p });
    case 'TOURNAMENT_TOO_FEW':
      return t('tournamentTooFew', { ns: 'errors', defaultValue: 'Not enough players to start', ...p });
    case 'TOURNAMENT_ENTRY_FEE_COINS':
      return t('tournamentEntryFeeCoins', { ns: 'errors', defaultValue: 'Not enough coins for the entry fee', ...p });
    case 'TOURNAMENT_OVER':
      return t('tournamentOver', { ns: 'errors', defaultValue: 'This tournament is over', ...p });
    case 'TOURNAMENT_ACCOUNT_RESTRICTED':
      return t('tournamentAccountRestricted', { ns: 'errors', defaultValue: 'Your account is restricted', ...p });
    case 'TOURNAMENT_NO_RESULT_TO_CONFIRM':
      return t('tournamentNoResultToConfirm', { ns: 'errors', defaultValue: 'There is no result to confirm', ...p });
    case 'TOURNAMENT_NO_RESULT_TO_DISPUTE':
      return t('tournamentNoResultToDispute', { ns: 'errors', defaultValue: 'There is no result to dispute', ...p });
    case 'TOURNAMENT_NO_RESULT_TO_WITHDRAW':
      return t('tournamentNoResultToWithdraw', { ns: 'errors', defaultValue: 'There is no result to withdraw', ...p });
    case 'TOURNAMENT_OWN_REPORT_CONFIRM':
      return t('tournamentOwnReportConfirm', {
        ns: 'errors',
        defaultValue: 'You cannot confirm your own report',
        ...p,
      });
    case 'TOURNAMENT_OWN_REPORT_DISPUTE':
      return t('tournamentOwnReportDispute', {
        ns: 'errors',
        defaultValue: 'You cannot dispute your own report',
        ...p,
      });
    case 'TOURNAMENT_PROPOSAL_EXPIRED':
      return t('tournamentProposalExpired', { ns: 'errors', defaultValue: 'The proposed time has passed', ...p });
    case 'TOURNAMENT_PROPOSAL_CHANGED':
      return t('tournamentProposalChanged', { ns: 'errors', defaultValue: 'The proposal changed', ...p });
    case 'TOURNAMENT_BAD_WINNER':
      return t('tournamentBadWinner', { ns: 'errors', defaultValue: 'Winner must be in this match', ...p });
    case 'EVENT_NOT_FOUND':
      return t('eventNotFound', { ns: 'errors', defaultValue: 'Not found', ...p });
    case 'MEDSCHOOLS_SHARING_UNAVAILABLE':
      return t('medschoolsSharingUnavailable', {
        ns: 'errors',
        defaultValue: 'Sharing is not available right now',
        ...p,
      });
    case 'MEDSCHOOLS_ACCOUNT_TOO_NEW':
      return t('medschoolsAccountTooNew', {
        ns: 'errors',
        defaultValue: 'Sharing needs an account at least {{days}} days old',
        ...p,
      });
    case 'MEDSCHOOLS_DUPLICATE':
      return t('medschoolsDuplicate', { ns: 'errors', defaultValue: 'That school is already in this cycle', ...p });
    case 'MEDSCHOOLS_CAP':
      return t('medschoolsCap', {
        ns: 'errors',
        defaultValue: 'You can track up to {{max}} schools in one cycle',
        ...p,
      });
    case 'MEDSCHOOLS_LIST_CAP':
      return t('medschoolsListCap', { ns: 'errors', defaultValue: 'You can keep up to {{max}} lists', ...p });
    case 'MEDSCHOOLS_ITEM_CAP':
      return t('medschoolsItemCap', { ns: 'errors', defaultValue: 'A list holds up to {{max}} schools', ...p });
    case 'MEDSCHOOLS_LIST_DUPLICATE':
      return t('medschoolsListDuplicate', { ns: 'errors', defaultValue: 'That school is already on this list', ...p });
    case 'MEDSCHOOLS_STALE_ORDER':
      return t('medschoolsStaleOrder', {
        ns: 'errors',
        defaultValue: 'Your lists changed in another tab. Reload to see them',
        ...p,
      });
    case 'MEDSCHOOLS_QA_DAILY_CAP':
      return t('medschoolsQaDailyCap', {
        ns: 'errors',
        defaultValue: "You have used today's questions. Try again tomorrow",
        ...p,
      });
    case 'MEDSCHOOLS_QA_BUSY':
      return t('medschoolsQaBusy', {
        ns: 'errors',
        defaultValue: 'Your last question is still being answered. Try again in a minute',
        ...p,
      });
    case 'MEDSCHOOLS_QA_PAUSED':
      return t('medschoolsQaPaused', { ns: 'errors', defaultValue: 'Questions are paused right now', ...p });
    case 'MEDSCHOOLS_QA_LIMIT_PENDING':
      return t('medschoolsQaLimitPending', {
        ns: 'errors',
        defaultValue: 'You already have a request waiting for review',
        ...p,
      });
    case 'MEDSCHOOLS_QA_LIMIT_WAIT':
      return t('medschoolsQaLimitWait', {
        ns: 'errors',
        defaultValue: 'A recent request was declined. You can ask again after the date shown on the page',
        ...p,
      });
    case 'MEDSCHOOLS_QA_LIMIT_NOT_NEEDED':
      return t('medschoolsQaLimitNotNeeded', {
        ns: 'errors',
        defaultValue: 'Your account already has a higher limit than a request can give',
        ...p,
      });
    case 'MEDSCHOOLS_IMPORT_UNSUPPORTED':
      return t('medschoolsImportUnsupported', {
        ns: 'errors',
        defaultValue:
          'That file could not be read. Use a spreadsheet (.xlsx or .csv), a Word document (.docx), a PDF or a text file',
        ...p,
      });
    case 'MEDSCHOOLS_IMPORT_TOO_LARGE':
      return t('medschoolsImportTooLarge', {
        ns: 'errors',
        defaultValue: 'That file is over 2 MB. Export just the sheet with your dates and try again',
        ...p,
      });
    case 'MEDSCHOOLS_IMPORT_EMPTY':
      return t('medschoolsImportEmpty', {
        ns: 'errors',
        defaultValue: 'No application dates were found in that file',
        ...p,
      });

    // Sprint 11
    // s11-03 character-party
    case 'PARTY_FULL':
      return t('partyFull', { ns: 'errors', defaultValue: 'This party is full', ...p });
    case 'PARTY_LIMIT':
      return t('partyLimit', { ns: 'errors', defaultValue: 'You have reached the limit for parties', ...p });
    case 'PARTY_SYSTEM_MISMATCH':
      return t('partySystemMismatch', {
        ns: 'errors',
        defaultValue: 'That character is for a different game than this party',
        ...p,
      });
    case 'PARTY_JOIN_REFUSED':
      return t('partyJoinRefused', { ns: 'errors', defaultValue: 'You cannot join this party', ...p });
    case 'PARTY_ALREADY_MEMBER':
      return t('partyAlreadyMember', { ns: 'errors', defaultValue: 'You are already in this party', ...p });
    case 'PARTY_ORDER_CHANGED':
      return t('partyOrderChanged', {
        ns: 'errors',
        defaultValue: 'The turn order changed. Reload it and try again',
        ...p,
      });
    // s11-05 lights-out-maker
    case 'LIGHTS_OUT_BOARD_LIMIT':
      return t('lightsOutBoardLimit', {
        ns: 'errors',
        defaultValue: 'You have reached the limit for new boards',
        ...p,
      });
    case 'LIGHTS_OUT_BOARD_UNPLAYABLE':
      return t('lightsOutBoardUnplayable', {
        ns: 'errors',
        defaultValue: 'A board must be solvable in at least three moves',
        ...p,
      });
    // s11-06 daily-following
    // s11-07 studio-share
    case 'STUDIO_SHARE_LIMIT':
      return t('studioShareLimit', {
        ns: 'errors',
        defaultValue: 'You can have {{max}} shared links at a time. Stop sharing one to make another.',
        ...p,
      });
    // s11-09 read-alongs
    case 'READ_ALONG_CAP':
      return t('readAlongCap', { ns: 'errors', defaultValue: 'A community can have {{max}} active read-alongs', ...p });
    case 'READ_ALONG_FULL':
      return t('readAlongFull', {
        ns: 'errors',
        defaultValue: 'This read-along has {{max}} readers and is full',
        ...p,
      });
    case 'READ_ALONG_STARTED':
      return t('readAlongStarted', {
        ns: 'errors',
        defaultValue: 'The first part has opened, so the parts can no longer be changed',
        ...p,
      });
    case 'READ_ALONG_ENDED':
      return t('readAlongEnded', { ns: 'errors', defaultValue: 'This read-along has ended', ...p });
    // s11-10 deck-coeditors
    case 'DECK_EDITOR_ALREADY':
      return t('deckEditorAlready', { ns: 'errors', defaultValue: 'This member is already invited', ...p });
    case 'DECK_EDITOR_COPY':
      return t('deckEditorCopy', {
        ns: 'errors',
        defaultValue: "A copy of another member's deck can't have editors",
        ...p,
      });
    case 'DECK_EDITOR_FULL':
      return t('deckEditorFull', { ns: 'errors', defaultValue: 'A deck can have at most {{max}} editors', ...p });
    case 'DECK_EDITOR_INVITES_FULL':
      return t('deckEditorInvitesFull', {
        ns: 'errors',
        defaultValue: 'You can have at most {{max}} invitations waiting',
        ...p,
      });
    case 'DECK_EDITOR_UNAVAILABLE':
      return t('deckEditorUnavailable', { ns: 'errors', defaultValue: "This member can't be invited", ...p });
    // s11-12 type-challenges
    case 'TYPE_CHALLENGE_RACED':
      return t('typeChallengeRaced', { ns: 'errors', defaultValue: 'This race has already been run', ...p });
    case 'TYPE_CHALLENGE_UNAVAILABLE':
      return t('typeChallengeUnavailable', { ns: 'errors', defaultValue: "This member can't be challenged", ...p });
    case 'TYPE_CHALLENGE_PASSAGE':
      return t('typeChallengePassage', {
        ns: 'errors',
        defaultValue: "That passage can't be sent as a challenge",
        ...p,
      });
    case 'TYPE_CHALLENGE_NO_RUN':
      return t('typeChallengeNoRun', { ns: 'errors', defaultValue: 'Set a best run on that passage first', ...p });
    case 'TYPE_CHALLENGE_FULL':
      return t('typeChallengeFull', {
        ns: 'errors',
        defaultValue: 'You can have at most {{max}} challenges waiting',
        ...p,
      });
    case 'TYPE_CHALLENGE_PAIR_FULL':
      return t('typeChallengePairFull', {
        ns: 'errors',
        defaultValue: 'You already have {{max}} challenges waiting for this member',
        ...p,
      });
    // s11-13 listing-prices
    // s11-14 listing-photo-alt
    case 'LISTING_PHOTO_ALT_TOO_LONG':
      return t('listingPhotoAltTooLong', {
        ns: 'errors',
        defaultValue: 'A photo description can have at most {{max}} characters',
        ...p,
      });
    // s11-16 rmhtube-subtitles
    // s11-17 card-listen
    // s11-18 sweep-references
    case 'LISTING_PHOTO_NOT_SITE':
      return t('listingPhotoNotSite', {
        ns: 'errors',
        defaultValue: 'Use photos uploaded to this listing',
        ...p,
      });
    case 'MEDSCHOOLS_LIST_IMPORT_EMPTY':
      return t('medschoolsListImportEmpty', {
        ns: 'errors',
        defaultValue: 'No medical schools were found in that file',
        ...p,
      });
    case 'MEDSCHOOLS_LIST_IMPORT_UNSUPPORTED':
      return t('medschoolsListImportUnsupported', {
        ns: 'errors',
        defaultValue:
          'That file could not be read. Use a spreadsheet (.xlsx or .csv), a Word document (.docx), a PDF or a text file with your school names',
        ...p,
      });
    case 'MEDSCHOOLS_LIST_IMPORT_TOO_LARGE':
      return t('medschoolsListImportTooLarge', {
        ns: 'errors',
        defaultValue: 'That file is over 2 MB. Save just the school names in a smaller file, or paste them',
        ...p,
      });
    case 'MEDSCHOOLS_LIST_IMPORT_UNREADABLE':
      return t('medschoolsListImportUnreadable', {
        ns: 'errors',
        defaultValue: 'The school names could not be read this time. Try again, or paste a shorter list',
        ...p,
      });
  }
}

/**
 * The refusal's own sentence, or `undefined` when it carries no taxonomy code: the code's text from the `errors`
 * namespace, with its params. Pure (the hook supplies `t` and the date formatter), so the product suite can run it
 * with a fake `t`.
 */
export function codedSentence(
  t: Translate,
  formatDateTime: (date: Date) => string,
  error: unknown,
): string | undefined {
  const found = readRefusal(error);
  if (!found) return undefined;
  const params = { ...found.params };
  // An ISO date reads in the reader's locale and zone, not the server's UTC.
  if (typeof params.endsAt === 'string') params.endsAt = formatDateTime(new Date(params.endsAt));
  return sentence(t, found.code, params);
}
