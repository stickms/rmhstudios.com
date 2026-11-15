<?php

namespace MediaWiki\Extension\RMHStudiosOpenGraph;

use MediaWiki\Html\Html;
use MediaWiki\Output\Hook\BeforePageDisplayHook;
use MediaWiki\Output\Hook\OutputPageParserOutputHook;
use MediaWiki\Output\OutputPage;

/**
 * Wikipedia-style link previews (docs/wiki.md, "Link previews").
 *
 * A link to a page unfurls the way a Wikipedia link does: "Title - RMH Studios
 * Wiki" (the main page is just "RMH Studios Wiki"), the page's opening
 * sentences, the site name, and a 1200x630 card that rmhstudios.com draws for
 * the page (GET /api/og/wiki?page=…). The card reads the page from this wiki's
 * API, so it shows what the page says now.
 */
class Hooks implements OutputPageParserOutputHook, BeforePageDisplayHook {
	public const SITE_NAME = 'RMH Studios Wiki';
	/** Long enough for two or three sentences, short enough for every unfurler. */
	public const DESCRIPTION_CHARS = 280;
	private const PROPERTY = 'rmhOpenGraphDescription';

	/**
	 * Remember the page's opening text while its HTML is at hand. The first
	 * paragraph with real text in it, as Wikipedia's previews take it: tables,
	 * lists and headings before it are skipped, footnote markers dropped.
	 *
	 * @inheritDoc
	 */
	public function onOutputPageParserOutput( $outputPage, $parserOutput ): void {
		if ( $outputPage->getProperty( self::PROPERTY ) !== null ) {
			return;
		}
		$html = method_exists( $parserOutput, 'getRawText' )
			? $parserOutput->getRawText()
			: $parserOutput->getText();
		$outputPage->setProperty( self::PROPERTY, self::openingText( (string)$html ) );
	}

	/** @inheritDoc */
	public function onBeforePageDisplay( $out, $skin ): void {
		$title = $out->getTitle();
		if ( !$title || $out->getContext()->getActionName() !== 'view' ) {
			return;
		}
		$isMain = $title->isMainPage();
		$hasCard = !$isMain && !$title->isSpecialPage() && $title->exists();
		$siteUrl = rtrim( (string)$out->getConfig()->get( 'RMHStudiosOpenGraphSiteUrl' ), '/' );

		// The title the page shows ("Recent changes", a DISPLAYTITLE), not its
		// internal name ("Special:RecentChanges"), as Wikipedia's previews do.
		$shown = trim( html_entity_decode( strip_tags( $out->getPageTitle() ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		$pageTitle = $isMain ? self::SITE_NAME : ( $shown ?: $title->getPrefixedText() ) . ' - ' . self::SITE_NAME;
		// A page that does not exist has nothing to say; its "no text in this
		// page" notice is not a description.
		$description = $title->exists() || $title->isSpecialPage()
			? (string)( $out->getProperty( self::PROPERTY ) ?? '' )
			: '';
		if ( $description === '' && $isMain ) {
			$description = $out->msg( 'rmhstudiosopengraph-tagline' )->text();
		}
		$image = $siteUrl . '/api/og/wiki'
			. ( $hasCard ? '?' . http_build_query( [ 'page' => $title->getPrefixedText() ] ) : '' );

		$properties = [
			'og:type' => 'website',
			'og:site_name' => self::SITE_NAME,
			'og:title' => $pageTitle,
			'og:url' => $title->getCanonicalURL(),
			'og:locale' => 'en_US',
			'og:image' => $image,
			'og:image:type' => 'image/png',
			'og:image:width' => '1200',
			'og:image:height' => '630',
			'og:image:alt' => $pageTitle,
		];
		$names = [
			'twitter:card' => 'summary_large_image',
			'twitter:title' => $pageTitle,
			'twitter:image' => $image,
		];
		if ( $description !== '' ) {
			$properties['og:description'] = $description;
			$names['twitter:description'] = $description;
			$names['description'] = $description;
		}
		self::addMeta( $out, 'property', $properties );
		self::addMeta( $out, 'name', $names );
	}

	/**
	 * @param OutputPage $out
	 * @param string $attribute `property` (Open Graph) or `name` (Twitter, description)
	 * @param array<string,string> $tags
	 */
	private static function addMeta( OutputPage $out, string $attribute, array $tags ): void {
		foreach ( $tags as $key => $content ) {
			$out->addHeadItem(
				"rmh-og-$key",
				Html::element( 'meta', [ $attribute => $key, 'content' => $content ] )
			);
		}
	}

	/** The first paragraph with at least a short sentence in it, as plain text. Pure. */
	public static function openingText( string $html ): string {
		if ( !preg_match_all( '#<p\b[^>]*>(.*?)</p>#si', $html, $paragraphs ) ) {
			return '';
		}
		foreach ( $paragraphs[1] as $paragraph ) {
			// Footnote markers ([1]) and the hidden edit-section links go first.
			$paragraph = preg_replace( '#<sup\b[^>]*class="[^"]*reference[^"]*"[^>]*>.*?</sup>#si', '', $paragraph );
			$text = html_entity_decode( strip_tags( (string)$paragraph ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			$text = trim( (string)preg_replace( '/\s+/u', ' ', $text ) );
			if ( mb_strlen( $text ) >= 20 ) {
				return self::clip( $text, self::DESCRIPTION_CHARS );
			}
		}
		return '';
	}

	/** Cut at a word boundary, with an ellipsis when anything was cut. Pure. */
	public static function clip( string $text, int $max ): string {
		if ( mb_strlen( $text ) <= $max ) {
			return $text;
		}
		$cut = mb_substr( $text, 0, $max - 1 );
		$space = mb_strrpos( $cut, ' ' );
		if ( $space !== false && $space > $max / 2 ) {
			$cut = mb_substr( $cut, 0, $space );
		}
		return rtrim( $cut, " ,;:.-" ) . '…';
	}
}
