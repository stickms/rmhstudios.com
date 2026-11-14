<?php
/**
 * MediaWiki configuration for wiki.rmhstudios.com (docs/wiki.md).
 *
 * Baked into the image (deploy/mediawiki/Dockerfile) and checked in, so it
 * holds no secret: the database password and the secret key come from the
 * container's environment (the `mediawiki` service in docker-compose.yml).
 * Change the wiki's behaviour here, rebuild the image and recreate the
 * container; nothing is edited by hand on the server.
 *
 * Who can do what: everyone reads, nobody signs up, and only sysops edit.
 * The sysops are the administrator created by `wiki-bootstrap` and, through
 * that administrator's bot password, rmhstudios.com's /admin/wiki.
 */

if ( !defined( 'MEDIAWIKI' ) ) {
	exit;
}

/** An environment variable, or the default; a required one stops the wiki if missing. */
function rmhWikiEnv( string $name, ?string $default = null ): string {
	$value = getenv( $name );
	if ( $value !== false && $value !== '' ) {
		return $value;
	}
	if ( $default === null ) {
		throw new RuntimeException( "$name is not set (docs/wiki.md)" );
	}
	return $default;
}

## Site
$wgSitename = 'RMH Studios Wiki';
$wgMetaNamespace = 'RMH_Studios_Wiki';
$wgLanguageCode = 'en';
$wgLocaltimezone = 'UTC';

## URLs: Wikipedia's /wiki/Page_title. Apache aliases /wiki to index.php
## (Dockerfile). TLS ends at Cloudflare, so the canonical server is https
## even though requests reach the container over plain http.
$wgServer = rmhWikiEnv( 'MEDIAWIKI_SERVER', 'https://wiki.rmhstudios.com' );
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
## editing toolbar for an administrator who edits on the wiki itself.
wfLoadExtension( 'ParserFunctions' );
wfLoadExtension( 'Cite' );
wfLoadExtension( 'WikiEditor' );

## Database: the wiki's own database on the host Postgres, next to the
## site's. The role owns the database; the tables live in the `mediawiki`
## schema.
$wgDBtype = 'postgres';
$wgDBserver = rmhWikiEnv( 'MEDIAWIKI_DB_HOST', 'host.docker.internal' );
$wgDBport = (int)rmhWikiEnv( 'MEDIAWIKI_DB_PORT', '5432' );
$wgDBname = rmhWikiEnv( 'MEDIAWIKI_DB_NAME', 'mediawiki' );
$wgDBuser = rmhWikiEnv( 'MEDIAWIKI_DB_USER', 'mediawiki' );
$wgDBpassword = rmhWikiEnv( 'MEDIAWIKI_DB_PASS' );
$wgDBmwschema = 'mediawiki';
$wgDBprefix = '';

## Caches: object cache in APCu (one container), sessions in the database so
## a restart does not sign out the site's bot session mid-edit.
$wgMainCacheType = CACHE_ACCEL;
$wgSessionCacheType = CACHE_DB;
$wgParserCacheType = CACHE_DB;
$wgMemCachedServers = [];

## Secrets. 64 hex characters (`openssl rand -hex 32`); changing it signs
## everyone out and invalidates bot sessions, nothing else.
$wgSecretKey = rmhWikiEnv( 'MEDIAWIKI_SECRET_KEY' );
$wgAuthenticationTokenVersion = '1';

## The container keeps no state: no uploads, no outgoing mail, no files
## fetched from Wikimedia Commons. Pictures are linked, not stored.
$wgEnableUploads = false;
$wgUseInstantCommons = false;
$wgEnableEmail = false;
$wgEnableUserEmail = false;
$wgEmailAuthentication = false;
$wgUseImageMagick = false;
$wgDiff3 = '/usr/bin/diff3';

## Requests arrive from Apache on the host through the Docker bridge and from
## the site's `web` container over the compose network. Trusting those ranges
## lets MediaWiki read the visitor's address from X-Forwarded-For.
$wgCdnServersNoPurge = [ '127.0.0.1', '172.16.0.0/12' ];

## Permissions. Reading is open; accounts, editing and moving are for sysops.
$wgGroupPermissions['*']['createaccount'] = false;
foreach ( [ '*', 'user', 'autoconfirmed' ] as $group ) {
	foreach ( [
		'edit', 'createpage', 'createtalk', 'move', 'move-subpages', 'move-rootuserpages',
		'move-categorypages', 'upload', 'reupload', 'reupload-shared', 'minoredit',
		'applychangetags', 'changetags', 'editcontentmodel', 'sendemail',
	] as $right ) {
		$wgGroupPermissions[$group][$right] = false;
	}
}
foreach ( [
	'edit', 'createpage', 'createtalk', 'move', 'move-subpages', 'move-rootuserpages',
	'move-categorypages', 'minoredit', 'applychangetags', 'changetags',
] as $right ) {
	$wgGroupPermissions['sysop'][$right] = true;
}

## Errors stay in the container's log; visitors see a generic page.
$wgShowExceptionDetails = false;
