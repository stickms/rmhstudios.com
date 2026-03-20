'use client';

import { useEffect } from 'react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { useRochCloudPlayer } from '@/lib/rochcloud/player';
import { getMe } from '@/lib/rochcloud/api';
import RochCloudLanding from './RochCloudLanding';
import RochCloudMain from './RochCloudMain';

export default function RochCloudApp() {
  const auth = useRochCloudStore((s) => s.auth);
  const setAuth = useRochCloudStore((s) => s.setAuth);

  // Initialize player hooks
  useRochCloudPlayer();

  // On mount, validate token if we think we're connected
  useEffect(() => {
    if (!auth.isConnected || !auth.accessToken) return;

    // Check if token is expired
    if (auth.expiresAt && Date.now() > auth.expiresAt) {
      // Try refresh
      const refreshToken = localStorage.getItem('rochcloud_refresh_token');
      if (refreshToken) {
        fetch('/api/rochcloud/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.accessToken) {
              setAuth({ accessToken: data.accessToken, expiresAt: Date.now() + data.expiresIn * 1000 });
              if (data.refreshToken) localStorage.setItem('rochcloud_refresh_token', data.refreshToken);
            } else {
              setAuth({ isConnected: false, accessToken: null, user: null, expiresAt: null });
            }
          })
          .catch(() => {
            setAuth({ isConnected: false, accessToken: null, user: null, expiresAt: null });
          });
        return;
      }
      setAuth({ isConnected: false, accessToken: null, user: null, expiresAt: null });
      return;
    }

    // Validate & fetch user if missing
    if (!auth.user) {
      getMe(auth.accessToken)
        .then((user) => setAuth({ user }))
        .catch(() => {
          setAuth({ isConnected: false, accessToken: null, user: null, expiresAt: null });
        });
    }
  }, [auth.isConnected, auth.accessToken]);

  if (!auth.isConnected) {
    return <RochCloudLanding />;
  }

  return <RochCloudMain />;
}
