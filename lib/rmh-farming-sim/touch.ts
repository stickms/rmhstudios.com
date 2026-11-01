/**
 * Virtual-stick state for the farm. A plain mutable object (not store state) so
 * a touch stream never re-renders React; `LocalController` reads it per frame.
 */
export const farmTouch = {
    /** -1 (west) … 1 (east). */
    dx: 0,
    /** -1 (north) … 1 (south). */
    dz: 0,
};

export function resetFarmTouch(): void {
    farmTouch.dx = 0;
    farmTouch.dz = 0;
}

/** True on phones/tablets, where there is no keyboard to walk with. */
export function farmUsesTouch(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}
