/**
 * Render this anywhere in a page to give it the two-column frame at every width (Steel L3): catalogue and settings
 * pages do. It is a marker, not a hook: site-shell.css reads it with `:has()`, so the server HTML is already the right
 * frame and nothing shifts on hydration. Renders nothing visible.
 */
export function NoMargin() {
  return <span hidden data-shell-margin="off" />;
}
