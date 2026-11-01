import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Check, RefreshCw, Trash2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { tokenExpiry } from '@/lib/rmhcode/token-expiry';

interface Token {
  id: string;
  name: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
}

export default function TokenGenerator() {
  const { t, i18n } = useTranslation("c-rmhcode");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(i18n.language, {
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
            placeholder={t("token-name-placeholder", { defaultValue: "Token name (optional)" })}
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            className="flex-1 px-3 py-2 glass-inset rounded-site-sm text-site-text text-sm outline-none focus:border-site-border-bright transition-colors"
            maxLength={100}
          />
          <Button
            onClick={generateToken}
            disabled={generating}
            variant="accent"
            className=""
          >
            {generating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Key className="w-4 h-4 mr-2" />
                {t("generate-token", { defaultValue: "Generate Token" })}
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-site-danger">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* New Token Display */}
      {newToken && (
        <div className="p-4 rounded-site-sm bg-site-accent-dim border border-site-border">
          <div className="flex items-center gap-2 text-sm text-site-accent mb-2">
            <Check className="w-4 h-4" />
            {t("token-generated-notice", { defaultValue: "Token generated! Copy it now - it won't be shown again." })}
          </div>
          <div className="flex items-center gap-2">
            <code className="glass-inset flex-1 rounded-site-sm p-2 text-sm font-mono text-site-text break-all">
              {newToken}
            </code>
            <CopyButton value={newToken} label={t("copy-token-label", { defaultValue: "Copy token" })} variant="outline" className="shrink-0" />
          </div>
          <p className="text-xs text-site-text-dim mt-2">
            {t("token-auth-instruction-pre", { defaultValue: "Run" })} <code className="text-site-accent">rmhcode login --token YOUR_TOKEN</code> {t("token-auth-instruction-post", { defaultValue: "to authenticate." })}
          </p>
        </div>
      )}

      {/* Existing Tokens */}
      <div>
        <h3 className="text-sm font-medium text-site-text mb-3">{t("your-tokens", { defaultValue: "Your Tokens" })}</h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-site-surface-hover rounded-site-sm animate-pulse" />
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-site-text-dim py-4 text-center border border-dashed border-site-border rounded-site-sm">
            {t("no-active-tokens", { defaultValue: "No active tokens. Generate one to get started." })}
          </p>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.id}
                className={`glass-fill flex items-center justify-between p-3 rounded-site-sm ${
                  isExpired(token.expiresAt)
                    ? 'bg-site-danger/10 border-site-danger/30'
                    : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-site-text-dim shrink-0" />
                    <span className="text-sm font-medium text-site-text truncate">
                      {token.name || t("unnamed-token", { defaultValue: "Unnamed token" })}
                    </span>
                    {isExpired(token.expiresAt) && (
                      <span className="px-2 py-0.5 rounded-site-sm text-xs bg-site-danger/15 text-site-danger">
                        {t("expired", { defaultValue: "Expired" })}
                      </span>
                    )}
                    {tokenExpiry(token.expiresAt) === 'soon' && (
                      <Badge variant="warning" size="sm">
                        {t("expires-soon", { defaultValue: "Expires soon" })}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-site-text-dim">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t("created-date", { defaultValue: "Created {{date}}", date: formatDate(token.createdAt) })}
                    </span>
                    {!isExpired(token.expiresAt) && (
                      <span>{t("expires-date", { defaultValue: "Expires {{date}}", date: formatDate(token.expiresAt) })}</span>
                    )}
                    {token.lastUsedAt && (
                      <span>{t("last-used-date", { defaultValue: "Last used {{date}}", date: formatDate(token.lastUsedAt) })}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => revokeToken(token.id)}
                  className="p-2 rounded-site-sm hover:bg-site-danger/10 text-site-text-dim hover:text-site-danger transition-colors shrink-0"
                  aria-label={t("revoke-token-label", { defaultValue: "Revoke token" })}
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
