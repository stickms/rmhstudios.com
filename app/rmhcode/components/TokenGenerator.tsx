import { useState, useEffect } from 'react';
import { Key, Copy, Check, RefreshCw, Trash2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Token {
  id: string;
  name: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
}

export default function TokenGenerator() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTokens();
  }, []);

  async function fetchTokens() {
    try {
      const res = await fetch('/api/rmhcode/auth/list');
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens);
      }
    } catch (e) {
      console.error('Failed to fetch tokens:', e);
    } finally {
      setLoading(false);
    }
  }

  async function generateToken() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/rmhcode/auth/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tokenName || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate token');
      }

      const data = await res.json();
      setNewToken(data.token);
      setTokenName('');
      fetchTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate token');
    } finally {
      setGenerating(false);
    }
  }

  async function revokeToken(tokenId: string) {
    try {
      const res = await fetch('/api/rmhcode/auth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      });

      if (res.ok) {
        setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      }
    } catch (e) {
      console.error('Failed to revoke token:', e);
    }
  }

  async function copyToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function isExpired(expiresAt: string) {
    return new Date(expiresAt) < new Date();
  }

  return (
    <div className="space-y-6">
      {/* Generate New Token */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Token name (optional)"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-site-bg border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
            maxLength={100}
          />
          <Button
            onClick={generateToken}
            disabled={generating}
            variant="accent"
            className="bg-violet-600 hover:bg-violet-500"
          >
            {generating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Key className="w-4 h-4 mr-2" />
                Generate Token
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* New Token Display */}
      {newToken && (
        <div className="p-4 rounded-lg bg-violet-500/10 border border-violet-500/30">
          <div className="flex items-center gap-2 text-sm text-violet-300 mb-2">
            <Check className="w-4 h-4" />
            Token generated! Copy it now - it won&apos;t be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 rounded bg-site-bg border border-site-border text-sm font-mono text-site-text break-all">
              {newToken}
            </code>
            <button
              onClick={copyToken}
              className="p-2 rounded-lg bg-site-surface hover:bg-site-surface-hover border border-site-border transition-colors shrink-0"
              aria-label="Copy token"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-site-text-muted" />
              )}
            </button>
          </div>
          <p className="text-xs text-site-text-dim mt-2">
            Run <code className="text-violet-400">rmhcode login --token YOUR_TOKEN</code> to authenticate.
          </p>
        </div>
      )}

      {/* Existing Tokens */}
      <div>
        <h3 className="text-sm font-medium text-site-text mb-3">Your Tokens</h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-site-surface-hover rounded-lg animate-pulse" />
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-site-text-dim py-4 text-center border border-dashed border-site-border rounded-lg">
            No active tokens. Generate one to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isExpired(token.expiresAt)
                    ? 'bg-red-500/5 border-red-500/30'
                    : 'bg-site-surface border-site-border'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-site-text-dim shrink-0" />
                    <span className="text-sm font-medium text-site-text truncate">
                      {token.name || 'Unnamed token'}
                    </span>
                    {isExpired(token.expiresAt) && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-site-text-dim">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Created {formatDate(token.createdAt)}
                    </span>
                    {token.lastUsedAt && (
                      <span>Last used {formatDate(token.lastUsedAt)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => revokeToken(token.id)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-site-text-dim hover:text-red-400 transition-colors shrink-0"
                  aria-label="Revoke token"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
