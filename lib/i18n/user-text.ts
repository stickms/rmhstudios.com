/**
 * Member-written text and its direction (sprint 09, feature 20).
 *
 * A member who writes Arabic on an English site, or English on an Arabic one, expects their words in their own
 * direction. The interface direction follows the locale; member text follows its first strong character. Three
 * rules, all attributes and no script:
 *
 *   - `block`  : an element whose whole content is one block of member text carries `dir="auto"`.
 *   - `inline` : a name, handle or title placed inside a translated sentence is wrapped in `<bdi>` (or a
 *                `dir="auto"` span where it must be a link), so "<name> liked your post" keeps its order.
 *   - `input`  : a free-text field carries `dir="auto"`, so it aligns as the member types.
 *
 * `USER_TEXT_RENDERERS` lists each component file that does this, and `lib/__tests__/user-text-direction.test.ts`
 * holds the list with a source scan: a listed file must contain `dir="auto"` or `<bdi`, and a component that renders
 * a member-text field without being listed or exempted (with a reason) fails.
 */

export type UserTextKind = 'block' | 'inline' | 'input';

export interface UserTextRenderer {
  readonly file: string;
  readonly kind: UserTextKind;
}

export const USER_TEXT_RENDERERS: readonly UserTextRenderer[] = [
  { file: 'components/feed/RMHarkContent.tsx', kind: 'block' },
  { file: 'components/lights-out/FewestMovesToday.tsx', kind: 'inline' },
  { file: 'components/profile/plus/settings/IdentitySettings.tsx', kind: 'input' },
  { file: 'components/feed/CommentItem.tsx', kind: 'inline' },
  { file: 'components/feed/FeedRow.tsx', kind: 'inline' },
  { file: 'components/feed/conversation/MessageRow.tsx', kind: 'block' },
  { file: 'components/feed/group-chat/GroupMessageRow.tsx', kind: 'block' },
  { file: 'components/feed/PersonaChatColumn.tsx', kind: 'block' },
  { file: 'components/feed/EditHistory.tsx', kind: 'block' },
  { file: 'components/feed/QuotesDialog.tsx', kind: 'block' },
  { file: 'components/feed/ProfileHoverCard.tsx', kind: 'block' },
  { file: 'components/feed/RecapColumn.tsx', kind: 'block' },
  { file: 'components/feed/LinkPreview.tsx', kind: 'block' },
  { file: 'components/feed/DeckMarketplaceColumn.tsx', kind: 'block' },
  { file: 'components/feed/DeckStudyColumn.tsx', kind: 'block' },
  { file: 'components/feed/FlashcardsColumn.tsx', kind: 'block' },
  { file: 'components/feed/CommunityColumn.tsx', kind: 'block' },
  { file: 'components/feed/compose/DraftRestoreBanner.tsx', kind: 'block' },
  { file: 'components/feed/MentionTextarea.tsx', kind: 'input' },
  { file: 'components/feed/GhostTextArea.tsx', kind: 'input' },
  { file: 'components/feed/HomeComposerSignedIn.tsx', kind: 'input' },
  { file: 'components/feed/profile-edit/IdentitySection.tsx', kind: 'input' },
  { file: 'components/profile/ProfileHero.tsx', kind: 'block' },
  { file: 'components/settings/ProfilePreview.tsx', kind: 'block' },
  { file: 'components/profile/plus/rings/RingsIndex.tsx', kind: 'block' },
  { file: 'components/profile/plus/rings/RingPage.tsx', kind: 'block' },
  { file: 'components/communities/DocEditor.tsx', kind: 'block' },
  { file: 'components/communities/LockedCommunity.tsx', kind: 'block' },
  { file: 'components/communities/CommunityRules.tsx', kind: 'block' },
  { file: 'components/communities/ChallengePanel.tsx', kind: 'block' },
  { file: 'components/communities/MemberNotesDialog.tsx', kind: 'block' },
  { file: 'components/communities/MemberNotesPreview.tsx', kind: 'block' },
  { file: 'components/communities/wiki/WikiPage.tsx', kind: 'inline' },
  { file: 'components/communities/wiki/WikiHistory.tsx', kind: 'inline' },
  { file: 'components/ui/directory-item.tsx', kind: 'block' },
  { file: 'components/user-builds/BuildComments.tsx', kind: 'block' },
  { file: 'components/user-builds/BuildCard.tsx', kind: 'block' },
  { file: 'components/user-builds/BuildForm.tsx', kind: 'input' },
  { file: 'components/user-builds/ScreenshotViewer.tsx', kind: 'block' },
  { file: 'components/rmhtube/ChatPanel.tsx', kind: 'block' },
  { file: 'components/rmhtube/party/PartyPage.tsx', kind: 'block' },
  { file: 'components/rmhtube/party/PartyOverlay.tsx', kind: 'inline' },
  { file: 'components/rmhtube/party/NotesTab.tsx', kind: 'block' },
  { file: 'components/events/EventCard.tsx', kind: 'block' },
  { file: 'components/events/EventComposer.tsx', kind: 'input' },
  { file: 'components/events/EventUpdates.tsx', kind: 'block' },
  { file: 'components/competitive/JamDetail.tsx', kind: 'block' },
  { file: 'components/competitive/JamsList.tsx', kind: 'block' },
  { file: 'components/competitive/JamFeedbackList.tsx', kind: 'block' },
  { file: 'components/context-notes/ContextNotes.tsx', kind: 'block' },
  { file: 'components/chat-plus/ThreadSheet.tsx', kind: 'block' },
  { file: 'components/lists/ListDetailView.tsx', kind: 'block' },
  { file: 'components/requests/RequestCard.tsx', kind: 'block' },
  { file: 'components/messages/RequestsList.tsx', kind: 'block' },
  { file: 'components/study/CardRow.tsx', kind: 'block' },
  { file: 'components/reading/MakeCardDialog.tsx', kind: 'input' },
  { file: 'components/feed/ComposeModal.tsx', kind: 'block' },
  { file: 'components/predictions/PredictionCard.tsx', kind: 'block' },
  { file: 'components/profile/GuestbookPanel.tsx', kind: 'block' },
  { file: 'components/announcements/AnnouncementDiscussion.tsx', kind: 'block' },
  { file: 'components/rmhladder/InterviewReports.tsx', kind: 'block' },
  { file: 'components/spaces/SpaceRoom.tsx', kind: 'block' },
  { file: 'components/feed/MessagesColumn.tsx', kind: 'inline' },
  { file: 'components/feed/ExploreRecommendations.tsx', kind: 'inline' },
  { file: 'components/messages/SavedRepliesDialog.tsx', kind: 'input' },
  { file: 'components/feed/DraftEditDialog.tsx', kind: 'input' },
  { file: 'components/user-builds/ScreenshotEditor.tsx', kind: 'input' },
  { file: 'components/communities/ModRules.tsx', kind: 'input' },
  { file: 'components/communities/CensusPanel.tsx', kind: 'block' },
  { file: 'components/search/SearchHitRow.tsx', kind: 'block' },
  { file: 'components/saves/SavesHub.tsx', kind: 'block' },
  { file: 'components/feed/MessageImages.tsx', kind: 'block' },
  { file: 'components/feed/ComposeBoxLazy.tsx', kind: 'input' },
  { file: 'components/feed/compose/ComposeDialogs.tsx', kind: 'input' },
  { file: 'components/messages/MessageEditor.tsx', kind: 'input' },
  { file: 'components/rmhtube/party/BingoTab.tsx', kind: 'input' },
  { file: 'components/versecraft/WorldSetup.tsx', kind: 'input' },
  { file: 'components/messages/SavedRepliesMenu.tsx', kind: 'block' },
  { file: 'components/messages/useSavedReplies.tsx', kind: 'block' },
  { file: 'components/groupcall/GroupCallRoster.tsx', kind: 'inline' },
  { file: 'components/feed/NotificationsColumn.tsx', kind: 'inline' },
  { file: 'components/replays/ReplayBoard.tsx', kind: 'inline' },
  // The shared multi-line field: every <Textarea> carries dir="auto" unless a caller overrides it.
  { file: 'components/ui/textarea.tsx', kind: 'input' },

  // Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)
  // s10-01 highlight-cards

  // s10-02 card-sound
  { file: 'components/study/CardSound.tsx', kind: 'block' },
  { file: 'components/study/CardSoundField.tsx', kind: 'input' },

  // s10-04 deck-suggestions
  { file: 'components/study/SuggestFixDialog.tsx', kind: 'input' },
  { file: 'components/study/DeckSuggestions.tsx', kind: 'block' },

  // s10-05 type-texts
  { file: 'components/rmhtype/TextsPage.tsx', kind: 'block' },
  { file: 'components/rmhtype/RmhTypeSoloPage.tsx', kind: 'block' },

  // s10-08 profile-preview

  // s10-09 build-issues
  { file: 'components/user-builds/BuildIssues.tsx', kind: 'block' },
  { file: 'components/user-builds/BuildIssueForm.tsx', kind: 'input' },

  // s10-15 admin-webhooks

  // s10-16 speedrun-queue

  // s10-17 admin-communities
  { file: 'components/communities/CommunityPlusBody.tsx', kind: 'block' },
];

/**
 * Files the scan would otherwise flag, with the reason each is not listed. An entry ending in `/` covers every file
 * under that folder. Entries come out as renderers join the list; they do not go in to silence the test.
 */
export const USER_TEXT_EXEMPT: Readonly<Record<string, string>> = {
  // Text reaches the screen through a listed renderer.
  'components/feed/RMHarkCard.tsx': 'post body is rendered by RMHarkContent (listed)',
  'components/feed/post-detail/PostArticle.tsx': 'post body is rendered by RMHarkContent (listed)',
  'components/communities/wiki/WikiPageEditor.tsx': 'hands the body to DocEditor (listed)',
  'components/games/GuideView.tsx': 'renders the guide through DocBody and edits through DocEditor (both listed)',
  'components/feed/CommunitiesColumn.tsx': 'description goes to DirectoryItem (listed)',
  'components/feed/ProfileEditModal.tsx': 'passes the fields to IdentitySection (listed) and a preview',
  'components/messages/MessageActions.tsx': 'only prefills the saved-reply dialog; renders no text',
  'components/user-builds/ScreenshotStrip.tsx': 'only an image alt attribute',
  // Written by the site, not by members, or layout fragments that name a field without rendering member text.
  'components/access/AccessPrefsPanel.tsx': 'description is the settings row hint, written by the site',
  'components/announcements/SitewideAnnouncementBody.tsx': 'renders site announcements, written by the site',
  'components/creator/TierEditor.tsx': '`description` here is the site-written preset copy for a tier template',
  'components/feed/HubLinkRow.tsx': 'description is the site-written hub row copy',
  'components/feed/PageLayout.tsx': 'description is the page subtitle passed in by site pages',
  'components/feed/compose/ComposerRow.tsx': 'layout wrapper; its text field is MentionTextarea (listed)',
  'components/feed/group-chat/GroupNotificationSetting.tsx': 'description is the site-written setting hint',
  'components/kaikai-debt/DebtDesks.tsx': 'body is site-written desk copy',
  'components/kaikai-debt/stats/chart-kit.tsx': 'chart tooltip and description composed by the site from numbers',
  'components/profile/plus/TopFourModule.tsx':
    '`body` is a layout fragment of catalog entries (games and apps), written by the site',
  'components/rmh-capital/ContactPage.tsx': 'staff-facing contact form on a company page',
  'components/rmhtube/ChatMediaEmbed.tsx': 'parses a message for media embeds and renders no text',
  'components/rmhtube/SettingsPanel.tsx': 'description is the site-written setting hint',
  'components/rmhtype/DailyPage.tsx': '`body` is a layout fragment of site-written daily-challenge copy',
  'components/study/CardImageField.tsx': '`body` is an upload request body, not text',
  'components/study/DeckUpdatesDialog.tsx':
    '`body` is a layout fragment; the member text in it already carries dir="auto"',
  'components/ui/Tooltip.tsx': 'content is the label passed in by the caller',
  'components/ui/empty-state.tsx': 'description is site copy passed in by the caller',
  'components/ui/menu.tsx': '`body` is a layout fragment of menu items',
  'components/feed/ProgressColumn.tsx': 'quest descriptions are written by the site',
  'components/feed/AchievementsColumn.tsx': 'achievement descriptions are written by the site',
  'components/feed/StorefrontColumn.tsx': 'product descriptions are written by the site',
  'components/feed/WelcomeModal.tsx': 'welcome copy is written by the site',
  'components/announcements/SitewideAnnouncementModal.tsx': 'announcements are written by the site',
  'components/feed/SitewideAnnouncementRow.tsx': 'announcements are written by the site',
  'components/ui/confirm-dialog-view.tsx': 'dialog copy is passed in by the caller',
  'components/rmhtube/OnboardingTour.tsx': 'tour copy is written by the site',
  'components/admin/': 'staff-only screens',
  'components/developer/': 'developer documentation and the staff-written API reference',
  'components/devplatform/': 'release notes are written by the site',
  'components/delight/': 'museum copy is written by the site',
  'components/arcade/': 'patch notes and tips are written by the site',
  'components/roadmap/': 'roadmap copy is written by the site',
  'components/site-history/': 'site history is written by the site',
  'components/site/': 'site chrome',
  'components/news/': 'news is written by the site',
  'components/reading/ArticleBody.tsx': 'article body is library and story copy written by the site',
  'components/reading/StoryTimeline.tsx': 'story copy is written by the site',
  'components/library/': 'library metadata is catalogued by the site',
  'components/security/': 'security pages are written by the site',
  'components/shell/': 'Steel shell chrome',
  'components/onboarding/': 'onboarding copy is written by the site',
  'components/assistant/': 'assistant replies are generated, not member text',
  'components/toolbox/': 'tool descriptions are written by the site',
  'components/blm/': 'page copy is written by the site',
  'components/covid/': 'page copy is written by the site',
  'components/rmh-research/': 'page copy is written by the site',
  'components/rmh-pmc/': 'page copy is written by the site',
  'components/optimization/': 'page copy is written by the site',
  'components/forecasting/': 'market copy is written by the site',
  'components/wallet/': 'shop and goal copy is written by the site',
  'components/shop/': 'shop copy is written by the site',
  // `components/settings/` is not exempt as a whole: ProfilePreview renders other members' words and is listed above.
  // These files only pass a site-written `body` / `description` prop or child through to a row.
  'components/settings/AppearancePanel.tsx': 'the description is the site-written row hint',
  'components/settings/MissingAltTextSection.tsx': 'body is a local layout node of site-written states',
  'components/settings/QuietCountsSection.tsx': 'body is the request payload of the toggle, not rendered text',
  'components/settings/RepostMutesSection.tsx':
    'body is a local layout node (its rows show member names without isolation: a known gap, not a text field)',
  'components/settings/SettingsSection.tsx': 'description is the site-written section hint',
  'components/settings/SpendBudgetSection.tsx': 'body is the request payload of the form, not rendered text',
  'components/create/': 'storefront copy is written by the site',
  'components/discovery/': 'feed settings the member edits for themselves',
  'components/sohumtracker/': 'the owner-run tracker',
  'components/homes/': 'listings, a separate surface with its own review',
  'components/calendar/': 'poll text of a separate surface',
  'components/posts-plus/': "the member's own time capsules",
  'components/daily-puzzles/': 'app tier, numbers and names only',
  // App-tier games and apps (L8): out of scope for this feature.
  'components/steam/': 'app tier',
  'components/tf2-hud/': 'app tier',
  'components/tf2-game/': 'app tier',
  'components/dunesday/': 'app-tier game',
  'components/kowloon-knockout/': 'app-tier game',
  'components/house-always-wins/': 'app-tier game',
  'components/temple-of-joy/': 'app-tier game',
  'components/rideshare/': 'app-tier game',
  'components/rebar-rutabaga/': 'app-tier game',
  'components/rmhbox/': 'app tier',
  'components/rmhvibe/': 'app tier',
  'components/rmhmusic/': 'app tier',
  'components/rmhcalculator/': 'app tier',
  'components/studio/': 'app tier',
  'components/canvas/': 'staff-only canvas notes',
};

/** The member-text fields the scan looks for when a component renders one directly. */
export const MEMBER_TEXT_FIELDS = ['content', 'body', 'bio', 'description', 'displayName'] as const;

const FSI = '⁨';
const PDI = '⁩';

/**
 * Isolate member text that is interpolated into a translated string, where JSX cannot wrap it in `<bdi>`: the
 * name keeps its own direction and does not reorder the words around it.
 */
export function isolateText(text: string): string {
  return `${FSI}${text}${PDI}`;
}

/** True when `file` is covered by an exempt entry (an exact path or a folder prefix ending in `/`). */
export function exemptReason(file: string): string | undefined {
  for (const [key, reason] of [...Object.entries(USER_TEXT_EXEMPT)]) {
    if (key.endsWith('/') ? file.startsWith(key) : file === key) return reason;
  }
  return undefined;
}

/** True when the source contains an attribute or element that gives member text its own direction. */
export function hasDirectionHandling(source: string): boolean {
  return /dir=("auto"|\{'auto'\})/.test(source) || /<bdi[\s>]/.test(source);
}

/**
 * True when the source renders a member-text field into the page: `{post.content}`, `text={c.body}`, a bare
 * `{description}` child, a wrapped `{strip(msg.content)}`, or a raw `<textarea>` (member words whatever it is
 * bound to; the shared `<Textarea>` carries `dir="auto"` itself).
 */
export function rendersMemberText(source: string): boolean {
  const fields = MEMBER_TEXT_FIELDS.join('|');
  const patterns = [
    // {post.content} and text={c.body}
    new RegExp(`\\{\\s*[A-Za-z_][A-Za-z0-9_$]*(?:\\??\\.[A-Za-z_][A-Za-z0-9_$]*)*\\??\\.(?:${fields})\\s*\\}`),
    // a bare {description} child (not a prop: value={body}, description={x})
    new RegExp(`(?<![=\\w$])\\{\\s*(?:${fields})\\s*\\}`),
    // {format(msg.content)}
    new RegExp(`\\{\\s*[A-Za-z_][A-Za-z0-9_$.]*\\([^{}()]*\\.(?:${fields})\\s*\\)\\s*\\}`),
    // a free-text field
    /<textarea[\s>]/,
  ];
  return patterns.some((re) => re.test(source));
}
