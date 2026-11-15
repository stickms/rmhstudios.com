/**
 * Render this inside a page to take the docked globe off a phone (owner, 2026-11-14: "On mobile DMs remove the liquid
 * globe ... so that the text entry and stuff is at the bottom so we can read more messages"). A chat is a column whose
 * bottom edge is its message field; the docked globe sat on that edge, so the column stopped 130px short of the window
 * to clear it. With this marker the globe is not displayed below 1024px, `.site-main` drops the room it kept for it, and
 * the column runs to the bottom. The page carries its own way out (the chat header's back link to the inbox).
 *
 * Like <NoMargin />, it is a marker, not a hook: site-shell.css reads it with `:has()`, so the server HTML is already
 * the right frame and nothing shifts on hydration. Desktop is unchanged: the globe there sits in the sidebar.
 */
export function NoGlobe() {
  return <span hidden data-shell-globe="off" />;
}
