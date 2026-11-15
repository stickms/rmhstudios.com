<?php

namespace MediaWiki\Extension\RMHStudiosLogin;

use MediaWiki\Auth\AbstractPrimaryAuthenticationProvider;
use MediaWiki\Auth\AuthenticationRequest;
use MediaWiki\Auth\AuthenticationResponse;
use StatusValue;

/**
 * Registers rmhstudios.com as a source of wiki accounts, so
 * `AuthManager::autoCreateUser()` accepts it (it only creates accounts for a
 * registered provider). It takes no part in the login form: signing in is
 * Special:RMHStudiosLogin, which checks the site's pass and then asks
 * AuthManager to create the account if needed and sign it in.
 */
class AuthProvider extends AbstractPrimaryAuthenticationProvider {
	/** @inheritDoc */
	public function getAuthenticationRequests( $action, array $options ) {
		return [];
	}

	/** @inheritDoc */
	public function beginPrimaryAuthentication( array $reqs ) {
		return AuthenticationResponse::newAbstain();
	}

	/** @inheritDoc */
	public function testUserExists( $username, $flags = self::READ_NORMAL ) {
		return false;
	}

	/** @inheritDoc */
	public function providerAllowsAuthenticationDataChange(
		AuthenticationRequest $req, $checkData = true
	) {
		return StatusValue::newGood( 'ignored' );
	}

	/** @inheritDoc */
	public function providerChangeAuthenticationData( AuthenticationRequest $req ) {
	}

	/** @inheritDoc */
	public function accountCreationType() {
		return self::TYPE_NONE;
	}

	/** @inheritDoc */
	public function beginPrimaryAccountCreation( $user, $creator, array $reqs ) {
		return AuthenticationResponse::newAbstain();
	}
}
