/**
 * The Wikipedia look for wiki.rmhstudios.com.
 *
 * The wiki is deliberately NOT the main site: it has no Steel tokens, no site
 * shell and no shared stylesheet. It is Wiki.js with this CSS override, which
 * restyles the stock Wiki.js theme after Wikipedia's classic Vector skin: a
 * grey page, a white article bordered in pale blue, serif headings on hairline
 * rules, blue links, a boxed table of contents and bordered grey-header tables.
 *
 * `applyWikiAppearance()` (`./appearance.server.ts`) sends this string to
 * Wiki.js (Theme → CSS Override), where it is stored in the wiki's database
 * and served on every wiki page. Colours are Wikipedia's own, written as
 * literals on purpose: nothing here may follow a `--site-*` token, or a change
 * to the main site's palette would repaint the wiki.
 *
 * Selectors target Wiki.js 2.5's markup (Vuetify 2). Every rule is prefixed
 * with `#app` and marked `!important` because Vuetify's theme classes
 * (`.v-application .primary`, `.grey--text`) are themselves `!important` and
 * would otherwise win on specificity.
 */
export const WIKIPEDIA_CSS = `
/* ── Page ─────────────────────────────────────────────────────────────── */
#app.v-application {
  background: #f6f6f6 !important;
  color: #202122 !important;
  font-family: sans-serif !important;
}
#app.v-application a { color: #0645ad; }

/* ── Top bar: grey, not the black app bar ─────────────────────────────── */
#app .nav-header,
#app .nav-header .nav-header-inner,
#app .nav-header .v-toolbar__content {
  background: #f6f6f6 !important;
  color: #202122 !important;
}
#app .nav-header { border-bottom: 1px solid #a7d7f9 !important; }
#app .nav-header .v-toolbar__title,
#app .nav-header .v-toolbar__title .subheading {
  color: #000 !important;
  font-family: 'Linux Libertine', Georgia, Times, serif !important;
  font-size: 1.5rem !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
}
#app .nav-header .v-icon,
#app .nav-header .v-btn { color: #54595d !important; }
#app .nav-header .v-text-field .v-input__slot {
  background: #fff !important;
  border: 1px solid #a2a9b1 !important;
  border-radius: 2px !important;
  box-shadow: none !important;
  min-height: 34px !important;
}
#app .nav-header .v-text-field input,
#app .nav-header .v-text-field .v-label { color: #202122 !important; }
#app .nav-header .v-text-field input::placeholder { color: #72777d !important; }

/* ── Left sidebar: plain blue links on the grey page ──────────────────── */
#app nav.v-navigation-drawer,
#app nav.v-navigation-drawer.primary,
#app nav.v-navigation-drawer .v-list,
#app nav.v-navigation-drawer .blue,
#app nav.v-navigation-drawer .primary {
  background: #f6f6f6 !important;
  color: #202122 !important;
}
#app nav.v-navigation-drawer .v-navigation-drawer__border { background: transparent !important; }
#app nav.v-navigation-drawer .v-divider { border-color: #c8ccd1 !important; }
#app nav.v-navigation-drawer .v-list-item { min-height: 26px !important; }
#app nav.v-navigation-drawer .v-list-item__title {
  color: #0645ad !important;
  font-size: 0.8125rem !important;
  font-weight: 400 !important;
}
#app nav.v-navigation-drawer .v-list-item:hover .v-list-item__title { text-decoration: underline; }
#app nav.v-navigation-drawer .v-list-item::before { opacity: 0 !important; }
#app nav.v-navigation-drawer .v-subheader {
  border-bottom: 1px solid #c8ccd1;
  color: #54595d !important;
  font-size: 0.75rem !important;
  height: 26px !important;
  margin: 8px 12px 4px;
  padding: 0 !important;
}
#app nav.v-navigation-drawer .v-list-item__avatar,
#app nav.v-navigation-drawer .v-list-item__icon { display: none !important; }
#app nav.v-navigation-drawer .v-btn {
  background: #fff !important;
  border: 1px solid #a2a9b1 !important;
  box-shadow: none !important;
  color: #202122 !important;
}
#app nav.v-navigation-drawer .v-btn .v-icon { color: #54595d !important; }

/* ── Article: a white sheet with the pale blue edge ───────────────────── */
#app .v-main__wrap {
  background: #fff !important;
  border-left: 1px solid #a7d7f9;
}
#app .v-main__wrap > header.v-toolbar,
#app .v-main__wrap > .container.grey,
#app .v-main__wrap .page-header-section { background: #fff !important; }
#app .v-main__wrap > .v-divider { display: none !important; }
#app .v-main__wrap .breadcrumbs-nav .v-btn,
#app .v-main__wrap .breadcrumbs-nav .v-icon {
  color: #54595d !important;
  font-size: 0.75rem !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
}

/* Title: serif, on a rule. */
#app .page-header-headings .headline {
  border-bottom: 1px solid #a2a9b1;
  color: #000 !important;
  font-family: 'Linux Libertine', Georgia, Times, serif !important;
  font-size: 1.8rem !important;
  font-weight: 400 !important;
  line-height: 1.3 !important;
  padding-bottom: 2px;
}
#app .page-header-headings .caption {
  color: #54595d !important;
  font-size: 0.8125rem !important;
  padding-top: 4px;
}
#app .page-header-section .page-header-headings { padding: 12px 24px 0 0; }

/* Body text. */
#app .contents {
  color: #202122 !important;
  font-family: sans-serif !important;
  font-size: 0.875rem !important;
  line-height: 1.6 !important;
}
#app .contents p,
#app .contents li { font-size: 0.875rem !important; line-height: 1.6 !important; }
#app .contents h1,
#app .contents h2 {
  border-bottom: 1px solid #a2a9b1 !important;
  color: #000 !important;
  font-family: 'Linux Libertine', Georgia, Times, serif !important;
  font-weight: 400 !important;
  line-height: 1.3 !important;
  margin: 1em 0 0.25em !important;
  padding: 0 0 2px !important;
}
#app .contents h1 { font-size: 1.7rem !important; }
#app .contents h2 { font-size: 1.5rem !important; }
#app .contents h3,
#app .contents h4,
#app .contents h5,
#app .contents h6 {
  border: 0 !important;
  color: #000 !important;
  font-family: sans-serif !important;
  font-weight: 700 !important;
  margin: 0.8em 0 0.2em !important;
  padding: 0 !important;
}
#app .contents h3 { font-size: 1.2rem !important; }
#app .contents h4,
#app .contents h5,
#app .contents h6 { font-size: 1rem !important; }
/* Wiki.js draws its own gradient underline on headings. */
#app .contents h1::after,
#app .contents h2::after,
#app .contents h3::after { display: none !important; }
/* Plain disc bullets instead of Wiki.js's arrow markers. */
#app .contents ul:not(.tabset-tabs):not(.contains-task-list) {
  list-style: disc outside !important;
  padding-left: 1.6em !important;
}
#app .contents ul:not(.tabset-tabs):not(.contains-task-list) > li::before { display: none !important; }
#app .contents ul:not(.tabset-tabs):not(.contains-task-list) > li { padding-left: 0 !important; }
#app .contents a { color: #0645ad !important; text-decoration: none !important; }
#app .contents a:visited { color: #0b0080 !important; }
#app .contents a:hover { text-decoration: underline !important; }
#app .contents a.is-invalid-page { color: #ba0000 !important; }
#app .contents code {
  background: #f8f9fa !important;
  border: 1px solid #eaecf0 !important;
  border-radius: 2px !important;
  box-shadow: none !important;
  color: #000 !important;
  font-size: 0.8125rem !important;
  padding: 1px 4px !important;
}
#app .contents pre,
#app .contents pre.prismjs {
  background: #f8f9fa !important;
  border: 1px solid #eaecf0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  color: #000 !important;
}
#app .contents pre code,
#app .contents pre.prismjs code {
  background: transparent !important;
  border: 0 !important;
  color: #000 !important;
  padding: 0 !important;
  text-shadow: none !important;
}
#app .contents pre.prismjs .token { color: #000 !important; }
#app .contents blockquote {
  background: transparent !important;
  border: 0 !important;
  border-left: 4px solid #eaecf0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  color: #202122 !important;
  padding: 8px 32px !important;
}

/* Tables: the wikitable. */
#app .contents table {
  background: #f8f9fa !important;
  border: 1px solid #a2a9b1 !important;
  border-collapse: collapse !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  color: #202122 !important;
  display: table !important;
  margin: 1em 0 !important;
  width: auto !important;
}
#app .contents table th,
#app .contents table td {
  background: transparent !important;
  border: 1px solid #a2a9b1 !important;
  color: #202122 !important;
  font-size: 0.875rem !important;
  padding: 0.2em 0.5em !important;
}
#app .contents table th {
  background: #eaecf0 !important;
  font-weight: 700 !important;
  text-align: center !important;
}
#app .contents table tr:nth-child(even) td { background: transparent !important; }

/* ── Side cards: the boxed contents list ──────────────────────────────── */
#app .page-toc-card,
#app .page-tags-card,
#app .page-author-card,
#app .page-shortcuts-card {
  background: #f8f9fa !important;
  border: 1px solid #a2a9b1 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
#app .page-toc-card .v-list,
#app .page-shortcuts-card .v-toolbar { background: transparent !important; }
#app .page-toc-card .overline,
#app .page-tags-card .overline,
#app .page-author-card .overline {
  color: #202122 !important;
  font-size: 0.8125rem !important;
  font-weight: 700 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
}
#app .page-toc-card .v-list-item { min-height: 24px !important; }
#app .page-toc-card .v-list-item__title {
  color: #0645ad !important;
  font-size: 0.8125rem !important;
  font-weight: 400 !important;
}
#app .page-toc-card .v-list-item .v-icon { display: none !important; }
#app .page-toc-card .v-divider { display: none !important; }
#app .page-tags-card .v-chip,
#app .page-tags-card .v-chip.teal {
  background: #fff !important;
  border: 1px solid #a2a9b1 !important;
  border-radius: 2px !important;
  color: #0645ad !important;
}
#app .page-tags-card .v-chip .v-chip__content,
#app .page-tags-card .v-chip .teal--text { color: #0645ad !important; }
#app .page-tags-card .v-chip .v-icon { display: none !important; }
/* The icon-only "pages matching tags" chip is empty once icons are hidden. */
#app .page-tags-card .v-chip[aria-label] { display: none !important; }

/* ── Footer ───────────────────────────────────────────────────────────── */
#app footer.v-footer {
  background: #f6f6f6 !important;
  border-top: 1px solid #a7d7f9 !important;
  color: #54595d !important;
}
#app footer.v-footer .caption { color: #54595d !important; font-size: 0.75rem !important; }
`;
