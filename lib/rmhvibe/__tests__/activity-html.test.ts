import { describe, expect, it } from 'vitest';
import { adaptVibeHtmlForProxy, isDiscordProxyOrigin } from '../activity-html';

const SITE = 'https://rmhstudios.com';
const PROXY = 'https://123456789012345678.discordsays.com';
const opts = { siteOrigin: SITE, proxyOrigin: PROXY, esmPrefix: '/.proxy/esm' };

const HTML = `<meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline' ${SITE} https://esm.sh; style-src ${SITE}; connect-src ${SITE}/api/vibe/ai">
<script type="importmap">{"imports":{"react":"${SITE}/api/vibe/pkg/react.js?r=1","zod":"https://esm.sh/zod@3"}}</script>
<script>window.RMHVibeAI={endpoint:"${SITE}/api/vibe/ai"};var x="https://rmhstudios.community/y"</script>`;

describe('isDiscordProxyOrigin', () => {
  it('accepts only discordsays proxy origins', () => {
    expect(isDiscordProxyOrigin(PROXY)).toBe(true);
    expect(isDiscordProxyOrigin('https://evil.example')).toBe(false);
    expect(isDiscordProxyOrigin('https://123456789012345678.discordsays.com.evil.example')).toBe(
      false,
    );
    expect(isDiscordProxyOrigin('http://123456789012345678.discordsays.com')).toBe(false);
    expect(isDiscordProxyOrigin('https://123.discordsays.com')).toBe(false);
  });
});

describe('adaptVibeHtmlForProxy', () => {
  const out = adaptVibeHtmlForProxy(HTML, opts);

  it('rewrites importmap, CSP and AI endpoint', () => {
    expect(out).toContain(`${PROXY}/api/vibe/pkg/react.js?r=1`);
    expect(out).toContain(`endpoint:"${PROXY}/api/vibe/ai"`);
    expect(out).toContain(`${PROXY}/.proxy/esm/zod@3`);
    expect(out).not.toContain('https://rmhstudios.com/');
    expect(out).not.toContain('https://rmhstudios.com ');
    expect(out).not.toContain('https://esm.sh');
  });

  it('leaves a different host sharing the prefix alone', () => {
    expect(out).toContain('https://rmhstudios.community/y');
  });

  it('is a no-op for a non-Discord proxy origin', () => {
    expect(adaptVibeHtmlForProxy(HTML, { ...opts, proxyOrigin: 'https://evil.example' })).toBe(
      HTML,
    );
  });

  it('is idempotent', () => {
    expect(adaptVibeHtmlForProxy(out, opts)).toBe(out);
  });
});
