/* global mw, $, AbortController, fetch, TextDecoder -- MediaWiki and browser globals; this runs on the wiki, not the site */
/**
 * "Edit with AI" on the edit page (docs/wiki.md).
 *
 * The reader says what the page should say (its sections, facts, tone) or what
 * to change, and the assistant on rmhstudios.com (POST /api/wiki/assist) writes
 * the whole page in wikitext. It streams into the edit box as it is written.
 * Nothing is saved: the reader reads it, fixes it and presses Save changes, or
 * presses Undo to get the text back as it was.
 *
 * The request goes to rmhstudios.com with the reader's site session cookie
 * (the wiki and the site are the same site, so the browser sends it); the site
 * answers this origin with CORS headers. Every refusal it can give (signed out,
 * allowance used, too many requests) arrives as a status this script explains.
 */
( function () {
	'use strict';

	const config = mw.config.get( 'wgRMHStudiosAssist' );
	const $box = $( '#wpTextbox1' );
	if ( !config || !$box.length ) {
		return;
	}
	const endpoint = config.siteUrl + '/api/wiki/assist';

	let controller = null;
	let before = null;

	const $open = $( '<button>' )
		.attr( { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'rmh-assist-panel' } )
		.addClass( 'cdx-button rmh-assist-open' )
		.text( mw.msg( 'rmhstudiosassist-open' ) );

	const $instruction = $( '<textarea>' )
		.attr( { id: 'rmh-assist-instruction', rows: 4, maxlength: 4000 } )
		.addClass( 'cdx-text-area__textarea' );
	const $write = $( '<button>' )
		.attr( 'type', 'button' )
		.addClass( 'cdx-button cdx-button--action-progressive cdx-button--weight-primary' );
	const $stop = $( '<button>' )
		.attr( 'type', 'button' )
		.addClass( 'cdx-button' )
		.text( mw.msg( 'rmhstudiosassist-stop' ) )
		.hide();
	const $undo = $( '<button>' )
		.attr( 'type', 'button' )
		.addClass( 'cdx-button cdx-button--weight-quiet' )
		.text( mw.msg( 'rmhstudiosassist-undo' ) )
		.hide();
	const $status = $( '<p>' ).addClass( 'rmh-assist-status' ).attr( { role: 'status', 'aria-live': 'polite' } );

	const $panel = $( '<div>' )
		.attr( 'id', 'rmh-assist-panel' )
		.addClass( 'rmh-assist-panel' )
		.append(
			$( '<label>' ).attr( 'for', 'rmh-assist-instruction' ).text( mw.msg( 'rmhstudiosassist-label' ) ),
			$( '<div>' ).addClass( 'cdx-text-area' ).append( $instruction ),
			$( '<div>' ).addClass( 'rmh-assist-actions' ).append( $write, $stop, $undo ),
			$status
		)
		.hide();

	const $root = $( '<div>' ).addClass( 'rmh-assist' ).append( $open, $panel );

	function text() {
		return $box.textSelection( 'getContents' );
	}

	function setText( value ) {
		$box.textSelection( 'setContents', value );
	}

	function note( message ) {
		$status.removeClass( 'rmh-assist-error' ).text( message );
	}

	function fail( message, $extra ) {
		$status.addClass( 'rmh-assist-error' ).text( message );
		if ( $extra ) {
			$status.append( ' ', $extra );
		}
	}

	/** Labels follow the box: an empty page is written, a full one revised. */
	function refresh() {
		const empty = text().trim() === '';
		$write.text( mw.msg( empty ? 'rmhstudiosassist-write' : 'rmhstudiosassist-revise' ) );
		$instruction.attr(
			'placeholder',
			mw.msg( empty ? 'rmhstudiosassist-placeholder-new' : 'rmhstudiosassist-placeholder-edit' )
		);
		$write.prop( 'disabled', controller !== null || $instruction.val().trim() === '' );
	}

	function setWriting( writing ) {
		$box.prop( 'readonly', writing );
		$instruction.prop( 'disabled', writing );
		$stop.toggle( writing );
		$write.toggle( !writing );
		refresh();
	}

	/** What a refusal means to the reader. */
	function explain( code ) {
		if ( code === 401 || code === 'UNAUTHORIZED' ) {
			const $link = $( '<a>' )
				.attr( { href: config.siteUrl + '/login', target: '_blank', rel: 'noopener' } )
				.text( mw.msg( 'rmhstudiosassist-error-signin-link' ) );
			fail( mw.msg( 'rmhstudiosassist-error-signin' ), $link );
		} else if ( code === 402 || code === 'AI_BUDGET_EXCEEDED' ) {
			fail( mw.msg( 'rmhstudiosassist-error-budget' ) );
		} else if ( code === 403 ) {
			fail( mw.msg( 'rmhstudiosassist-error-forbidden' ) );
		} else if ( code === 429 || code === 'RATE_LIMITED' ) {
			fail( mw.msg( 'rmhstudiosassist-error-rate' ) );
		} else if ( code === 503 || code === 'AI_UNAVAILABLE' ) {
			fail( mw.msg( 'rmhstudiosassist-error-offline' ) );
		} else {
			fail( mw.msg( 'rmhstudiosassist-error-failed' ) );
		}
	}

	async function write() {
		const instruction = $instruction.val().trim();
		if ( !instruction || controller ) {
			return;
		}
		before = text();
		controller = new AbortController();
		setWriting( true );
		$undo.hide();
		note( mw.msg( 'rmhstudiosassist-writing' ) );

		let written = '';
		let failure = null;
		try {
			const res = await fetch( endpoint, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( {
					instruction: instruction,
					title: mw.config.get( 'wgTitle' ) || '',
					content: before
				} ),
				signal: controller.signal
			} );
			if ( !res.ok || !res.body ) {
				failure = res.status;
			} else {
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';
				let done = false;
				while ( !done ) {
					const chunk = await reader.read();
					if ( chunk.done ) {
						break;
					}
					buffer += decoder.decode( chunk.value, { stream: true } );
					let end = buffer.indexOf( '\n\n' );
					while ( end >= 0 ) {
						const frame = buffer.slice( 0, end );
						buffer = buffer.slice( end + 2 );
						end = buffer.indexOf( '\n\n' );
						if ( frame.indexOf( 'data: ' ) !== 0 ) {
							continue;
						}
						const data = frame.slice( 6 );
						if ( data === '[DONE]' ) {
							done = true;
							break;
						}
						const payload = JSON.parse( data );
						if ( payload.error ) {
							failure = payload.error;
							done = true;
							break;
						}
						if ( payload.delta ) {
							written += payload.delta;
							setText( written );
						}
					}
				}
			}
		} catch ( err ) {
			failure = err && err.name === 'AbortError' ? 'stopped' : 'network';
		}

		controller = null;
		setWriting( false );
		if ( written.trim() === '' ) {
			// Nothing usable arrived: put the page back exactly as it was.
			setText( before );
			if ( failure === null ) {
				fail( mw.msg( 'rmhstudiosassist-error-empty' ) );
			} else if ( failure !== 'stopped' ) {
				explain( failure );
			} else {
				note( '' );
			}
			return;
		}
		$undo.show();
		if ( failure === null ) {
			// The next request is a revision, in new words; a failed one stays
			// in the box to try again.
			$instruction.val( '' );
			refresh();
		}
		const $summary = $( '#wpSummary' );
		if ( $summary.length && $summary.val().trim() === '' ) {
			$summary.val( mw.msg( 'rmhstudiosassist-summary' ) );
		}
		if ( failure !== null && failure !== 'stopped' ) {
			explain( failure );
		} else {
			note( mw.msg( 'rmhstudiosassist-done' ) );
		}
	}

	$open.on( 'click', () => {
		const opening = !$panel.is( ':visible' );
		$panel.toggle( opening );
		$open.attr( 'aria-expanded', String( opening ) );
		$open.text( mw.msg( opening ? 'rmhstudiosassist-close' : 'rmhstudiosassist-open' ) );
		if ( opening ) {
			refresh();
			if ( !$status.text() ) {
				note( mw.msg( 'rmhstudiosassist-note' ) );
			}
			$instruction.trigger( 'focus' );
		}
	} );
	$instruction.on( 'input', refresh );
	$instruction.on( 'keydown', ( e ) => {
		// Ctrl/Cmd+Enter writes, as in a chat box; Enter alone is a new line.
		if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
			e.preventDefault();
			write();
		}
	} );
	$write.on( 'click', write );
	$stop.on( 'click', () => {
		if ( controller ) {
			controller.abort();
		}
	} );
	$undo.on( 'click', () => {
		if ( before !== null ) {
			setText( before );
			before = null;
			$undo.hide();
			note( '' );
			refresh();
		}
	} );

	// Above the editor: before WikiEditor's toolbar and box once it has built
	// them, and before the bare textarea until then.
	function place() {
		const $ui = $box.closest( '.wikiEditor-ui' );
		( $ui.length ? $ui : $box ).before( $root );
	}
	place();
	mw.hook( 'wikiEditor.toolbarReady' ).add( place );
}() );
