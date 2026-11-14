<?php
/**
 * MediaWiki configuration for wiki.rmhstudios.com (docs/wiki.md).
 *
 * Baked into the image (deploy/mediawiki/Dockerfile) and checked in, so it
 * holds no secret. The wiki has no settings of its own: it reads the site's
 * DATABASE_URL and BETTER_AUTH_SECRET through env.php. Change the wiki's
 * behaviour here, rebuild the image and recreate the container; nothing is
 * edited by hand on the server.
 *
 * Who can do what, as on Wikipedia: everyone reads; anyone with an
 * rmhstudios.com account signs in (extension RMHStudiosLogin) and edits; site
 * admins are the wiki's administrators (delete, protect, block).
 */

if ( !defined( 'MEDIAWIKI' ) ) {
	exit;
}

require_once '/usr/local/lib/rmhstudios/env.php';

## Site
$wgSitename = 'RMH Studios Wiki';
$wgMetaNamespace = 'RMH_Studios_Wiki';
$wgLanguageCode = 'en';
$wgLocaltimezone = 'UTC';

## URLs: Wikipedia's /wiki/Page_title. Apache aliases /wiki to index.php
## (Dockerfile). TLS ends at Cloudflare, so the canonical server is https
## even though requests reach the container over plain http.
$wgServer = rtrim( rmhWikiEnv( 'WIKI_PUBLIC_URL', 'https://wiki.rmhstudios.com' ), '/' );
$wgCanonicalServer = $wgServer;
$wgScriptPath = '';
$wgArticlePath = '/wiki/$1';
$wgUsePathInfo = true;
$wgResourceBasePath = $wgScriptPath;

## Look: the classic Vector skin, which is Wikipedia's own. The logo and
## favicon come from the main site. The `svg` key is what makes the skin scale
## the logo into its 135px box; without it a large SVG is drawn at full size.
wfLoadSkin( 'Vector' );
$wgDefaultSkin = 'vector';
$wgLogos = [
	'1x' => 'https://rmhstudios.com/favicon.svg',
	'svg' => 'https://rmhstudios.com/favicon.svg',
	'icon' => 'https://rmhstudios.com/favicon.svg',
];
$wgFavicon = 'https://rmhstudios.com/favicon.svg';

## Extensions bundled with MediaWiki: templates with logic, footnotes, and the
## editing toolbar. RMHStudiosLogin is ours (extensions/RMHStudiosLogin).
wfLoadExtension( 'ParserFunctions' );
wfLoadExtension( 'Cite' );
wfLoadExtension( 'WikiEditor' );
wfLoadExtension( 'RMHStudiosLogin' );

## Database: the site's own Postgres database. Every wiki table is in the
## `mediawiki` schema, apart from the site's tables in `public`, so the site's
## migrations never see them and the nightly database backup includes them.
$rmhDatabase = rmhWikiDatabase();
$wgDBtype = 'postgres';
$wgDBserver = $rmhDatabase['host'];
$wgDBport = $rmhDatabase['port'];
$wgDBname = $rmhDatabase['name'];
$wgDBuser = $rmhDatabase['user'];
$wgDBpassword = $rmhDatabase['password'];
$wgDBssl = $rmhDatabase['ssl'];
$wgDBmwschema = 'mediawiki';
$wgDBprefix = '';
unset( $rmhDatabase );

## Caches: object cache in APCu (one container), sessions and parsed pages in
## the database so a restart does not sign anyone out.
$wgMainCacheType = CACHE_ACCEL;
$wgSessionCacheType = CACHE_DB;
$wgParserCacheType = CACHE_DB;
$wgMemCachedServers = [];

## Secrets, derived from the site's BETTER_AUTH_SECRET (env.php). Rotating that
## secret signs everyone out of the wiki too, and nothing else.
$wgSecretKey = rmhWikiKey( RMH_WIKI_SECRET_LABEL );
$wgAuthenticationTokenVersion = '1';

## Signing in: "Log in" goes to rmhstudios.com, which sends the reader back
## with a pass signed with this key (lib/wiki/sso.server.ts).
$wgRMHStudiosLoginSiteUrl = rtrim( rmhWikiEnv( 'BETTER_AUTH_URL', 'https://rmhstudios.com' ), '/' );
$wgRMHStudiosLoginKey = rmhWikiKey( RMH_WIKI_LOGIN_LABEL );

## The container keeps no state: no uploads, no outgoing mail, no files
## fetched from Wikimedia Commons. Pictures are linked, not stored.
$wgEnableUploads = false;
$wgUseInstantCommons = false;
$wgEnableEmail = false;
$wgEnableUserEmail = false;
$wgEmailAuthentication = false;
$wgUseImageMagick = false;
$wgDiff3 = '/usr/bin/diff3';

## Requests arrive from Apache on the host through the Docker bridge. Trusting
## that range lets MediaWiki read the visitor's address from X-Forwarded-For.
$wgCdnServersNoPurge = [ '127.0.0.1', '172.16.0.0/12' ];

## Permissions. Everyone reads. Accounts exist only through rmhstudios.com:
## nobody can sign up here, and the sign-in creates the account on first use.
## Signed-in readers edit, as on Wikipedia; anonymous visitors do not, so every
## edit belongs to a site account. Moving pages waits for autoconfirmed, which
## takes Wikipedia's 4 days and 10 edits (MediaWiki's own default is 0 and 0).
## Site admins hold `sysop` (delete, protect, block) and `interface-admin`.
$wgAutoConfirmAge = 4 * 86400;
$wgAutoConfirmCount = 10;
$wgGroupPermissions['*']['createaccount'] = false;
$wgGroupPermissions['*']['autocreateaccount'] = true;
foreach ( [ 'edit', 'createpage', 'createtalk', 'upload', 'reupload', 'reupload-shared' ] as $right ) {
	$wgGroupPermissions['*'][$right] = false;
}
foreach ( [ 'edit', 'createpage', 'createtalk', 'minoredit', 'applychangetags', 'changetags' ] as $right ) {
	$wgGroupPermissions['user'][$right] = true;
}
$moveRights = [ 'move', 'move-subpages', 'move-rootuserpages', 'move-categorypages' ];
foreach ( [ 'upload', 'reupload', 'reupload-shared', 'sendemail', ...$moveRights ] as $right ) {
	$wgGroupPermissions['user'][$right] = false;
}
foreach ( $moveRights as $right ) {
	$wgGroupPermissions['autoconfirmed'][$right] = true;
	$wgGroupPermissions['sysop'][$right] = true;
}
unset( $moveRights );

## Errors stay in the container's log; visitors see a generic page.
$wgShowExceptionDetails = false;
