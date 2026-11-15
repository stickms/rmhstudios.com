<?php

namespace MediaWiki\Extension\RMHStudiosLogin;

use MediaWiki\Auth\AuthManager;
use MediaWiki\SpecialPage\UnlistedSpecialPage;
use MediaWiki\Title\Title;
use MediaWiki\User\Options\UserOptionsManager;
use MediaWiki\User\User;
use MediaWiki\User\UserFactory;
use MediaWiki\User\UserGroupManager;
use MediaWiki\User\UserNameUtils;
use Wikimedia\Rdbms\IConnectionProvider;

/**
 * Special:RMHStudiosLogin — sign in to the wiki with an rmhstudios.com account.
 *
 * 1. Without a pass: remember a random `state` and the page to return to in the
 *    visitor's (anonymous) wiki session, and send them to
 *    `<site>/api/wiki/sso?state=…`. The site signs them in if needed.
 * 2. The site sends them back here with `?pass=…`, signed for that state. A pass
 *    is accepted only in the browser that started the sign-in, once, and for two
 *    minutes, so a link with someone else's pass cannot sign you in as them.
 * 3. Find the wiki account linked to the site account (by the site's user id,
 *    stored as the `rmhstudios-id` preference), or create one named after the
 *    site handle; sign it in; make it a wiki administrator exactly when it is a
 *    site admin; and return to the page the visitor came from.
 */
class SpecialRMHStudiosLogin extends UnlistedSpecialPage {
	private const SESSION_KEY = 'rmhstudios-login';
	private const LINK_OPTION = 'rmhstudios-id';
	/** The wiki groups a site admin holds; anyone else holds none of them. */
	private const ADMIN_GROUPS = [ 'sysop', 'interface-admin' ];

	public function __construct(
		private readonly AuthManager $authManager,
		private readonly UserFactory $userFactory,
		private readonly UserNameUtils $userNameUtils,
		private readonly UserGroupManager $userGroupManager,
		private readonly UserOptionsManager $userOptionsManager,
		private readonly IConnectionProvider $connectionProvider,
	) {
		parent::__construct( 'RMHStudiosLogin' );
	}

	/** @inheritDoc */
	public function execute( $subPage ) {
		$this->setHeaders();
		$request = $this->getRequest();
		$output = $this->getOutput();
		$output->disableClientCache();

		$error = $request->getVal( 'error' );
		if ( $error === 'banned' || $error === 'noname' ) {
			$this->fail( "rmhstudioslogin-error-$error" );
			return;
		}

		$config = $this->getConfig();
		$siteUrl = rtrim( (string)$config->get( 'RMHStudiosLoginSiteUrl' ), '/' );
		$key = (string)$config->get( 'RMHStudiosLoginKey' );
		if ( $siteUrl === '' || $key === '' ) {
			$this->fail( 'rmhstudioslogin-error-unconfigured' );
			return;
		}

		$session = $request->getSession();
		$pass = $request->getVal( 'pass' );
		if ( $pass === null ) {
			if ( $this->getUser()->isRegistered() ) {
				$output->redirect( $this->returnUrl( $request->getVal( 'returnto' ) ) );
				return;
			}
			$state = bin2hex( random_bytes( 16 ) );
			$session->set( self::SESSION_KEY, [
				'state' => $state,
				'returnto' => (string)$request->getVal( 'returnto', '' ),
				'expires' => time() + 600,
			] );
			// An anonymous session is not written until asked; the state must
			// survive the round trip to the site.
			$session->persist();
			$output->redirect( $siteUrl . '/api/wiki/sso?' . http_build_query( [ 'state' => $state ] ) );
			return;
		}

		$pending = $session->get( self::SESSION_KEY );
		$session->remove( self::SESSION_KEY );
		if ( !is_array( $pending ) || ( $pending['expires'] ?? 0 ) < time() ) {
			$this->fail( 'rmhstudioslogin-error-expired' );
			return;
		}
		$claims = Pass::verify( $pass, $key, (string)( $pending['state'] ?? '' ), time() );
		if ( $claims === null ) {
			$this->fail( 'rmhstudioslogin-error-invalid' );
			return;
		}

		$user = $this->accountFor( $claims['sub'], $claims['name'] );
		if ( !$user ) {
			$this->fail( 'rmhstudioslogin-error-noname' );
			return;
		}
		$isNew = !$user->isRegistered();
		$status = $this->authManager->autoCreateUser( $user, AuthProvider::class, true );
		if ( !$status->isOK() ) {
			$output->setPageTitleMsg( $this->msg( 'rmhstudioslogin-error-title' ) );
			$output->addWikiMsg( 'rmhstudioslogin-error-create', $status->getWikiText() );
			return;
		}
		if ( $isNew ) {
			$this->userOptionsManager->setOption( $user, self::LINK_OPTION, $claims['sub'] );
			$this->userOptionsManager->saveOptions( $user );
		}
		$this->syncAdminGroups( $user, $claims['admin'] );

		$output->redirect( $this->returnUrl( $pending['returnto'] ?? null ) );
	}

	/**
	 * The wiki account for a site account: the one already linked to the site
	 * id, else a new (unsaved) one named after the handle. A handle whose wiki
	 * name is taken by someone else gets a number: "Alex", "Alex 2", "Alex 3".
	 */
	private function accountFor( string $siteId, string $handle ): ?User {
		$linked = $this->connectionProvider->getPrimaryDatabase()->newSelectQueryBuilder()
			->select( 'up_user' )
			->from( 'user_properties' )
			->where( [ 'up_property' => self::LINK_OPTION, 'up_value' => $siteId ] )
			->caller( __METHOD__ )
			->fetchField();
		if ( $linked ) {
			return $this->userFactory->newFromId( (int)$linked );
		}

		$base = $this->userNameUtils->getCanonical( $handle, UserNameUtils::RIGOR_CREATABLE );
		if ( $base === false ) {
			return null;
		}
		for ( $n = 1; $n < 100; $n++ ) {
			$name = $n === 1 ? $base : "$base $n";
			$candidate = $this->userFactory->newFromName( $name, UserFactory::RIGOR_CREATABLE );
			if ( $candidate && !$candidate->isRegistered() ) {
				return $candidate;
			}
		}
		return null;
	}

	private function syncAdminGroups( User $user, bool $isAdmin ): void {
		$current = $this->userGroupManager->getUserGroups( $user );
		foreach ( self::ADMIN_GROUPS as $group ) {
			$has = in_array( $group, $current, true );
			if ( $isAdmin && !$has ) {
				$this->userGroupManager->addUserToGroup( $user, $group );
			} elseif ( !$isAdmin && $has ) {
				$this->userGroupManager->removeUserFromGroup( $user, $group );
			}
		}
	}

	private function returnUrl( ?string $returnTo ): string {
		$title = $returnTo ? Title::newFromText( $returnTo ) : null;
		if ( !$title || $title->isExternal() || $title->isSpecial( 'RMHStudiosLogin' ) ) {
			$title = Title::newMainPage();
		}
		return $title->getFullURL();
	}

	private function fail( string $message ): void {
		$output = $this->getOutput();
		$output->setPageTitleMsg( $this->msg( 'rmhstudioslogin-error-title' ) );
		$output->addWikiMsg( $message );
	}
}
