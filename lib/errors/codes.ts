/**
 * The site's error taxonomy — one code per failure mode, shared by every layer.
 *
 * Before this, an error had three spellings and no machine-readable identity:
 * the site envelope (`{ error: 'Insufficient coins' }` from
 * `lib/api/handler.server.ts`), the developer-API envelope
 * (`{ error: { type, code, message, request_id } }` from `lib/api/errors.ts`),
 * and whatever a socket handler emitted. Client code therefore branched on
 * English *strings*, which meant two things at once: a copy edit could break a
 * client behaviour, and error messages could never be translated — every user
 * on all 16 locales read English failures.
 *
 * A code fixes both. The server sends a stable symbol; the client renders
 * `t(ERROR_CODES[code].i18n)`. The English text here is the fallback used when
 * the `errors` namespace has not loaded yet (or on a server-rendered error
 * page), never the primary source.
 *
 * Client-safe on purpose — this module is imported by components. Keep it free
 * of Prisma, `node:*` and any `.server` import.
 */

/** Every failure the site names. Add here before throwing anything new. */
export const ERROR_CODES = {
  // --- auth / access -------------------------------------------------------
  UNAUTHORIZED: {
    http: 401,
    i18n: 'errors:unauthorized',
    text: 'Sign in to continue',
  },
  FORBIDDEN: {
    http: 403,
    i18n: 'errors:forbidden',
    text: "You don't have access to this",
  },
  UPGRADE_REQUIRED: {
    http: 402,
    i18n: 'errors:upgradeRequired',
    text: 'This feature needs a membership',
  },

  // --- input ---------------------------------------------------------------
  INVALID_INPUT: {
    http: 400,
    i18n: 'errors:invalidInput',
    text: 'Check the form and try again',
  },
  NOT_FOUND: {
    http: 404,
    i18n: 'errors:notFound',
    text: "That doesn't exist (or was removed)",
  },
  CONFLICT: {
    http: 409,
    i18n: 'errors:conflict',
    text: 'Someone else changed this first',
  },
  GONE: {
    http: 410,
    i18n: 'errors:gone',
    text: 'That has expired',
  },

  // --- limits --------------------------------------------------------------
  RATE_LIMITED: {
    http: 429,
    i18n: 'errors:rateLimited',
    text: 'Slow down for a moment',
  },
  QUOTA_EXCEEDED: {
    http: 413,
    i18n: 'errors:quotaExceeded',
    text: "You're out of storage",
  },
  QUERY_BUDGET_EXCEEDED: {
    http: 500,
    i18n: 'errors:queryBudget',
    text: 'That request was too expensive to serve',
  },

  // --- economy -------------------------------------------------------------
  INSUFFICIENT_COINS: {
    http: 402,
    i18n: 'errors:insufficientCoins',
    text: "You don't have enough coins",
  },
  STAKE_LIMIT_REACHED: {
    http: 403,
    i18n: 'errors:stakeLimit',
    text: "You've reached the limit you set",
  },
  /// Responsible play (W8). Both are the member's own earlier decision being
  /// honoured, not a moderation action, and the copy has to read that way.
  SELF_EXCLUDED: {
    http: 403,
    i18n: 'errors:selfExcluded',
    text: "You've excluded yourself from staking coins",
  },
  COOL_OFF_ACTIVE: {
    http: 403,
    i18n: 'errors:coolOff',
    text: "You're taking a break from staking coins",
  },
  /// Monthly spending budget (s04-07). The detail carries `remaining`, which
  /// the catalog string interpolates; `text` is the fallback without it.
  SPEND_BUDGET_REACHED: {
    http: 403,
    i18n: 'spending-budget:overBudget',
    text: 'This would go over your monthly budget',
  },

  // --- AI ------------------------------------------------------------------
  AI_UNAVAILABLE: {
    http: 503,
    i18n: 'errors:aiUnavailable',
    text: 'AI features are offline',
  },
  AI_BUDGET_EXCEEDED: {
    http: 402,
    i18n: 'errors:aiBudget',
    text: "You've used this month's AI allowance",
  },

  // --- dependencies --------------------------------------------------------
  STORAGE_UNAVAILABLE: {
    http: 503,
    i18n: 'errors:storageUnavailable',
    text: 'Uploads are temporarily unavailable',
  },
  INTERNAL: {
    http: 500,
    i18n: 'errors:internal',
    text: 'Something went wrong on our side',
  },

  // --- events and RSVPs (s10-20) ---------------------------------------------------
  EVENT_FULL: {
    http: 409,
    i18n: 'errors:eventFull',
    text: 'This event is full',
  },
  WAITLIST_CLOSED: {
    http: 409,
    i18n: 'errors:waitlistClosed',
    text: 'The waitlist is closed',
  },
  WAITLIST_FULL: {
    http: 409,
    i18n: 'errors:waitlistFull',
    text: 'The waitlist is full',
  },
  EVENT_CANCELED: {
    http: 409,
    i18n: 'errors:eventCanceled',
    text: 'This event was canceled',
  },
  EVENT_DATE_SKIPPED: {
    http: 409,
    i18n: 'errors:eventDateSkipped',
    text: 'This date was skipped',
  },
  RSVP_FAILED: {
    http: 400,
    i18n: 'errors:rsvpFailed',
    text: 'Could not update RSVP',
  },
  EVENT_DATES_HOST_ONLY: {
    http: 403,
    i18n: 'errors:eventDatesHostOnly',
    text: 'Only the host or a co-host can change dates',
  },
  EVENT_DATE_LOCKED: {
    http: 409,
    i18n: 'errors:eventDateLocked',
    text: 'That date cannot be changed',
  },
  EVENT_UPDATE_FAILED: {
    http: 400,
    i18n: 'errors:eventUpdateFailed',
    text: 'That update could not be posted',
  },

  // --- communities ---------------------------------------------------
  COMMUNITY_POST_JOIN_REQUIRED: {
    http: 403,
    i18n: 'errors:communityPostJoinRequired',
    text: 'Join the community to post in it',
  },
  COMMUNITY_JOIN_REQUIRED: {
    http: 403,
    i18n: 'errors:communityJoinRequired',
    text: 'Join the community first',
  },
  COMMUNITY_FLAIR_REQUIRED: {
    http: 400,
    i18n: 'errors:communityFlairRequired',
    text: 'Choose a flair for your post — this community requires one.',
  },
  COMMUNITY_MODS_ONLY: {
    http: 403,
    i18n: 'errors:communityModsOnly',
    text: 'Only community mods can do that',
  },
  COMMUNITY_SANCTION_SELF: {
    http: 400,
    i18n: 'errors:communitySanctionSelf',
    text: "You can't sanction yourself",
  },
  COMMUNITY_OWNER_PROTECTED: {
    http: 400,
    i18n: 'errors:communityOwnerProtected',
    text: "The owner can't be banned or timed out",
  },
  COMMUNITY_MOD_SANCTION_OWNER_ONLY: {
    http: 403,
    i18n: 'errors:communityModSanctionOwnerOnly',
    text: 'Only the owner can sanction a mod',
  },
  COMMUNITY_NOT_A_MEMBER: {
    http: 404,
    i18n: 'errors:communityNotAMember',
    text: 'Not a member',
  },
  COMMUNITY_MEMBER_NOT_FOUND: {
    http: 404,
    i18n: 'errors:communityMemberNotFound',
    text: 'Member not found',
  },
  COMMUNITY_RULE_NOT_FOUND: {
    http: 400,
    i18n: 'errors:communityRuleNotFound',
    text: 'Rule not found',
  },
  COMMUNITY_ALREADY_MEMBER: {
    http: 409,
    i18n: 'errors:communityAlreadyMember',
    text: 'You are already a member',
  },
  COMMUNITY_IS_OPEN: {
    http: 400,
    i18n: 'errors:communityIsOpen',
    text: 'This community is open: just join it',
  },
  COMMUNITY_CREATOR_CANNOT_LEAVE: {
    http: 400,
    i18n: 'errors:communityCreatorCannotLeave',
    text: 'The creator cannot leave the community',
  },
  COMMUNITY_INVITE_INVALID: {
    http: 404,
    i18n: 'errors:communityInviteInvalid',
    text: "This invite isn't valid",
  },
  COMMUNITY_INVITES_PRIVATE_ONLY: {
    http: 400,
    i18n: 'errors:communityInvitesPrivateOnly',
    text: 'Only private communities have invite links',
  },
  COMMUNITY_INVITE_LIMIT: {
    http: 409,
    i18n: 'errors:communityInviteLimit',
    text: 'A community can have at most {{max}} live invite links',
  },
  COMMUNITY_ANNOUNCE_MODS_ONLY: {
    http: 403,
    i18n: 'errors:communityAnnounceModsOnly',
    text: 'Only mods can post announcements',
  },
  COMMUNITY_OWNER_ROLE_LOCKED: {
    http: 400,
    i18n: 'errors:communityOwnerRoleLocked',
    text: "The owner's role can't be changed",
  },
  COMMUNITY_ADMIN_ROLE_LOCKED: {
    http: 400,
    i18n: 'errors:communityAdminRoleLocked',
    text: "Can't change an admin",
  },
  COMMUNITY_OWNER_NOT_REMOVABLE: {
    http: 400,
    i18n: 'errors:communityOwnerNotRemovable',
    text: "The owner can't be removed",
  },
  COMMUNITY_MOD_REMOVE_OWNER_ONLY: {
    http: 403,
    i18n: 'errors:communityModRemoveOwnerOnly',
    text: 'Only the owner can remove a mod',
  },
  COMMUNITY_NOT_ALLOWED: {
    http: 403,
    i18n: 'errors:communityNotAllowed',
    text: 'Not allowed',
  },
  COMMUNITY_MACRO_LIMIT: {
    http: 409,
    i18n: 'errors:communityMacroLimit',
    text: 'Macro limit reached',
  },
  COMMUNITY_BANNED: {
    http: 403,
    i18n: 'community-bans:refusal-ban-open',
    text: 'You are banned from this community until a moderator lifts it.',
    withDate: { i18n: 'community-bans:refusal-ban-until', text: 'You are banned from this community until {{date}}.' },
  },
  COMMUNITY_TIMED_OUT: {
    http: 403,
    i18n: 'community-bans:refusal-timeout-open',
    text: 'You are timed out of this community. You can read but not post.',
    withDate: {
      i18n: 'community-bans:refusal-timeout-until',
      text: 'You are timed out of this community until {{date}}. You can read but not post.',
    },
  },

  // --- group chats ---------------------------------------------------
  GROUP_OWNER_ONLY: {
    http: 403,
    i18n: 'errors:groupOwnerOnly',
    text: 'Only the owner can do that',
  },
  GROUP_NOT_ALLOWED: {
    http: 403,
    i18n: 'errors:groupNotAllowed',
    text: "You can't do that",
  },
  GROUP_OWNER_ABOVE_ADMINS: {
    http: 400,
    i18n: 'errors:groupOwnerAboveAdmins',
    text: 'The owner is already above admins',
  },
  GROUP_ADMIN_LIMIT: {
    http: 409,
    i18n: 'errors:groupAdminLimit',
    text: 'A group can have {{max}} admins',
  },
  GROUP_USE_LEAVE: {
    http: 400,
    i18n: 'errors:groupUseLeave',
    text: 'Use leave instead',
  },
  GROUP_ALREADY_OWNER: {
    http: 400,
    i18n: 'errors:groupAlreadyOwner',
    text: 'You already own this group',
  },
  GROUP_INVITE_UNUSABLE: {
    http: 410,
    i18n: 'errors:groupInviteUnusable',
    text: "This invite can't be used",
  },
  GROUP_TOO_MANY: {
    http: 400,
    i18n: 'errors:groupTooMany',
    text: 'You are in too many groups',
  },
  GROUP_NEEDS_MEMBER: {
    http: 400,
    i18n: 'errors:groupNeedsMember',
    text: 'Add at least one other member',
  },
  GROUP_INVITE_LIMIT: {
    http: 409,
    i18n: 'errors:groupInviteLimit',
    text: 'A group can have {{max}} invite links at a time',
  },
  GROUP_NOT_A_MEMBER: {
    http: 404,
    i18n: 'errors:groupNotAMember',
    text: 'Not a member',
  },
  GROUP_ONE_TO_ONE_ONLY: {
    http: 400,
    i18n: 'errors:groupOneToOneOnly',
    text: 'Receipts and typing indicators only apply to one-to-one chats',
  },

  // --- messages ---------------------------------------------------
  CONVERSATION_NOT_FOUND: {
    http: 404,
    i18n: 'errors:conversationNotFound',
    text: 'Conversation not found',
  },
  MESSAGE_NOT_FOUND: {
    http: 404,
    i18n: 'errors:messageNotFound',
    text: 'Message not found',
  },
  MESSAGE_REQUEST_NOT_FOUND: {
    http: 404,
    i18n: 'errors:messageRequestNotFound',
    text: 'Request not found',
  },
  MESSAGE_USER_NOT_FOUND: {
    http: 404,
    i18n: 'errors:messageUserNotFound',
    text: 'User not found',
  },
  MESSAGE_NOT_ACCEPTING: {
    http: 403,
    i18n: 'errors:messageNotAccepting',
    text: 'This user is not accepting messages.',
  },
  MESSAGE_FOLLOWS_ONLY: {
    http: 403,
    i18n: 'errors:messageFollowsOnly',
    text: 'This user only accepts messages from people they follow.',
  },
  MESSAGE_NO_LONGER_ALLOWED: {
    http: 403,
    i18n: 'errors:messageNoLongerAllowed',
    text: 'You can no longer message this person',
  },
  MESSAGE_SELF: {
    http: 400,
    i18n: 'errors:messageSelf',
    text: 'Cannot message yourself',
  },
  MESSAGE_TOO_FAST: {
    http: 429,
    i18n: 'errors:messageTooFast',
    text: "You're sending messages too quickly. Please slow down.",
  },
  MESSAGE_PAYLOAD_TOO_LARGE: {
    http: 413,
    i18n: 'errors:messagePayloadTooLarge',
    text: 'Message payload too large',
  },
  MESSAGE_EMOJI_INVALID: {
    http: 400,
    i18n: 'errors:messageEmojiInvalid',
    text: 'Invalid emoji',
  },
  MESSAGE_IMAGE_INVALID: {
    http: 400,
    i18n: 'errors:messageImageInvalid',
    text: 'Invalid image reference',
  },
  MESSAGE_REQUEST_TEXT_ONLY: {
    http: 403,
    i18n: 'errors:messageRequestTextOnly',
    text: 'A message request can only contain text.',
  },
  MESSAGE_NO_LONGER_ACCEPTING: {
    http: 403,
    i18n: 'errors:messageNoLongerAccepting',
    text: 'This user is no longer accepting messages.',
  },
  MESSAGE_COULD_NOT_SEND: {
    http: 500,
    i18n: 'errors:messageCouldNotSend',
    text: 'The message could not be sent',
  },
  VOICE_TOO_LARGE: {
    http: 413,
    i18n: 'errors:voiceTooLarge',
    text: 'That recording is too large.',
  },
  VOICE_MISSING: {
    http: 400,
    i18n: 'errors:voiceMissing',
    text: 'No recording provided',
  },
  VOICE_LENGTH_INVALID: {
    http: 400,
    i18n: 'errors:voiceLengthInvalid',
    text: 'Invalid recording length',
  },
  AUDIO_FORMAT_UNSUPPORTED: {
    http: 400,
    i18n: 'errors:audioFormatUnsupported',
    text: 'That audio format is not supported.',
  },
  ACCOUNT_SUSPENDED: {
    http: 403,
    i18n: 'errors:accountSuspended',
    text: 'Your account is suspended',
  },
  SAVED_REPLY_LIMIT: {
    http: 409,
    i18n: 'errors:savedReplyLimit',
    text: 'You can keep up to {{max}} saved replies',
  },
  SAVED_REPLY_NOT_FOUND: {
    http: 404,
    i18n: 'errors:savedReplyNotFound',
    text: 'Saved reply not found',
  },
  FORWARD_NOTHING: {
    http: 400,
    i18n: 'errors:forwardNothing',
    text: 'Nothing to forward',
  },
  FORWARD_KIND_BLOCKED: {
    http: 400,
    i18n: 'errors:forwardKindBlocked',
    text: "This kind of message can't be forwarded",
  },
  FORWARD_ONE_CHAT_ONLY: {
    http: 400,
    i18n: 'errors:forwardOneChatOnly',
    text: 'Messages forwarded many times can only go to one chat at a time',
  },
  CHAT_NOT_FOUND: {
    http: 404,
    i18n: 'errors:chatNotFound',
    text: 'Chat not found',
  },
  CHAT_FOLDER_NOT_FOUND: {
    http: 404,
    i18n: 'errors:chatFolderNotFound',
    text: 'Folder not found',
  },
  CHAT_FOLDER_LIMIT: {
    http: 409,
    i18n: 'errors:chatFolderLimit',
    text: 'You can have up to {{max}} folders',
  },
  CHAT_FOLDER_FULL: {
    http: 409,
    i18n: 'errors:chatFolderFull',
    text: 'That folder is full',
  },
  CHAT_PIN_LIMIT: {
    http: 409,
    i18n: 'errors:chatPinLimit',
    text: 'You can pin up to {{max}} messages',
  },
  CHAT_POLL_NOT_FOUND: {
    http: 404,
    i18n: 'errors:chatPollNotFound',
    text: 'No such poll',
  },
  CHAT_POLL_OPTION_INVALID: {
    http: 400,
    i18n: 'errors:chatPollOptionInvalid',
    text: 'Invalid option',
  },
  CHAT_THREAD_NOT_FOUND: {
    http: 404,
    i18n: 'errors:chatThreadNotFound',
    text: 'Thread not found',
  },
  CHAT_CHECKLIST_NOT_FOUND: {
    http: 404,
    i18n: 'errors:chatChecklistNotFound',
    text: 'Checklist not found',
  },
  TIP_SELF: {
    http: 400,
    i18n: 'errors:tipSelf',
    text: "You can't tip yourself",
  },
  TIP_RECIPIENT_NOT_FOUND: {
    http: 404,
    i18n: 'errors:tipRecipientNotFound',
    text: 'Recipient not found',
  },
  COINS_NOT_ENOUGH: {
    http: 400,
    i18n: 'errors:coinsNotEnough',
    text: 'Not enough coins',
  },

  // --- builds ---------------------------------------------------
  BUILD_NOT_FOUND: {
    http: 404,
    i18n: 'errors:buildNotFound',
    text: 'Build not found',
  },
  BUILD_RELEASE_OWNER_ONLY: {
    http: 403,
    i18n: 'errors:buildReleaseOwnerOnly',
    text: 'Only the build’s owner can publish a release',
  },
  BUILD_RELEASE_DELETE_OWNER_ONLY: {
    http: 403,
    i18n: 'errors:buildReleaseDeleteOwnerOnly',
    text: 'Only the build’s owner can delete a release',
  },
  BUILD_VERSION_EXISTS: {
    http: 409,
    i18n: 'errors:buildVersionExists',
    text: 'This build already has that version',
  },
  BUILD_RELEASE_NOT_FOUND: {
    http: 404,
    i18n: 'errors:buildReleaseNotFound',
    text: 'Release not found',
  },
  BUILD_PICTURES_OWNER_ONLY: {
    http: 403,
    i18n: 'errors:buildPicturesOwnerOnly',
    text: 'Only the build’s owner can add pictures',
  },
  BUILD_SCREENSHOTS_OWNER_ONLY: {
    http: 403,
    i18n: 'errors:buildScreenshotsOwnerOnly',
    text: 'Only the build’s owner can change screenshots',
  },
  FILE_MISSING: {
    http: 400,
    i18n: 'errors:fileMissing',
    text: 'No file provided',
  },

  // --- study ---------------------------------------------------
  STUDY_DECK_FULL: {
    http: 400,
    i18n: 'errors:studyDeckFull',
    text: 'Deck is full',
  },
  STUDY_DECK_LIMIT: {
    http: 400,
    i18n: 'errors:studyDeckLimit',
    text: 'Too many decks',
  },
  STUDY_DECK_NOT_FOUND: {
    http: 404,
    i18n: 'errors:studyDeckNotFound',
    text: 'Deck not found',
  },
  STUDY_DECK_OWN: {
    http: 400,
    i18n: 'errors:studyDeckOwn',
    text: 'You already own this deck',
  },
  STUDY_CARD_INVALID: {
    http: 400,
    i18n: 'errors:studyCardInvalid',
    text: 'Invalid card',
  },
  STUDY_PICTURE_INVALID: {
    http: 400,
    i18n: 'errors:studyPictureInvalid',
    text: 'Invalid picture',
  },
  STUDY_PICTURE_REUPLOAD: {
    http: 400,
    i18n: 'errors:studyPictureReupload',
    text: 'Upload the picture again',
  },
  STUDY_PICTURE_ANIMATED: {
    http: 400,
    i18n: 'errors:studyPictureAnimated',
    text: 'Use a still picture, not an animated one',
  },
  STUDY_PICTURE_CARD_LIMIT: {
    http: 409,
    i18n: 'errors:studyPictureCardLimit',
    text: 'Too many cards carry a picture',
  },
  STUDY_SOUND_INVALID: {
    http: 400,
    i18n: 'errors:studySoundInvalid',
    text: 'Invalid sound',
  },
  STUDY_SOUND_REUPLOAD: {
    http: 400,
    i18n: 'errors:studySoundReupload',
    text: 'Upload the sound again',
  },
  STUDY_SOUND_CARD_LIMIT: {
    http: 409,
    i18n: 'errors:studySoundCardLimit',
    text: 'Too many cards carry a sound',
  },
  STUDY_SOUND_TOO_LARGE: {
    http: 413,
    i18n: 'errors:studySoundTooLarge',
    text: 'That sound is too large. Keep it under 512 KB.',
  },
  STUDY_SOUND_TOO_LONG: {
    http: 400,
    i18n: 'errors:studySoundTooLong',
    text: 'A sound can be up to 15 seconds.',
  },
  STUDY_UPLOAD_LIMIT: {
    http: 429,
    i18n: 'errors:studyUploadLimit',
    text: 'Daily upload limit reached.',
  },
  STUDY_IMPORT_INVALID: {
    http: 400,
    i18n: 'errors:studyImportInvalid',
    text: 'Invalid import',
  },
  STUDY_FOLDER_LIMIT: {
    http: 400,
    i18n: 'errors:studyFolderLimit',
    text: 'Too many folders',
  },
  STUDY_NAME_TAKEN: {
    http: 409,
    i18n: 'errors:studyNameTaken',
    text: 'Name taken',
  },
  STUDY_NAME_INVALID: {
    http: 400,
    i18n: 'errors:studyNameInvalid',
    text: 'Invalid name',
  },
  STUDY_TUTOR_OFFLINE: {
    http: 503,
    i18n: 'errors:studyTutorOffline',
    text: 'AI tutor is not configured',
  },
  STUDY_TUTOR_SLOW: {
    http: 429,
    i18n: 'errors:studyTutorSlow',
    text: 'Slow down a moment',
  },

  // --- handles and profile ---------------------------------------------------
  HANDLE_COOLDOWN: {
    http: 429,
    i18n: 'errors:handleCooldown',
    text: 'You can only change your handle once every 30 days',
  },
  HANDLE_TAKEN: {
    http: 409,
    i18n: 'errors:handleTaken',
    text: 'This handle is already taken',
  },
  HANDLE_RECLAIM_BLOCKED: {
    http: 409,
    i18n: 'errors:handleReclaimBlocked',
    text: 'That handle was released recently and is not available yet',
  },
  HANDLE_UNCHANGED: {
    http: 400,
    i18n: 'errors:handleUnchanged',
    text: 'That is already your handle',
  },
  ACCOUNT_NOT_FOUND: {
    http: 404,
    i18n: 'errors:accountNotFound',
    text: 'Account not found',
  },
  FOLLOW_SELF: {
    http: 400,
    i18n: 'errors:followSelf',
    text: 'Cannot follow yourself',
  },

  // --- posts and comments ---------------------------------------------------
  POST_NOT_FOUND: {
    http: 404,
    i18n: 'errors:postNotFound',
    text: 'Post not found',
  },
  POST_LOCKED: {
    http: 403,
    i18n: 'errors:postLocked',
    text: 'This post is locked',
  },
  POST_UNLOCK_TO_DRAFT: {
    http: 403,
    i18n: 'errors:postUnlockToDraft',
    text: 'Unlock this post to draft a reply.',
  },
  POST_EMPTY: {
    http: 400,
    i18n: 'errors:postEmpty',
    text: 'Post cannot be empty',
  },
  POST_QUOTED_NOT_FOUND: {
    http: 400,
    i18n: 'errors:postQuotedNotFound',
    text: 'Quoted post not found',
  },
  POST_REPLY_LIMITED: {
    http: 403,
    i18n: 'errors:postReplyLimited',
    text: 'The author limited who can reply to this post',
  },
  POST_THREAD_TOO_SHORT: {
    http: 400,
    i18n: 'errors:postThreadTooShort',
    text: 'A thread needs at least 2 posts',
  },
  POST_IMAGE_TOO_LARGE: {
    http: 413,
    i18n: 'errors:postImageTooLarge',
    text: 'That image is too large.',
  },
  POST_IMAGE_MISSING: {
    http: 400,
    i18n: 'errors:postImageMissing',
    text: 'No image provided',
  },
  AI_DRAFT_UNAVAILABLE: {
    http: 503,
    i18n: 'errors:aiDraftUnavailable',
    text: 'AI drafting is not available right now.',
  },

  // --- tournaments ---------------------------------------------------
  TOURNAMENT_NOT_FOUND: {
    http: 404,
    i18n: 'errors:tournamentNotFound',
    text: 'Tournament not found',
  },
  TOURNAMENT_MATCH_NOT_FOUND: {
    http: 404,
    i18n: 'errors:tournamentMatchNotFound',
    text: 'Match not found',
  },
  TOURNAMENT_NOT_YOUR_MATCH: {
    http: 403,
    i18n: 'errors:tournamentNotYourMatch',
    text: 'Not your match',
  },
  TOURNAMENT_ONLY_PLAYERS: {
    http: 403,
    i18n: 'errors:tournamentOnlyPlayers',
    text: 'Only the two players can do this',
  },
  TOURNAMENT_HOST_ONLY: {
    http: 403,
    i18n: 'errors:tournamentHostOnly',
    text: 'Only the host can do this',
  },
  TOURNAMENT_NOT_LIVE: {
    http: 409,
    i18n: 'errors:tournamentNotLive',
    text: 'Tournament is not live',
  },
  TOURNAMENT_MATCH_NOT_READY: {
    http: 409,
    i18n: 'errors:tournamentMatchNotReady',
    text: 'Match is not ready',
  },
  TOURNAMENT_FULL: {
    http: 409,
    i18n: 'errors:tournamentFull',
    text: 'Tournament is full',
  },
  TOURNAMENT_NO_CHECKIN: {
    http: 409,
    i18n: 'errors:tournamentNoCheckin',
    text: 'This tournament has no check-in',
  },
  TOURNAMENT_RESULT_ANSWERED: {
    http: 409,
    i18n: 'errors:tournamentResultAnswered',
    text: 'This result was already answered',
  },
  TOURNAMENT_RESULT_SETTLED: {
    http: 409,
    i18n: 'errors:tournamentResultSettled',
    text: 'This result was already settled',
  },
  TOURNAMENT_RESULT_DISPUTED: {
    http: 409,
    i18n: 'errors:tournamentResultDisputed',
    text: 'This result is disputed; the host decides it',
  },
  TOURNAMENT_REGISTRATION_CLOSED: {
    http: 409,
    i18n: 'errors:tournamentRegistrationClosed',
    text: 'Registration is closed',
  },
  TOURNAMENT_CHECKIN_CLOSED: {
    http: 409,
    i18n: 'errors:tournamentCheckinClosed',
    text: 'Check-in is closed',
  },
  TOURNAMENT_CHECKIN_NOT_OPEN: {
    http: 409,
    i18n: 'errors:tournamentCheckinNotOpen',
    text: 'Check-in has not opened yet',
  },
  TOURNAMENT_NOT_REGISTERED: {
    http: 404,
    i18n: 'errors:tournamentNotRegistered',
    text: 'You are not registered',
  },
  TOURNAMENT_ALREADY_REGISTERED: {
    http: 409,
    i18n: 'errors:tournamentAlreadyRegistered',
    text: 'Already registered',
  },
  TOURNAMENT_SEEDING_LOCKED: {
    http: 409,
    i18n: 'errors:tournamentSeedingLocked',
    text: 'Seeding is locked once the tournament starts',
  },
  TOURNAMENT_WITHDRAW_AFTER_START: {
    http: 409,
    i18n: 'errors:tournamentWithdrawAfterStart',
    text: 'Cannot withdraw after start',
  },
  TOURNAMENT_ALREADY_STARTED: {
    http: 409,
    i18n: 'errors:tournamentAlreadyStarted',
    text: 'Already started',
  },
  TOURNAMENT_TOO_FEW: {
    http: 400,
    i18n: 'errors:tournamentTooFew',
    text: 'Not enough players to start',
  },
  TOURNAMENT_ENTRY_FEE_COINS: {
    http: 400,
    i18n: 'errors:tournamentEntryFeeCoins',
    text: 'Not enough coins for the entry fee',
  },
  TOURNAMENT_OVER: {
    http: 409,
    i18n: 'errors:tournamentOver',
    text: 'This tournament is over',
  },
  TOURNAMENT_ACCOUNT_RESTRICTED: {
    http: 403,
    i18n: 'errors:tournamentAccountRestricted',
    text: 'Your account is restricted',
  },
  TOURNAMENT_NO_RESULT_TO_CONFIRM: {
    http: 409,
    i18n: 'errors:tournamentNoResultToConfirm',
    text: 'There is no result to confirm',
  },
  TOURNAMENT_NO_RESULT_TO_DISPUTE: {
    http: 409,
    i18n: 'errors:tournamentNoResultToDispute',
    text: 'There is no result to dispute',
  },
  TOURNAMENT_NO_RESULT_TO_WITHDRAW: {
    http: 409,
    i18n: 'errors:tournamentNoResultToWithdraw',
    text: 'There is no result to withdraw',
  },
  TOURNAMENT_OWN_REPORT_CONFIRM: {
    http: 403,
    i18n: 'errors:tournamentOwnReportConfirm',
    text: 'You cannot confirm your own report',
  },
  TOURNAMENT_OWN_REPORT_DISPUTE: {
    http: 403,
    i18n: 'errors:tournamentOwnReportDispute',
    text: 'You cannot dispute your own report',
  },
  TOURNAMENT_PROPOSAL_EXPIRED: {
    http: 409,
    i18n: 'errors:tournamentProposalExpired',
    text: 'The proposed time has passed',
  },
  TOURNAMENT_PROPOSAL_CHANGED: {
    http: 409,
    i18n: 'errors:tournamentProposalChanged',
    text: 'The proposal changed',
  },
  TOURNAMENT_BAD_WINNER: {
    http: 400,
    i18n: 'errors:tournamentBadWinner',
    text: 'Winner must be in this match',
  },
  EVENT_NOT_FOUND: {
    http: 404,
    i18n: 'errors:eventNotFound',
    text: 'Not found',
  },
  // --- med schools tracker (phase 4) ----------------------------------------------
  MEDSCHOOLS_SHARING_UNAVAILABLE: {
    http: 503,
    i18n: 'errors:medschoolsSharingUnavailable',
    text: 'Sharing is not available right now',
  },
  MEDSCHOOLS_ACCOUNT_TOO_NEW: {
    http: 409,
    i18n: 'errors:medschoolsAccountTooNew',
    text: 'Sharing needs an account at least {{days}} days old',
  },
  MEDSCHOOLS_DUPLICATE: {
    http: 409,
    i18n: 'errors:medschoolsDuplicate',
    text: 'That school is already in this cycle',
  },
  MEDSCHOOLS_CAP: {
    http: 409,
    i18n: 'errors:medschoolsCap',
    text: 'You can track up to {{max}} schools in one cycle',
  },
  MEDSCHOOLS_LIST_CAP: {
    http: 409,
    i18n: 'errors:medschoolsListCap',
    text: 'You can keep up to {{max}} lists',
  },
  MEDSCHOOLS_ITEM_CAP: {
    http: 409,
    i18n: 'errors:medschoolsItemCap',
    text: 'A list holds up to {{max}} schools',
  },
  MEDSCHOOLS_LIST_DUPLICATE: {
    http: 409,
    i18n: 'errors:medschoolsListDuplicate',
    text: 'That school is already on this list',
  },
  MEDSCHOOLS_STALE_ORDER: {
    http: 409,
    i18n: 'errors:medschoolsStaleOrder',
    text: 'Your lists changed in another tab. Reload to see them',
  },
  // --- med schools Q&A (phase 6) ----------------------------------------------------
  MEDSCHOOLS_QA_DAILY_CAP: {
    http: 429,
    i18n: 'errors:medschoolsQaDailyCap',
    text: "You have used today's questions. Try again tomorrow",
  },
  MEDSCHOOLS_QA_PAUSED: {
    http: 503,
    i18n: 'errors:medschoolsQaPaused',
    text: 'Questions are paused right now',
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Narrow an arbitrary string to a known code (for parsing a server response). */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_CODES;
}

/**
 * A failure with an identity.
 *
 * Throw one anywhere below an API route and `defineHandler` maps it to the
 * right status with the code attached, instead of the blanket 500 an unnamed
 * exception gets. `detail` is interpolated into the translated message, so keep
 * its values safe to show a user — never a database message or a file path.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly detail: Record<string, string | number> | undefined;

  constructor(code: ErrorCode, detail?: Record<string, string | number>) {
    super(ERROR_CODES[code].text);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }

  get status(): number {
    return ERROR_CODES[this.code].http;
  }

  /** The site envelope, extended with the code. Shape-compatible with `apiError`. */
  toBody(): {
    error: string;
    code: ErrorCode;
    detail?: Record<string, string | number>;
  } {
    return {
      error: ERROR_CODES[this.code].text,
      code: this.code,
      ...(this.detail
        ? {
            detail: this.detail,
          }
        : {}),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Resolve a server response body to display text.
 *
 * Pass the app's `t` so the message lands in the reader's language; without it
 * (server rendering, a boundary that has no i18n context) the English fallback
 * is used. Unknown or absent codes fall back to the server's `error` string,
 * which keeps this working against routes that have not adopted codes yet.
 */
export function errorMessage(
  body: unknown,
  t?: (
    key: string,
    opts: {
      defaultValue: string;
    } & Record<string, unknown>,
  ) => string,
): string {
  const raw = body as {
    error?: unknown;
    code?: unknown;
    detail?: Record<string, unknown>;
  } | null;
  const code = raw?.code;
  if (isErrorCode(code)) {
    const def = ERROR_CODES[code];
    return t
      ? t(def.i18n, {
          defaultValue: def.text,
          ...(raw?.detail ?? {}),
        })
      : def.text;
  }
  if (typeof raw?.error === 'string' && raw.error) return raw.error;
  return ERROR_CODES.INTERNAL.text;
}

/** The values a refusal may carry beside its code (never member-written text). */
export type RefusalParams = Record<string, string | number>;

/** What a taxonomy entry looks like to code that does not care which entry it is. */
export interface ErrorCodeDef {
  readonly http: number;
  readonly i18n: string;
  readonly text: string;
  /** A second sentence for when `endsAt` (or another date) is known. */
  readonly withDate?: { readonly i18n: string; readonly text: string };
}

/** Fill `{{name}}` placeholders in an English template. An unknown placeholder is left as written. */
export function fillTemplate(template: string, params?: RefusalParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * The body of a refusal: the English `error` (so old clients, push and logs read as before) and the `code`
 * (so a current client renders it from the `errors` namespace), plus the params the sentence needs.
 *
 * Spread it where an `{ error: '…' }` was written: `Response.json({ ...refusalBody('EVENT_FULL') }, { status: 409 })`.
 * Params ride as top-level fields beside `error` and `code`; they are numbers and ISO dates, never member text.
 */
export function refusalBody(
  code: ErrorCode,
  params?: RefusalParams,
): {
  error: string;
  code: ErrorCode;
} {
  const def: ErrorCodeDef = ERROR_CODES[code];
  return { error: fillTemplate(def.text, params), code, ...params };
}

/**
 * As {@link refusalBody}, for a body that already has a `code` another layer reads (a tournament's `FULL`, a group's
 * `ADMIN_LIMIT`): the taxonomy code rides in `refusal` so that wire contract is untouched.
 */
export function refusalBeside(
  code: ErrorCode,
  params?: RefusalParams,
): {
  error: string;
  refusal: ErrorCode;
} {
  const def: ErrorCodeDef = ERROR_CODES[code];
  return { error: fillTemplate(def.text, params), refusal: code, ...params };
}

/** `{ code, refusal }` when a service result carries them, so a route can pass them through beside `error`. */
export function refusalCodeOf(result: object): { code?: string; refusal?: string } {
  const { code, refusal: beside } = result as { code?: unknown; refusal?: unknown };
  return {
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof beside === 'string' ? { refusal: beside } : {}),
  };
}
