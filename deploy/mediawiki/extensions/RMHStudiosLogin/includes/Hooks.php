<?php

namespace MediaWiki\Extension\RMHStudiosLogin;

use MediaWiki\SpecialPage\Hook\SpecialPageBeforeExecuteHook;
use MediaWiki\SpecialPage\SpecialPage;

/**
 * The wiki has no passwords of its own for readers: "Log in" and "Create
 * account" both go to Special:RMHStudiosLogin, which signs in through
 * rmhstudios.com. The page someone was on comes along as `returnto`.
 */
class Hooks implements SpecialPageBeforeExecuteHook {
	/** @inheritDoc */
	public function onSpecialPageBeforeExecute( $special, $subPage ) {
		if ( !in_array( $special->getName(), [ 'Userlogin', 'CreateAccount' ], true ) ) {
			return true;
		}
		$request = $special->getRequest();
		$query = [];
		$returnTo = $request->getVal( 'returnto' );
		if ( $returnTo !== null && $returnTo !== '' ) {
			$query['returnto'] = $returnTo;
		}
		$special->getOutput()->redirect(
			SpecialPage::getTitleFor( 'RMHStudiosLogin' )->getFullURL( $query )
		);
		return false;
	}
}
