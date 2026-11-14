/**
 * The pages a new wiki starts with. `seedStarterPages()` (`./seed.server.ts`)
 * creates each one whose title does not exist yet and never overwrites a page,
 * so these are a first draft for admins to edit on the wiki, not a source of
 * truth that is synced. The games and apps pages are written from the catalog
 * (`lib/catalog`), so they list what the site ships on the day of the seed.
 *
 * Wiki content, not site chrome: these strings are stored in MediaWiki as
 * wikitext and are not routed through `t()`.
 */
import { apps, games } from '@/lib/catalog';

export interface StarterPage {
  /** The page title, which is also its address: `Coins and memberships` is `/wiki/Coins_and_memberships`. */
  title: string;
  /** Wikitext. */
  content: string;
}

/** MediaWiki's default main page, which the installer creates with placeholder text. */
export const MAIN_PAGE = 'Main Page';

const SITE = 'https://rmhstudios.com';

/**
 * Catalog text as literal wikitext: the characters that would otherwise start
 * a link, a template, a table cell, a tag, bold or italics, or (on save) a
 * signature, become character references that render as themselves.
 */
export function escapeWikitext(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('[', '&#91;')
    .replaceAll(']', '&#93;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('|', '&#124;')
    .replaceAll('~', '&#126;')
    .replaceAll("''", "'&#39;")
    .replaceAll('__', '_&#95;');
}

interface Entry {
  title: string;
  description: string;
  longDescription: string;
  href: string;
  status?: string | undefined;
  unlisted?: boolean | undefined;
  hidden?: boolean | undefined;
}

/** What a visitor can find: not unlisted, not hidden. */
function listed(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => !e.unlisted && !e.hidden);
}

/** The section heading a catalog entry gets on the games and apps pages. */
export function entryHeading(e: Pick<Entry, 'title' | 'status'>): string {
  const status = e.status ? ` (${e.status})` : '';
  return `== ${escapeWikitext(e.title + status)} ==`;
}

function entrySections(entries: readonly Entry[]): string {
  return listed(entries)
    .map((e) => {
      const url = e.href.startsWith('http') ? e.href : `${SITE}${e.href}`;
      return [
        entryHeading(e),
        '',
        escapeWikitext(e.longDescription),
        '',
        `[${encodeURI(url)} Open ${escapeWikitext(e.title)}]`,
      ].join('\n');
    })
    .join('\n\n');
}

function entryTable(entries: readonly Entry[]): string {
  const rows = listed(entries).map(
    (e) => `|-\n| ${escapeWikitext(e.title)} || ${escapeWikitext(e.description)}`,
  );
  return ['{| class="wikitable"', '! Name !! What it is', ...rows, '|}'].join('\n');
}

const HOME = `__NOTOC__
Welcome to the RMH Studios wiki. This is the reference for [${SITE} rmhstudios.com]: what is on the site, how its parts work, and how to get the most out of them.

== Start here ==

* [[About RMH Studios]]: what the site is and how it is put together.
* [[Games]]: every browser game on the site.
* [[Apps]]: the full apps, from RMHTube to RMHLadder.
* [[RMHarks]]: the social feed.
* [[Coins and memberships]]: the site economy.
* [[Developer API]]: building on top of the site.
* [[Editing this wiki]]: how pages are written and kept up to date.

== About this wiki ==

Everyone can read the wiki. Pages are written and maintained by the RMH Studios admins. If something here is wrong or out of date, tell us on the site and we will fix it.
`;

const ABOUT = `RMH Studios is a single web platform at [${SITE} rmhstudios.com]. One account gives you a social feed, a library of browser games, a set of full apps, and a shared coin economy that runs through all of them.

== What is on the site ==

{| class="wikitable"
! Part !! What it is
|-
| [[RMHarks]] || The social feed: short posts, replies, reactions, communities and direct messages.
|-
| [[Games]] || ${listed(games).length} browser games, several of them multiplayer or 3D.
|-
| [[Apps]] || ${listed(apps).length} full apps for video, music, typing, study, code and more.
|-
| Blog, news and library || Long-form writing, site news and a media library.
|-
| [[Coins and memberships]] || A site-wide currency, a shop, and paid memberships.
|-
| [[Developer API]] || A scoped API for building your own tools on the site.
|}

== Accounts ==

You can sign in with Discord, GitHub, or an email and password, and add a passkey afterwards. One account covers the feed, every game and every app, so progress, coins and your profile travel with you.

== Languages ==

The site is available in 16 languages, including right-to-left layouts for Arabic and Urdu.

== How the site is built ==

The site is a React application rendered on the server, with realtime servers behind it for multiplayer games, chat and shared rooms. It runs in the browser on phones and desktops; there is nothing to install.
`;

const RMHARKS = `RMHarks is the social feed at the centre of [${SITE} rmhstudios.com]. A post on the feed is called an RMHark.

== What you can do ==

* '''Post.''' Write a short post, attach media, or schedule it for later.
* '''Reply and react.''' Reply to a post to start a thread, or add a reaction.
* '''Follow.''' Follow people to shape your timeline, and use Explore to find new posts and tags.
* '''Join communities.''' Communities are spaces with their own posts and members.
* '''Message.''' Send direct messages or talk in a group chat.
* '''Save.''' Bookmark posts to find them again, and organise people into lists.

== Writing help ==

The composer includes optional AI tools that can rewrite a draft, translate a post, or suggest hashtags. They are suggestions: nothing is posted until you post it.

== Staying safe ==

You can block or mute an account and report a post. Reports are reviewed by the RMH Studios moderators.
`;

const COINS = `Coins are the currency of [${SITE} rmhstudios.com]. They are earned by using the site and spent in its shop. Memberships are paid plans that add features on top of a free account.

== Coins ==

* '''Earning.''' Coins come from playing games, completing quests, keeping a streak and taking part in site events.
* '''Spending.''' The shop sells cosmetics for your profile and other items. Some games and features take a coin stake.
* '''Your balance.''' Your balance is shown on your profile, and every change to it is recorded in a ledger.

Coins are a site currency. They cannot be exchanged for money.

== Progression ==

Alongside coins, the site tracks experience points, quests, achievements, a battle pass and daily streaks. Each has its own page on the site that shows what you have done and what comes next.

== Memberships ==

A membership is a paid subscription, billed through Stripe. Members get extra features across the site, and some features, such as access to the [[Developer API]], need one. You can manage or cancel a membership from your account settings. A membership can also be given to someone else as a gift.
`;

const DEVELOPER_API = `The Developer API lets you read from and write to your own RMH Studios account from your own code. It lives under <code>/api/v1</code> and is managed from [${SITE}/developer the developer page].

== Keys ==

Every request carries an API key, in either header:

<pre>
Authorization: Bearer rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
</pre>

<pre>
X-API-Key: rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
</pre>

* A key acts as '''your''' account. It cannot act for anyone else.
* The key is shown once, when you create it. Store it somewhere safe and keep it out of public code.
* Each key has '''scopes''' that limit what it can do. Give a key only the scopes it needs.
* A key can have an expiry date, and can be rotated or revoked at any time from the developer page.

== What the API covers ==

* Reading and writing posts and other account data, within the key's scopes.
* '''Webhooks''', which send your server a signed request when something happens on your account.
* '''Pagination''', '''rate limits''', '''idempotency keys''' for safe retries, and a consistent error format.

== Full reference ==

The complete reference, with every endpoint, is in the developer documentation linked from [${SITE}/developer the developer page].
`;

const EDITING = `This wiki runs on [https://www.mediawiki.org MediaWiki], the software behind Wikipedia. Everyone can read it. Pages are created, edited and deleted by RMH Studios admins.

== How admins edit ==

Admins manage pages from the admin area of the main site, under '''Admin, Wiki'''. Signing in to rmhstudios.com as an admin is all that is needed; there is no second account for the wiki.

From there an admin can:

* create a page, choosing its title;
* edit a page's text, with a summary of what changed;
* delete a page;
* ask the writing assistant to draft a page or to change one.

Every save is a revision in the page's history, which shows who changed what and lets an edit be undone.

== The writing assistant ==

The editor has an assistant, powered by DeepSeek. Describe what you want ("write an overview of the battle pass", "tighten the introduction", "add a table of the keyboard shortcuts") and it writes the result into the editor. Nothing is saved until you save it, so read the draft and correct it first. The assistant does not know facts it was not given: it leaves a placeholder in square brackets where one is missing.

== Writing style ==

* Pages are written in wikitext, the markup Wikipedia uses.
* Start with one or two sentences that say what the page is about.
* Use <code><nowiki>== Heading ==</nowiki></code> for sections. The wiki shows the page title, so do not repeat it as a heading.
* Write plainly. Prefer a short list or a table to a long paragraph.
* Link to related wiki pages with <code><nowiki>[[Page title]]</nowiki></code>, and to the page on rmhstudios.com that the article is about.

== Titles ==

A page's title is also its address: the page "Coins and memberships" is at <code>/wiki/Coins_and_memberships</code>. Titles start with a capital letter and use spaces between words. A slash makes a sub-page, such as <code>Games/Balatro</code>.
`;

export const STARTER_PAGES: readonly StarterPage[] = [
  { title: MAIN_PAGE, content: HOME },
  { title: 'About RMH Studios', content: ABOUT },
  {
    title: 'Games',
    content: `Every game on [${SITE} rmhstudios.com] runs in the browser. Scores, progress and coins are saved to your account.\n\n${entryTable(games)}\n\n${entrySections(games)}\n`,
  },
  {
    title: 'Apps',
    content: `The apps on [${SITE} rmhstudios.com] are full tools in their own right, sharing one account with the rest of the site.\n\n${entryTable(apps)}\n\n${entrySections(apps)}\n`,
  },
  { title: 'RMHarks', content: RMHARKS },
  { title: 'Coins and memberships', content: COINS },
  { title: 'Developer API', content: DEVELOPER_API },
  { title: 'Editing this wiki', content: EDITING },
];
