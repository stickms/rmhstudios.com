'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { loadFromServer } from '@/lib/temple-of-joy/persistence';
import type { SaveData } from '@/lib/temple-of-joy/types';
import { TempleOfJoyGame } from './TempleOfJoyGame';

// ─── Shared theme tokens ──────────────────────────────────────────────────────
const BG = '#1a120b';
const SURFACE = '#2c1d12';
const BORDER = '#6b4c2a';
const TEXT = '#e8d5b0';
const GOLD = '#d4a847';
const GOLD_DIM = '#a07830';

// ─── Loading Screen ───────────────────────────────────────────────────────────
function TempleLoadingScreen() {
  return (
    <div
      className="h-screen flex flex-col items-center justify-center gap-6"
      style={{ background: BG, color: TEXT }}
    >
      <h1
        className="text-4xl font-bold tracking-widest animate-pulse"
        style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: GOLD }}
      >
        Temple of Joy
      </h1>
      <p className="text-sm opacity-50 tracking-[0.3em] uppercase animate-pulse">
        Entering the temple…
      </p>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function TempleLoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDiscord = async () => {
    setLoading(true);
    await authClient.signIn.social({
      provider: 'discord',
      callbackURL: '/temple-of-joy',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await authClient.signUp.email(
          { email, password, name, callbackURL: '/temple-of-joy' } as Parameters<typeof authClient.signUp.email>[0],
          {
            onSuccess: () => { window.location.href = '/temple-of-joy'; },
            onError: (ctx) => { setError(ctx.error.message); setLoading(false); },
          }
        );
      } else {
        await authClient.signIn.email(
          { email, password, callbackURL: '/temple-of-joy' },
          {
            onSuccess: () => { window.location.href = '/temple-of-joy'; },
            onError: (ctx) => { setError(ctx.error.message); setLoading(false); },
          }
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: BG,
    border: `1px solid ${BORDER}`,
    color: TEXT,
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    width: '100%',
    outline: 'none',
  };

  const btnStyle: React.CSSProperties = {
    background: GOLD,
    color: BG,
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    width: '100%',
  };

  const discordStyle: React.CSSProperties = {
    background: '#5865F2',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  };

  return (
    <div
      className="h-screen flex flex-col items-center justify-center px-4"
      style={{ background: BG, color: TEXT }}
    >
      {/* Title */}
      <div className="text-center mb-8">
        <h1
          className="text-4xl font-bold tracking-wide mb-2"
          style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: GOLD }}
        >
          Temple of Joy
        </h1>
        <p className="text-sm opacity-50">Sign in to save your progress</p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
      >
        {/* Discord */}
        <button
          style={discordStyle}
          onClick={handleDiscord}
          disabled={loading}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 127.14 96.36" fill="currentColor">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
          Continue with Discord
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: BORDER }} />
          <span className="text-xs opacity-40">or</span>
          <div className="flex-1 h-px" style={{ background: BORDER }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button type="submit" style={btnStyle} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Mode toggle */}
        <p className="text-center text-xs opacity-50">
          {mode === 'login' ? (
            <>No account?{' '}
              <button
                onClick={() => { setMode('signup'); setError(null); }}
                className="underline hover:opacity-80"
                style={{ color: GOLD_DIM }}
                type="button"
              >
                Create one
              </button>
            </>
          ) : (
            <>Have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(null); }}
                className="underline hover:opacity-80"
                style={{ color: GOLD_DIM }}
                type="button"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs opacity-30 text-center">
        Your progress is saved to your account.
      </p>
    </div>
  );
}

// ─── Gate ─────────────────────────────────────────────────────────────────────
export function TempleOfJoyGate() {
  const session = authClient.useSession();
  // undefined = fetching, null = no save, SaveData = loaded
  const [saveData, setSaveData] = useState<SaveData | null | undefined>(undefined);

  const userId = session.data?.user?.id;

  useEffect(() => {
    if (!userId) return;
    setSaveData(undefined); // show loading while fetching
    loadFromServer()
      .then((data) => setSaveData(data ?? null))
      .catch(() => setSaveData(null)); // no save on error → fresh game
  }, [userId]);

  // Session still resolving, or logged in but save not yet fetched
  if (session.isPending || (userId && saveData === undefined)) {
    return <TempleLoadingScreen />;
  }

  // Not logged in
  if (!session.data?.user) {
    return <TempleLoginScreen />;
  }

  // Logged in + save resolved
  return <TempleOfJoyGame initialSaveData={saveData} />;
}
