/**
 * The one step that must run in <body> (it needs `document.body`): only
 * app/game routes paint the body — on the site tier the ground is <html>'s and
 * the body stays transparent so the fixed aurora layer behind the glass shows
 * (globals.css, "The page ground is the ROOT's"). Emitted as its own tiny
 * generated script (`PREPAINT_BODY_CODE`) at the top of <body>; it cannot fold
 * into the head script because `document.body` does not exist yet there.
 */
export function bodyStep(): void {
  const w =
    window as unknown as {
      __themeBg?: string;
    };
  if (
    w.__themeBg &&
    document.documentElement.classList.contains(
      'app-route',
    )
  )
    document.body.style.backgroundColor =
      w.__themeBg;
}
