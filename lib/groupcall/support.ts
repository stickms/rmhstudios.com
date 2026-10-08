/**
 * The two things a caller needs to know about group-call media WITHOUT paying
 * for the mesh.
 *
 * Both of these used to live in `mesh.ts`, next to the machinery they describe,
 * which read well and cost every page on the site. `GroupCallButton` and
 * `VoiceRoomBanner` call `groupCallSupported()` to decide whether to render at
 * all, and both are reachable from route modules — and `routeTree.gen.ts`
 * imports every route module statically, so a top-level import in any one of
 * them lands in the entry chunk. A four-line feature detect was therefore
 * dragging a thousand lines of WebRTC onto the critical path of every page,
 * including pages that have no call UI on them.
 *
 * Splitting them out is what lets `mesh.ts` be reached only through a dynamic
 * import, from the one place that actually opens a peer connection.
 *
 * Keep this module free of imports. The moment it pulls in anything from
 * `mesh.ts`, the edge it exists to cut comes straight back.
 */

/** How a `getUserMedia` rejection should be read. */
export type MicrophoneFailure =
  /** The user (or a policy) refused the prompt. Show the permission hint. */
  | 'denied'
  /** There is no capture device, or the constraints cannot be met. */
  | 'missing'
  /** Anything else — a device already in exclusive use, an internal error. */
  | 'unknown';

/**
 * Classify a `getUserMedia` rejection.
 *
 * Knowledge about the DOM's error taxonomy rather than about the mesh, and
 * "denied" and "missing" want completely different copy: one is a permission
 * the user can grant, the other is a device they do not have.
 */
export function describeMicrophoneError(error: unknown): MicrophoneFailure {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    default:
      return 'unknown';
  }
}

/**
 * Can this browser hold a mesh leg at all?
 *
 * Checked before rendering any entry point, so a browser without WebRTC gets no
 * call affordance rather than one that fails when pressed.
 */
export function groupCallSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}
