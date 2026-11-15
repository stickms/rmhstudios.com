<?php

namespace MediaWiki\Extension\RMHStudiosAssist;

use MediaWiki\Hook\EditPage__showEditForm_initialHook;

/**
 * Adds "Edit with AI" to the edit page of a wikitext page. The hook runs only
 * when the reader may edit the page (a protected page shows its source
 * instead), and only signed-in readers can edit this wiki, so everyone who sees
 * the button is signed in to rmhstudios.com, which runs the assistant.
 */
class Hooks implements EditPage__showEditForm_initialHook {
	/** @inheritDoc */
	public function onEditPage__showEditForm_initial( $editor, $out ) {
		if ( $editor->contentModel !== CONTENT_MODEL_WIKITEXT || !$out->getUser()->isRegistered() ) {
			return;
		}
		$siteUrl = rtrim( (string)$out->getConfig()->get( 'RMHStudiosAssistSiteUrl' ), '/' );
		if ( $siteUrl === '' ) {
			return;
		}
		$out->addJsConfigVars( 'wgRMHStudiosAssist', [ 'siteUrl' => $siteUrl ] );
		$out->addModules( 'ext.rmhstudiosAssist' );
	}
}
