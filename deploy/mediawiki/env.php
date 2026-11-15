<?php
/**
 * Everything the wiki reads from its environment, in one place, for
 * LocalSettings.php and the startup script (bootstrap.sh) alike. Installed at
 * /usr/local/lib/rmhstudios/env.php, outside the web root.
 *
 * The wiki needs no settings of its own. It reuses three the site already has:
 *
 *   DATABASE_DIRECT_URL or DATABASE_URL  the site's Postgres database; the wiki's
 *                                        tables live in their own `mediawiki`
 *                                        schema inside it
 *   BETTER_AUTH_SECRET                   the wiki's secret key and the sign-in
 *                                        pass key are derived from it
 *   BETTER_AUTH_URL                      where "Log in" sends readers
 *
 * and WIKI_PUBLIC_URL, optional, for the wiki's own address.
 */

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

/**
 * The site's database, as connection settings. DATABASE_DIRECT_URL comes first,
 * as for `prisma migrate`: once PgBouncer pools DATABASE_URL in transaction mode,
 * MediaWiki (which relies on session state such as its search_path) must not go
 * through it.
 *
 * @return array{host:string,port:int,name:string,user:string,password:string,ssl:bool}
 */
function rmhWikiDatabase(): array {
	$url = getenv( 'DATABASE_DIRECT_URL' ) ?: rmhWikiEnv( 'DATABASE_URL' );
	$parts = parse_url( $url );
	if ( !is_array( $parts ) || !isset( $parts['host'], $parts['user'], $parts['path'] ) ) {
		throw new RuntimeException( 'DATABASE_URL is not a postgresql:// URL' );
	}
	parse_str( $parts['query'] ?? '', $query );
	$host = $parts['host'];
	// Inside the container, localhost is the container. A URL written for a
	// process on the host (local development) means the host's Postgres.
	if ( in_array( $host, [ 'localhost', '127.0.0.1', '::1' ], true ) ) {
		$host = 'host.docker.internal';
	}
	return [
		'host' => $host,
		'port' => (int)( $parts['port'] ?? 5432 ),
		'name' => rawurldecode( ltrim( $parts['path'], '/' ) ),
		'user' => rawurldecode( $parts['user'] ),
		'password' => rawurldecode( $parts['pass'] ?? '' ),
		'ssl' => in_array( $query['sslmode'] ?? '', [ 'require', 'verify-ca', 'verify-full' ], true ),
	];
}

/**
 * A key for one purpose, derived from the site's auth secret. The label keeps
 * keys for different purposes unrelated; lib/wiki/sso.server.ts derives the
 * sign-in key with the same label.
 */
function rmhWikiKey( string $label ): string {
	return hash_hmac( 'sha256', $label, rmhWikiEnv( 'BETTER_AUTH_SECRET' ) );
}

const RMH_WIKI_SECRET_LABEL = 'rmhstudios wiki secret key v1';
const RMH_WIKI_LOGIN_LABEL = 'rmhstudios wiki sign-in v1';
