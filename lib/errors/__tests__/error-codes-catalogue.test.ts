/**
 * The error taxonomy and its catalogue stay one thing (sprint 10, feature 20).
 *
 * `ERROR_CODES` (`lib/errors/codes.ts`), the `errors` catalogue (`locales/en/errors.json`) and the literal `switch` in
 * `components/errors/refusal-sentence.ts` (the hook's sentences) are three spellings of the same list. This holds them equal:
 *  - every code's key is in `errors.json` (or its own namespace's file) with the same English;
 *  - every code has exactly one `case` in the hook, whose literal key, namespace and English default match;
 *  - every converted route still names the code that replaced its English, and the English it replaced is not
 *    written there any more, so a reverted conversion fails here.
 * English readers must see no change, so a code's text is the sentence the server sent before the code existed.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript-js';
import { describe, expect, it } from 'vitest';
import { REFUSAL_BY_MESSAGE } from '@/lib/tournaments/tournament-error';
import { ERROR_CODES, fillTemplate, refusalBody, type ErrorCode, type ErrorCodeDef } from '@/lib/errors/codes';

const read = (path: string) => readFileSync(path, 'utf8');
const entries = Object.entries(ERROR_CODES) as [ErrorCode, ErrorCodeDef][];

function catalogue(ns: string): Record<string, string> {
  return JSON.parse(read(`locales/en/${ns}.json`)) as Record<string, string>;
}

interface HookCase {
  key: string;
  ns: string | undefined;
  defaultValue: string | undefined;
}

/** Every `case 'CODE': … t('key', { ns, defaultValue })` in the hook's switch, read from its syntax tree. */
function hookCases(): Map<string, HookCase[]> {
  const source = read('components/errors/refusal-sentence.ts');
  const file = ts.createSourceFile('refusal-sentence.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cases = new Map<string, HookCase[]>();
  const literal = (node: ts.Node | undefined): string | undefined =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      const found: HookCase[] = [];
      const collect = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't') {
          const [keyArg, optionsArg] = n.arguments;
          const key = literal(keyArg);
          if (key !== undefined && optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
            const prop = (name: string) =>
              optionsArg.properties.find(
                (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === name,
              );
            found.push({
              key,
              ns: literal(prop('ns')?.initializer),
              defaultValue: literal(prop('defaultValue')?.initializer),
            });
          }
        }
        ts.forEachChild(n, collect);
      };
      node.statements.forEach(collect);
      cases.set(node.expression.text, found);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return cases;
}

describe('ERROR_CODES and the errors catalogue', () => {
  it('has every code key in its catalogue with the same English', () => {
    const missing: string[] = [];
    for (const [code, def] of entries) {
      const pairs = [def, ...(def.withDate ? [def.withDate] : [])];
      for (const pair of pairs) {
        const [ns, key] = pair.i18n.split(':') as [string, string];
        const english = catalogue(ns)[key];
        if (english === undefined) missing.push(`${code}: ${pair.i18n} is not in locales/en/${ns}.json`);
        else if (ns === 'errors' && english !== pair.text)
          missing.push(`${code}: catalogue says ${JSON.stringify(english)}, code says ${JSON.stringify(pair.text)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has no key in errors.json that no code (or the generic line) owns', () => {
    const owned = new Set(
      entries
        .flatMap(([, def]) => [def.i18n, def.withDate?.i18n])
        .filter((k): k is string => !!k && k.startsWith('errors:')),
    );
    owned.add('errors:generic');
    const stray = Object.keys(catalogue('errors')).filter((key) => !owned.has(`errors:${key}`));
    expect(stray).toEqual([]);
  });

  it('gives every code one case in the hook, with its key, namespace and English', () => {
    const cases = hookCases();
    const problems: string[] = [];
    for (const [code, def] of entries) {
      const found = cases.get(code);
      if (!found || found.length === 0) {
        problems.push(`${code} has no case in refusal-sentence`);
        continue;
      }
      const expected = [def, ...(def.withDate ? [def.withDate] : [])].map((pair) => {
        const [ns, key] = pair.i18n.split(':') as [string, string];
        return { key, ns, defaultValue: pair.text };
      });
      for (const want of expected) {
        const hit = found.find((c) => c.key === want.key);
        if (!hit) problems.push(`${code}: no t('${want.key}') in its case`);
        else if (hit.ns !== want.ns || hit.defaultValue !== want.defaultValue)
          problems.push(`${code}: ${want.key} reads ns=${hit.ns} default=${JSON.stringify(hit.defaultValue)}`);
      }
    }
    for (const code of cases.keys())
      if (!(code in ERROR_CODES)) problems.push(`${code} is in the hook but not in ERROR_CODES`);
    expect(problems).toEqual([]);
  });

  it('keeps `text` and the placeholders of a code in step', () => {
    for (const [, def] of entries) {
      const names = [...def.text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      expect(fillTemplate(def.text, Object.fromEntries(names.map((n) => [n, 7])))).not.toContain('{{');
    }
  });

  it('writes a refusal body that keeps the English `error` beside the `code`', () => {
    expect(refusalBody('EVENT_FULL')).toEqual({ error: 'This event is full', code: 'EVENT_FULL' });
    expect(refusalBody('GROUP_ADMIN_LIMIT', { max: 5 })).toEqual({
      error: 'A group can have 5 admins',
      code: 'GROUP_ADMIN_LIMIT',
      max: 5,
    });
  });
});

/** [file, code]: a route or service module that used to send the English of `code` and now sends the code. */
const CONVERTED: [string, ErrorCode][] = [
  ['app/routes/api/rmharks/$id/unlock.ts', 'COINS_NOT_ENOUGH'],
  ['app/routes/api/rmharks/$id/unlock.ts', 'POST_NOT_FOUND'],
  ['app/routes/api/user-builds/$id/unlock.ts', 'BUILD_NOT_FOUND'],
  ['app/routes/api/user-builds/$id/unlock.ts', 'COINS_NOT_ENOUGH'],
  ['app/routes/api/user-builds/$id/view.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/builds.$id.issues.$issueId.close.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/builds.$id.issues.$issueId.hide.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/builds.$id.issues.$issueId.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/builds.$id.issues.$issueId.status.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/builds.$id.issues.$issueId.vote.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/builds.$id.issues.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/user-builds.$id.insights.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/user-builds.$id.releases.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/api/user-builds.$id.screenshots.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/releases.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/releases.server.ts', 'BUILD_RELEASE_DELETE_OWNER_ONLY'],
  ['lib/builds/releases.server.ts', 'BUILD_RELEASE_NOT_FOUND'],
  ['lib/builds/releases.server.ts', 'BUILD_RELEASE_OWNER_ONLY'],
  ['lib/builds/releases.server.ts', 'BUILD_VERSION_EXISTS'],
  ['lib/builds/screenshots.server.ts', 'BUILD_NOT_FOUND'],
  ['lib/builds/screenshots.server.ts', 'BUILD_PICTURES_OWNER_ONLY'],
  ['lib/builds/screenshots.server.ts', 'BUILD_SCREENSHOTS_OWNER_ONLY'],
  ['lib/builds/screenshots.server.ts', 'FILE_MISSING'],
  ['lib/chat-plus/api/chat-folders.$id.server.ts', 'CHAT_FOLDER_NOT_FOUND'],
  ['lib/chat-plus/api/chats.$kind.$id.settings.server.ts', 'GROUP_ONE_TO_ONE_ONLY'],
  ['lib/chat-plus/api/chats.$kind.$id.thread.$messageId.server.ts', 'CHAT_THREAD_NOT_FOUND'],
  ['lib/chat-plus/checklist.server.ts', 'CHAT_CHECKLIST_NOT_FOUND'],
  ['lib/chat-plus/folders.server.ts', 'CHAT_FOLDER_FULL'],
  ['lib/chat-plus/folders.server.ts', 'CHAT_FOLDER_LIMIT'],
  ['lib/chat-plus/folders.server.ts', 'CHAT_FOLDER_NOT_FOUND'],
  ['lib/chat-plus/folders.server.ts', 'CHAT_NOT_FOUND'],
  ['lib/chat-plus/forward.server.ts', 'ACCOUNT_SUSPENDED'],
  ['lib/chat-plus/forward.server.ts', 'CHAT_NOT_FOUND'],
  ['lib/chat-plus/forward.server.ts', 'FORWARD_KIND_BLOCKED'],
  ['lib/chat-plus/forward.server.ts', 'FORWARD_NOTHING'],
  ['lib/chat-plus/forward.server.ts', 'FORWARD_ONE_CHAT_ONLY'],
  ['lib/chat-plus/forward.server.ts', 'MESSAGE_NOT_FOUND'],
  ['lib/chat-plus/pins.server.ts', 'CHAT_PIN_LIMIT'],
  ['lib/chat-plus/pins.server.ts', 'MESSAGE_NOT_FOUND'],
  ['lib/chat-plus/polls.server.ts', 'CHAT_POLL_NOT_FOUND'],
  ['lib/chat-plus/polls.server.ts', 'CHAT_POLL_OPTION_INVALID'],
  ['lib/chat-plus/route-helpers.server.ts', 'ACCOUNT_SUSPENDED'],
  ['lib/chat-plus/tip.server.ts', 'COINS_NOT_ENOUGH'],
  ['lib/chat-plus/tip.server.ts', 'TIP_RECIPIENT_NOT_FOUND'],
  ['lib/chat-plus/tip.server.ts', 'TIP_SELF'],
  ['lib/communities/api/communities.$slug.alerts.server.ts', 'COMMUNITY_JOIN_REQUIRED'],
  ['lib/communities/api/communities.$slug.announcements.$id.server.ts', 'COMMUNITY_NOT_ALLOWED'],
  ['lib/communities/api/communities.$slug.announcements.server.ts', 'COMMUNITY_ANNOUNCE_MODS_ONLY'],
  ['lib/communities/api/communities.$slug.invites.server.ts', 'COMMUNITY_INVITES_PRIVATE_ONLY'],
  ['lib/communities/api/communities.$slug.invites.server.ts', 'COMMUNITY_INVITE_LIMIT'],
  ['lib/communities/api/communities.$slug.join-request.server.ts', 'COMMUNITY_ALREADY_MEMBER'],
  ['lib/communities/api/communities.$slug.join-request.server.ts', 'COMMUNITY_IS_OPEN'],
  ['lib/communities/api/communities.$slug.join.server.ts', 'COMMUNITY_CREATOR_CANNOT_LEAVE'],
  ['lib/communities/api/communities.$slug.join.server.ts', 'COMMUNITY_INVITE_INVALID'],
  ['lib/communities/api/communities.$slug.macros.server.ts', 'COMMUNITY_MACRO_LIMIT'],
  ['lib/communities/api/communities.$slug.members.$userId.server.ts', 'COMMUNITY_ADMIN_ROLE_LOCKED'],
  ['lib/communities/api/communities.$slug.members.$userId.server.ts', 'COMMUNITY_MOD_REMOVE_OWNER_ONLY'],
  ['lib/communities/api/communities.$slug.members.$userId.server.ts', 'COMMUNITY_NOT_ALLOWED'],
  ['lib/communities/api/communities.$slug.members.$userId.server.ts', 'COMMUNITY_NOT_A_MEMBER'],
  ['lib/communities/api/communities.$slug.members.$userId.server.ts', 'COMMUNITY_OWNER_NOT_REMOVABLE'],
  ['lib/communities/api/communities.$slug.members.$userId.server.ts', 'COMMUNITY_OWNER_ROLE_LOCKED'],
  ['lib/communities/bans.server.ts', 'COMMUNITY_MEMBER_NOT_FOUND'],
  ['lib/communities/bans.server.ts', 'COMMUNITY_MODS_ONLY'],
  ['lib/communities/bans.server.ts', 'COMMUNITY_MOD_SANCTION_OWNER_ONLY'],
  ['lib/communities/bans.server.ts', 'COMMUNITY_NOT_A_MEMBER'],
  ['lib/communities/bans.server.ts', 'COMMUNITY_OWNER_PROTECTED'],
  ['lib/communities/bans.server.ts', 'COMMUNITY_RULE_NOT_FOUND'],
  ['lib/communities/bans.server.ts', 'COMMUNITY_SANCTION_SELF'],
  ['lib/communities/gate.server.ts', 'COMMUNITY_FLAIR_REQUIRED'],
  ['lib/communities/mod-decisions.server.ts', 'COMMUNITY_RULE_NOT_FOUND'],
  ['lib/communities/post-gate.server.ts', 'COMMUNITY_POST_JOIN_REQUIRED'],
  ['lib/events/api/events.$id.occurrences.server.ts', 'EVENT_DATES_HOST_ONLY'],
  ['lib/events/api/events.$id.occurrences.server.ts', 'EVENT_DATE_LOCKED'],
  ['lib/events/updates.server.ts', 'EVENT_UPDATE_FAILED'],
  ['lib/feed/api/feed.repost-mutes.server.ts', 'COMMUNITY_MEMBER_NOT_FOUND'],
  ['lib/feed/api/rmharks.$id.bookmark.server.ts', 'POST_NOT_FOUND'],
  ['lib/feed/api/rmharks.$id.comment.server.ts', 'POST_NOT_FOUND'],
  ['lib/feed/api/rmharks.$id.comment.server.ts', 'POST_REPLY_LIMITED'],
  ['lib/feed/api/rmharks.$id.like.server.ts', 'POST_NOT_FOUND'],
  ['lib/feed/api/rmharks.$id.mute.server.ts', 'POST_NOT_FOUND'],
  ['lib/feed/api/rmharks.$id.quotes.server.ts', 'POST_NOT_FOUND'],
  ['lib/feed/api/rmharks.$id.react.server.ts', 'MESSAGE_EMOJI_INVALID'],
  ['lib/feed/api/rmharks.$id.server.ts', 'POST_EMPTY'],
  ['lib/feed/api/rmharks.$id.summary.server.ts', 'POST_LOCKED'],
  ['lib/feed/api/rmharks.$id.summary.server.ts', 'POST_NOT_FOUND'],
  ['lib/feed/api/rmharks.$id.vote.server.ts', 'CHAT_POLL_OPTION_INVALID'],
  ['lib/feed/api/rmharks.ai-generate.server.ts', 'AI_DRAFT_UNAVAILABLE'],
  ['lib/feed/api/rmharks.ai-generate.server.ts', 'POST_NOT_FOUND'],
  ['lib/feed/api/rmharks.ai-generate.server.ts', 'POST_UNLOCK_TO_DRAFT'],
  ['lib/feed/api/rmharks.server.ts', 'MESSAGE_IMAGE_INVALID'],
  ['lib/feed/api/rmharks.server.ts', 'POST_QUOTED_NOT_FOUND'],
  ['lib/feed/api/rmharks.thread.server.ts', 'POST_THREAD_TOO_SHORT'],
  ['lib/group-chat/api/group-chats.$id.messages.$messageId.vote.server.ts', 'CHAT_POLL_NOT_FOUND'],
  ['lib/group-chat/api/group-chats.$id.messages.$messageId.vote.server.ts', 'CHAT_POLL_OPTION_INVALID'],
  ['lib/group-chat/api/group-chats.$id.react.server.ts', 'MESSAGE_EMOJI_INVALID'],
  ['lib/group-chat/api/group-chats.$id.react.server.ts', 'MESSAGE_NOT_FOUND'],
  ['lib/group-chat/api/group-chats.server.ts', 'GROUP_NEEDS_MEMBER'],
  ['lib/group-chat/api/group-chats.server.ts', 'GROUP_TOO_MANY'],
  ['lib/group-chat/api/group-invites.$code.join.server.ts', 'GROUP_INVITE_UNUSABLE'],
  ['lib/group-chat/invites.server.ts', 'GROUP_INVITE_LIMIT'],
  ['lib/group-chat/manage.server.ts', 'GROUP_ALREADY_OWNER'],
  ['lib/group-chat/manage.server.ts', 'GROUP_NOT_ALLOWED'],
  ['lib/group-chat/manage.server.ts', 'GROUP_NOT_A_MEMBER'],
  ['lib/group-chat/manage.server.ts', 'GROUP_OWNER_ONLY'],
  ['lib/group-chat/manage.server.ts', 'GROUP_USE_LEAVE'],
  ['lib/group-chat/roles.server.ts', 'GROUP_ADMIN_LIMIT'],
  ['lib/group-chat/roles.server.ts', 'GROUP_OWNER_ABOVE_ADMINS'],
  ['lib/messages/api/messages.$conversationId.mutations.server.ts', 'CONVERSATION_NOT_FOUND'],
  ['lib/messages/api/messages.$conversationId.react.server.ts', 'CONVERSATION_NOT_FOUND'],
  ['lib/messages/api/messages.$conversationId.react.server.ts', 'MESSAGE_EMOJI_INVALID'],
  ['lib/messages/api/messages.$conversationId.react.server.ts', 'MESSAGE_NOT_FOUND'],
  ['lib/messages/api/messages.$conversationId.read.server.ts', 'CONVERSATION_NOT_FOUND'],
  ['lib/messages/api/messages.$conversationId.server.ts', 'CONVERSATION_NOT_FOUND'],
  ['lib/messages/api/messages.$conversationId.server.ts', 'MESSAGE_PAYLOAD_TOO_LARGE'],
  ['lib/messages/api/messages.$conversationId.server.ts', 'MESSAGE_TOO_FAST'],
  ['lib/messages/api/messages.$conversationId.thread.server.ts', 'CONVERSATION_NOT_FOUND'],
  ['lib/messages/api/messages.$conversationId.typing.server.ts', 'CONVERSATION_NOT_FOUND'],
  ['lib/messages/api/messages.$conversationId.voice.server.ts', 'VOICE_LENGTH_INVALID'],
  ['lib/messages/api/messages.$conversationId.voice.server.ts', 'VOICE_MISSING'],
  ['lib/messages/api/messages.$conversationId.voice.server.ts', 'VOICE_TOO_LARGE'],
  ['lib/messages/api/messages.requests.$id.server.ts', 'MESSAGE_REQUEST_NOT_FOUND'],
  ['lib/messages/api/messages.server.ts', 'MESSAGE_FOLLOWS_ONLY'],
  ['lib/messages/api/messages.server.ts', 'MESSAGE_IMAGE_INVALID'],
  ['lib/messages/api/messages.server.ts', 'MESSAGE_NOT_ACCEPTING'],
  ['lib/messages/api/messages.server.ts', 'MESSAGE_NO_LONGER_ALLOWED'],
  ['lib/messages/api/messages.server.ts', 'MESSAGE_SELF'],
  ['lib/messages/api/messages.server.ts', 'MESSAGE_USER_NOT_FOUND'],
  ['lib/messages/saved-replies.server.ts', 'SAVED_REPLY_LIMIT'],
  ['lib/messages/saved-replies.server.ts', 'SAVED_REPLY_NOT_FOUND'],
  ['lib/messages/scheduled.server.ts', 'MESSAGE_COULD_NOT_SEND'],
  ['lib/messages/voice.server.ts', 'AUDIO_FORMAT_UNSUPPORTED'],
  ['lib/messages/voice.server.ts', 'CONVERSATION_NOT_FOUND'],
  ['lib/messages/voice.server.ts', 'MESSAGE_FOLLOWS_ONLY'],
  ['lib/messages/voice.server.ts', 'MESSAGE_NO_LONGER_ACCEPTING'],
  ['lib/messages/voice.server.ts', 'MESSAGE_REQUEST_TEXT_ONLY'],
  ['lib/profile/api/profile.$id.follow.server.ts', 'FOLLOW_SELF'],
  ['lib/profile/api/profile.$id.follow.server.ts', 'MESSAGE_USER_NOT_FOUND'],
  ['lib/profile/api/profile.$id.server.ts', 'MESSAGE_USER_NOT_FOUND'],
  ['lib/profile/api/profile.me.server.ts', 'MESSAGE_USER_NOT_FOUND'],
  ['lib/profile/api/profile.pronunciation.server.ts', 'VOICE_MISSING'],
  ['lib/profile/api/profile.pronunciation.server.ts', 'VOICE_TOO_LARGE'],
  ['lib/profile/api/stamps.server.ts', 'POST_IMAGE_MISSING'],
  ['lib/profile/api/stamps.server.ts', 'POST_IMAGE_TOO_LARGE'],
  ['lib/study.server.ts', 'STUDY_DECK_LIMIT'],
  ['lib/study.server.ts', 'STUDY_DECK_NOT_FOUND'],
  ['lib/study.server.ts', 'STUDY_DECK_OWN'],
  ['lib/study/api/study.card-sound.server.ts', 'STUDY_SOUND_TOO_LARGE'],
  ['lib/study/api/study.decks.$id.server.ts', 'STUDY_CARD_INVALID'],
  ['lib/study/api/study.decks.server.ts', 'STUDY_DECK_LIMIT'],
  ['lib/study/api/study.tutor.server.ts', 'STUDY_TUTOR_OFFLINE'],
  ['lib/study/api/study.tutor.server.ts', 'STUDY_TUTOR_SLOW'],
  ['lib/study/card-images.server.ts', 'FILE_MISSING'],
  ['lib/study/card-images.server.ts', 'STUDY_PICTURE_ANIMATED'],
  ['lib/study/card-images.server.ts', 'STUDY_PICTURE_REUPLOAD'],
  ['lib/study/card-sound.server.ts', 'AUDIO_FORMAT_UNSUPPORTED'],
  ['lib/study/card-sound.server.ts', 'STUDY_SOUND_REUPLOAD'],
  ['lib/study/card-sound.server.ts', 'STUDY_SOUND_TOO_LARGE'],
  ['lib/study/card-sound.server.ts', 'STUDY_SOUND_TOO_LONG'],
  ['lib/study/card-sound.server.ts', 'STUDY_UPLOAD_LIMIT'],
  ['lib/study/card-sound.server.ts', 'VOICE_MISSING'],
  ['lib/study/deck-editor.server.ts', 'STUDY_CARD_INVALID'],
  ['lib/study/deck-editor.server.ts', 'STUDY_DECK_FULL'],
  ['lib/study/deck-editor.server.ts', 'STUDY_DECK_LIMIT'],
  ['lib/study/deck-editor.server.ts', 'STUDY_IMPORT_INVALID'],
  ['lib/study/deck-editor.server.ts', 'STUDY_PICTURE_ANIMATED'],
  ['lib/study/deck-editor.server.ts', 'STUDY_PICTURE_CARD_LIMIT'],
  ['lib/study/deck-editor.server.ts', 'STUDY_PICTURE_INVALID'],
  ['lib/study/deck-editor.server.ts', 'STUDY_PICTURE_REUPLOAD'],
  ['lib/study/deck-editor.server.ts', 'STUDY_SOUND_CARD_LIMIT'],
  ['lib/study/deck-editor.server.ts', 'STUDY_SOUND_INVALID'],
  ['lib/study/deck-editor.server.ts', 'STUDY_SOUND_REUPLOAD'],
  ['lib/study/folders.server.ts', 'STUDY_FOLDER_LIMIT'],
  ['lib/study/folders.server.ts', 'STUDY_NAME_INVALID'],
  ['lib/study/folders.server.ts', 'STUDY_NAME_TAKEN'],
  ['lib/study/highlight-cards.server.ts', 'STUDY_CARD_INVALID'],
  ['lib/study/highlight-cards.server.ts', 'STUDY_DECK_FULL'],
  ['lib/api/routes/events.$id.rsvp.server.ts', 'EVENT_NOT_FOUND'],
  ['lib/api/routes/events.$id.rsvp.server.ts', 'EVENT_FULL'],
  ['lib/api/routes/events.$id.rsvp.server.ts', 'WAITLIST_CLOSED'],
  ['lib/api/routes/events.$id.rsvp.server.ts', 'WAITLIST_FULL'],
  ['lib/api/routes/events.$id.rsvp.server.ts', 'EVENT_CANCELED'],
  ['lib/api/routes/events.$id.rsvp.server.ts', 'EVENT_DATE_SKIPPED'],
  ['lib/api/routes/events.$id.rsvp.server.ts', 'RSVP_FAILED'],
  ['lib/handles/history.server.ts', 'ACCOUNT_NOT_FOUND'],
  ['lib/handles/history.server.ts', 'HANDLE_UNCHANGED'],
  ['lib/handles/history.server.ts', 'HANDLE_COOLDOWN'],
  ['lib/handles/history.server.ts', 'HANDLE_RECLAIM_BLOCKED'],
  ['lib/handles/history.server.ts', 'HANDLE_TAKEN'],
];

describe('converted routes', () => {
  it('is a table of codes that exist', () => {
    for (const [, code] of CONVERTED) expect(code in ERROR_CODES, code).toBe(true);
    expect(CONVERTED.length).toBeGreaterThanOrEqual(100);
  });

  it.each(CONVERTED)('%s answers %s as a code, not as bare English', (file, code) => {
    const source = read(file);
    expect(source, `${file} no longer names ${code}`).toContain(`'${code}'`);
    // The English this code replaced must not be written as an `error` any more: a revert would put it back.
    const text = ERROR_CODES[code].text;
    if (!text.includes('{{')) {
      const quoted = [`'${text.replace(/'/g, "\\'")}'`, JSON.stringify(text)];
      for (const q of quoted) expect(source.includes(`error: ${q}`), `${file} still sends ${q}`).toBe(false);
    }
  });
});

describe('tournament refusals', () => {
  it('maps each message a tournament error carries to the code whose English it is', () => {
    for (const [message, code] of Object.entries(REFUSAL_BY_MESSAGE)) expect(ERROR_CODES[code].text).toBe(message);
  });

  it('sends only messages that tournament code really throws', () => {
    const thrown = [
      'tournament.server.ts',
      'checkin.server.ts',
      'seeding.server.ts',
      'match-results.server.ts',
      'scheduling.server.ts',
    ]
      .map((f) => read(`lib/tournaments/${f}`))
      .join('\n');
    for (const message of Object.keys(REFUSAL_BY_MESSAGE)) expect(thrown, message).toContain(`'${message}'`);
  });
});
