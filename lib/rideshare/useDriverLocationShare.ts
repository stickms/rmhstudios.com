'use client';

import { useEffect, useState } from 'react';

/**
 * While `active` is true, watches the device GPS and posts the driver's
 * position to the location heartbeat endpoint (throttled to ~every 8s). Used by
 * the driver during a live trip so the rider can track their approach.
 *
 * Returns the permission/availability state so the UI can prompt the driver.
 */
export function useDriverLocationShare(active: boolean): 'idle' | 'sharing' | 'denied' | 'unavailable' {
  const [state, setState] = useState<'idle' | 'sharing' | 'denied' | 'unavailable'>('idle');

  useEffect(() => {
    if (!active) {
      setState('idle');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unavailable');
      return;
    }

    let lastSent = 0;
    const send = (lat: number, lng: number) => {
      const now = Date.now();
      if (now - lastSent < 8000) return;
      lastSent = now;
      fetch('/api/rideshare/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      }).catch(() => {});
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState('sharing');
        send(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active]);

  return state;
}
