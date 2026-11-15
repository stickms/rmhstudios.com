<?php

namespace MediaWiki\Extension\RMHStudiosLogin;

/**
 * The sign-in pass rmhstudios.com hands the wiki: `base64url(json).base64url(hmac)`,
 * HMAC-SHA256 with a key both sides derive from BETTER_AUTH_SECRET. The site's half
 * is `lib/wiki/sso.server.ts`; the two must agree byte for byte, and
 * `lib/wiki/__tests__/sso.server.test.ts` holds a pass this class accepts.
 *
 * Payload: `v` (1), `sub` (site user id), `name` (site handle), `admin` (bool),
 * `state` (the value this wiki put in the visitor's session before sending them to
 * the site), `exp` (unix seconds).
 */
class Pass {
	/**
	 * The payload, or null when the pass is malformed, forged, expired or for
	 * another state. Pure: no MediaWiki services, so it can be checked from the
	 * command line.
	 *
	 * @return array{sub:string,name:string,admin:bool}|null
	 */
	public static function verify( string $pass, string $key, string $state, int $now ): ?array {
		if ( $key === '' || $state === '' ) {
			return null;
		}
		$parts = explode( '.', $pass );
		if ( count( $parts ) !== 2 ) {
			return null;
		}
		[ $body, $signature ] = $parts;
		$expected = self::base64url( hash_hmac( 'sha256', $body, $key, true ) );
		if ( !hash_equals( $expected, $signature ) ) {
			return null;
		}
		$json = base64_decode( strtr( $body, '-_', '+/' ), true );
		$data = $json === false ? null : json_decode( $json, true );
		if ( !is_array( $data )
			|| ( $data['v'] ?? null ) !== 1
			|| !is_string( $data['sub'] ?? null ) || $data['sub'] === ''
			|| !is_string( $data['name'] ?? null ) || $data['name'] === ''
			|| !is_bool( $data['admin'] ?? null )
			|| !is_string( $data['state'] ?? null )
			|| !is_int( $data['exp'] ?? null )
		) {
			return null;
		}
		if ( $data['exp'] < $now || !hash_equals( $state, $data['state'] ) ) {
			return null;
		}
		return [ 'sub' => $data['sub'], 'name' => $data['name'], 'admin' => $data['admin'] ];
	}

	public static function base64url( string $bytes ): string {
		return rtrim( strtr( base64_encode( $bytes ), '+/', '-_' ), '=' );
	}
}
