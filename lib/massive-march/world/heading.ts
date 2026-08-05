/**
 * Massive March — the horizontal basis the player walks along.
 *
 * Movement is screen-relative: `moveY` is "toward where I am looking" and
 * `moveX` is "toward my right hand", for the keyboard and the touch stick
 * alike. Turning that into world space needs the camera-right axis, and the
 * sign of that axis is the one piece of this that is easy to get backwards and
 * impossible to notice in a type — which is exactly what shipped, and why it
 * lives here as a pure function with a test rather than inline in the frame
 * loop.
 */

/**
 * The camera-right axis for a horizontal facing, in world space.
 *
 * `right = forward × up` with up = +Y. In three.js' right-handed space a camera
 * at rest looks down −Z, and its right hand points along +X — so forward
 * `(0, −1)` must give right `(1, 0)`. Getting this backwards strafes you left
 * when you press D and, because the vector is still perpendicular and still
 * unit length, everything else about the walk looks completely normal.
 *
 * Takes and returns the horizontal components only; Y is always 0, because you
 * strafe across the hillside rather than into it.
 */
export function strafeAxis(forwardX: number, forwardZ: number): { x: number; z: number } {
  return { x: -forwardZ, z: forwardX };
}
