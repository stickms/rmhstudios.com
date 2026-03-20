/**
 * RochCloud OAuth Callback
 *
 * Handles the SoundCloud OAuth redirect, exchanges the code for tokens,
 * stores them in the client-side store, and redirects to /rochcloud.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { getMe } from '@/lib/rochcloud/api';

export const Route = createFileRoute('/rochcloud/callback')({
  component: RochCloudCallback,
});

function RochCloudCallback() {
  const navigate = useNavigate();
  const setAuth = useRochCloudStore((s) => s.setAuth);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error || !code) {
      navigate({ to: '/rochcloud' });
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/rochcloud/callback?code=${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error('Token exchange failed');

        const data = await res.json();
        const { accessToken, expiresIn, refreshToken } = data;

        setAuth({
          isConnected: true,
          accessToken,
          expiresAt: Date.now() + expiresIn * 1000,
        });

        // Store refresh token in localStorage separately for security
        if (refreshToken) {
          localStorage.setItem('rochcloud_refresh_token', refreshToken);
        }

        // Fetch user profile
        try {
          const user = await getMe(accessToken);
          setAuth({ user });
        } catch {}

        navigate({ to: '/rochcloud' });
      } catch (err) {
        console.error('RochCloud auth error:', err);
        navigate({ to: '/rochcloud' });
      }
    })();
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500/20 border-t-orange-500" />
        <p className="text-sm text-white/60">Connecting to SoundCloud...</p>
      </div>
    </div>
  );
}
