# Security Audit Report — rmhstudios.com

**Date:** February 25, 2026
**Scope:** Full codebase static analysis
**Classification:** Internal — Confidential
**Auditor:** Automated static analysis via Claude Code

---

## Executive Summary

A comprehensive security audit was performed on the rmhstudios.com Next.js application, covering authentication, API endpoints, frontend rendering, infrastructure configuration, data storage, and third-party integrations.

**30 findings** were identified across the following severity levels:

| Severity | Count |
|---|---|
| CRITICAL | 3 |
| HIGH | 7 |
| MEDIUM | 12 |
| LOW | 5 |
| INFORMATIONAL | 3 |

The most urgent issues involve **CORS wildcard defaults on all WebSocket servers** (enabling cross-origin hijacking of multiplayer game sessions), a **Server-Side Request Forgery (SSRF) vulnerability** in the OG preview endpoint, and a **deployment webhook with a hardcoded default secret**. Several Cross-Site Scripting (XSS) vectors were also identified in the note-sharing and job assessment rendering components.

The application demonstrates solid fundamentals in several areas — Prisma ORM prevents SQL injection, file uploads validate via magic bytes rather than MIME types, and path traversal protections are properly implemented. These positive patterns are documented in the final section.

---

## Methodology

The audit covered the following domains through static code analysis:

1. **Authentication & Authorization** — Session management, OAuth configuration, protected routes, RBAC
2. **API Security** — All `app/api/` routes, input validation, rate limiting, CORS, CSRF
3. **Frontend Security** — XSS vectors, open redirects, client-side secret exposure, unsafe rendering
4. **Data Layer** — Database queries, sensitive data handling, encryption at rest
5. **Infrastructure** — Security headers, deployment configuration, environment management
6. **File Handling** — Upload validation, streaming, path traversal
7. **Third-party Integrations** — OAuth, GitHub API, WebSocket servers

Each finding includes a unique ID, severity rating, affected files with line numbers, vulnerability description, proof-of-concept code, recommended fix, and impact assessment.

---

## Findings Summary

### CRITICAL

| ID | Title | Location |
|---|---|---|
| SEC-001 | CORS wildcard default on all WebSocket servers | `server/socket-server.ts:9` + 2 more |
| SEC-002 | SSRF via OG Preview endpoint | `app/api/rmh-notes/og-preview/route.ts:14` |
| SEC-003 | Webhook deploy secret defaults to literal string | `webhook-server.js:5` |

### HIGH

| ID | Title | Location |
|---|---|---|
| SEC-004 | XSS via unescaped `href` in SharedNoteView | `components/rmh-notes/SharedNoteView.tsx:50` |
| SEC-005 | XSS via unescaped `src` in SharedNoteView images | `components/rmh-notes/SharedNoteView.tsx:63` |
| SEC-006 | XSS in formatProblemDescription — no input escaping | `components/rmh-jobs/OAEditor.tsx:447-454` |
| SEC-007 | GitHub PATs stored plaintext in database | `app/api/rmh-code/github/token/route.ts:55` |
| SEC-008 | Unauthenticated weather webhook endpoint | `app/api/weather-webhook/route.ts:3-21` |
| SEC-009 | Range header parsing crash — no bounds validation | `app/api/slice-it/songs/stream/[id]/route.ts:44-47` |
| SEC-010 | No security headers configured | `next.config.ts` |

### MEDIUM

| ID | Title | Location |
|---|---|---|
| SEC-011 | Rate limit bypass via X-Forwarded-For spoofing | `lib/rate-limit.ts:50-56` |
| SEC-012 | Missing rate limits on majority of API routes | Multiple files |
| SEC-013 | IDOR on patch-analysis endpoint | `app/api/slice-it/songs/[id]/patch-analysis/route.ts` |
| SEC-014 | Unbounded request bodies — DoS vector | Multiple files |
| SEC-015 | No input length validation on user-generated content | Multiple files |
| SEC-016 | Open redirect potential in login page | `app/login/page.tsx` |
| SEC-017 | Production console.error leaks internal details | Multiple API routes |
| SEC-018 | In-memory rate limiter resets on server restart | `lib/rate-limit.ts` |
| SEC-019 | Missing JSON parse error handling | `app/api/rmh-jobs/apply/route.ts` |
| SEC-020 | Date constructor accepts invalid values | `app/api/rmh-notes/reminders/route.ts`, `search/route.ts` |
| SEC-021 | Unvalidated song upload metadata | `app/api/slice-it/songs/upload/route.ts` |
| SEC-022 | No rate limit on data export endpoint | `app/api/rmh-notes/export/route.ts` |

### LOW

| ID | Title | Location |
|---|---|---|
| SEC-023 | localStorage game state vulnerable to tampering | Multiple store files |
| SEC-024 | No automated dependency vulnerability scanning | `package.json` |
| SEC-025 | Debug SQL query logging enabled in development | `lib/prisma.ts:10` |
| SEC-026 | Inconsistent error message exposure across routes | Multiple files |
| SEC-027 | Race condition in storage limit check | `app/api/slice-it/songs/upload/route.ts:75-84` |

### INFORMATIONAL

| ID | Title | Notes |
|---|---|---|
| SEC-028 | `.env` properly gitignored | Verified: not in git history |
| SEC-029 | Prisma ORM prevents SQL injection | All DB queries parameterized |
| SEC-030 | File upload validates via magic bytes | `lib/slice-it/upload-validation.ts` |

---

## Detailed Findings

---

### SEC-001 — CORS Wildcard Default on All WebSocket Servers

**Severity:** CRITICAL
**Category:** Cross-Origin Misconfiguration (CWE-942)
**Affected Files:**
- `server/socket-server.ts:9`
- `server/rmhbox/config.ts:24`
- `server/rmhtube/config.ts`

**Description:**
All three Socket.IO server instances default to `origin: "*"` when the `SOCKET_CORS_ORIGIN` environment variable is not set. This allows any website on the internet to establish WebSocket connections to your servers.

**Vulnerable Code:**
```typescript
// server/socket-server.ts:6-12
const io = new Server(httpServer, {
    path: "/socket/",
    cors: {
        origin: process.env.SOCKET_CORS_ORIGIN || "*",  // Wildcard fallback
        methods: ["GET", "POST"]
    }
});
```

**Impact:**
- An attacker can create a malicious webpage that connects to your Socket.IO servers
- Cross-Site WebSocket Hijacking (CSWSH) — if a user visits the attacker's page while authenticated, the attacker can send game commands, manipulate multiplayer lobbies, intercept player data, and impersonate users in real-time
- Affects all multiplayer games (Slice It, NeonDriftway, Synapse Storm, RMHBox, RMHTube)

**Recommended Fix:**
```typescript
const ALLOWED_ORIGINS = process.env.SOCKET_CORS_ORIGIN;
if (!ALLOWED_ORIGINS) {
    throw new Error("SOCKET_CORS_ORIGIN environment variable is required");
}

const io = new Server(httpServer, {
    path: "/socket/",
    cors: {
        origin: ALLOWED_ORIGINS.split(","),
        methods: ["GET", "POST"]
    }
});
```

Apply the same pattern to `server/rmhbox/config.ts` and `server/rmhtube/config.ts`.

---

### SEC-002 — Server-Side Request Forgery (SSRF) via OG Preview

**Severity:** CRITICAL
**Category:** SSRF (CWE-918)
**Affected File:** `app/api/rmh-notes/og-preview/route.ts:14`

**Description:**
The OG preview endpoint fetches a user-supplied URL without any validation. An attacker can use this to probe internal services, access cloud metadata endpoints, or perform port scanning of the internal network.

**Vulnerable Code:**
```typescript
// app/api/rmh-notes/og-preview/route.ts:9-17
const url = searchParams.get('url');
if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

try {
    const res = await fetch(url, {  // User-controlled URL, no validation
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RMHNotes/1.0)' },
        signal: AbortSignal.timeout(5000),
    });
```

**Attack Vectors:**
- `GET /api/rmh-notes/og-preview?url=http://127.0.0.1:7005` — probe local Next.js server
- `GET /api/rmh-notes/og-preview?url=http://169.254.169.254/latest/meta-data/` — AWS metadata (if deployed on EC2)
- `GET /api/rmh-notes/og-preview?url=http://localhost:5432` — probe PostgreSQL port
- `GET /api/rmh-notes/og-preview?url=file:///etc/passwd` — local file read (depends on fetch implementation)

**Impact:**
- Internal network reconnaissance
- Cloud credential theft via metadata endpoints
- Access to internal services not exposed to the internet
- Potential data exfiltration

**Recommended Fix:**
```typescript
import { URL } from 'url';
import dns from 'dns/promises';
import { isIP } from 'net';

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'metadata.google.internal'];
const BLOCKED_RANGES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
    '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '169.254.'];

function isUrlSafe(urlString: string): boolean {
    try {
        const parsed = new URL(urlString);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        const hostname = parsed.hostname.toLowerCase();
        if (BLOCKED_HOSTS.includes(hostname)) return false;
        if (isIP(hostname) && BLOCKED_RANGES.some(r => hostname.startsWith(r))) return false;
        return true;
    } catch {
        return false;
    }
}

// In the handler:
if (!isUrlSafe(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
}
```

---

### SEC-003 — Webhook Deploy Secret Defaults to Literal String

**Severity:** CRITICAL
**Category:** Broken Authentication (CWE-798)
**Affected File:** `webhook-server.js:5`

**Description:**
The deployment webhook server uses a fallback secret of `'change-me'` when the `WEBHOOK_SECRET` environment variable is not set. An attacker who discovers this default can trigger deployments at will.

**Vulnerable Code:**
```javascript
// webhook-server.js:5
const SECRET = process.env.WEBHOOK_SECRET || 'change-me';
```

**Impact:**
- Unauthorized deployment triggers
- Supply chain compromise — attacker could time deployments to coincide with malicious commits
- Denial of service through repeated deployment triggering

**Recommended Fix:**
```javascript
const SECRET = process.env.WEBHOOK_SECRET;
if (!SECRET || SECRET === 'change-me') {
    console.error('FATAL: WEBHOOK_SECRET must be set to a secure value');
    process.exit(1);
}
```

---

### SEC-004 — XSS via Unescaped `href` in SharedNoteView

**Severity:** HIGH
**Category:** Cross-Site Scripting — Stored (CWE-79)
**Affected File:** `components/rmh-notes/SharedNoteView.tsx:50`

**Description:**
When rendering TipTap JSON content for shared notes, the `href` attribute of link marks is inserted directly into the HTML string without escaping. While text content is properly escaped via `escapeHtml()`, the attribute value is not.

**Vulnerable Code:**
```typescript
// components/rmh-notes/SharedNoteView.tsx:50
if (mt === 'link') text = `<a href="${(m.attrs as Record<string, unknown>)?.href}" target="_blank" rel="noopener">${text}</a>`;
```

**Attack Vector:**
A user could craft a note with a TipTap JSON link node containing:
```json
{ "type": "link", "attrs": { "href": "javascript:alert(document.cookie)" } }
```

Or attribute breakout:
```json
{ "type": "link", "attrs": { "href": "\" onmouseover=\"alert(1)\" data-x=\"" } }
```

When this note is shared and viewed by another user, the JavaScript executes in their browser context.

**Impact:**
- Session hijacking via cookie theft
- Phishing via injected content on trusted domain
- Data exfiltration from the victim's authenticated session

**Recommended Fix:**
```typescript
if (mt === 'link') {
    const href = escapeHtml(String((m.attrs as Record<string, unknown>)?.href ?? ''));
    // Block javascript: protocol
    const safeHref = /^javascript:/i.test(href) ? '#' : href;
    text = `<a href="${safeHref}" target="_blank" rel="noopener">${text}</a>`;
}
```

---

### SEC-005 — XSS via Unescaped `src` in SharedNoteView Images

**Severity:** HIGH
**Category:** Cross-Site Scripting — Stored (CWE-79)
**Affected File:** `components/rmh-notes/SharedNoteView.tsx:63`

**Description:**
Image nodes in the TipTap JSON content are rendered with unescaped `src` and `alt` attribute values.

**Vulnerable Code:**
```typescript
// components/rmh-notes/SharedNoteView.tsx:63
case 'image': return `<img src="${attrs.src}" alt="${attrs.alt ?? ''}" style="max-width:100%">`;
```

**Attack Vector:**
```json
{ "type": "image", "attrs": { "src": "x\" onerror=\"alert(document.cookie)\" data-x=\"" } }
```

**Impact:**
Same as SEC-004 — JavaScript execution in the context of any user viewing the shared note.

**Recommended Fix:**
```typescript
case 'image': {
    const src = escapeHtml(String(attrs.src ?? ''));
    const alt = escapeHtml(String(attrs.alt ?? ''));
    return `<img src="${src}" alt="${alt}" style="max-width:100%">`;
}
```

---

### SEC-006 — XSS in formatProblemDescription — No Input Escaping

**Severity:** HIGH
**Category:** Cross-Site Scripting — Reflected (CWE-79)
**Affected File:** `components/rmh-jobs/OAEditor.tsx:447-454`

**Description:**
The `formatProblemDescription` function converts markdown-like text to HTML using regex replacements without first escaping HTML entities. If the input contains malicious HTML, it will be injected into the DOM via `dangerouslySetInnerHTML` (line 268).

**Vulnerable Code:**
```typescript
// components/rmh-jobs/OAEditor.tsx:447-454
function formatProblemDescription(md: string): string {
    return md
        .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold mb-3">$1</h2>')
        .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code ...>$1</code>')
        .replace(/^> (.+)$/gm, '<blockquote ...>$1</blockquote>')
        .replace(/\n\n/g, '<br/><br/>');
}
```

**Attack Vector:**
If a problem description contains `# <img src=x onerror=alert(1)>`, the regex will wrap it in `<h2>` tags without escaping, producing executable HTML.

**Impact:**
If problem descriptions come from any user-editable source (or if the admin panel is compromised), this enables stored XSS in the assessment view.

**Recommended Fix:**
```typescript
function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatProblemDescription(md: string): string {
    const escaped = escapeHtml(md);
    return escaped
        .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold mb-3">$1</h2>')
        .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code style="background:var(--jobs-surface-2);padding:1px 4px;border-radius:3px;font-size:0.85em">$1</code>')
        .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:2px solid var(--jobs-accent);padding-left:12px;color:var(--jobs-text-muted);font-style:italic;margin:8px 0">$1</blockquote>')
        .replace(/\n\n/g, '<br/><br/>');
}
```

Alternatively, use a proper markdown rendering library with built-in sanitization.

---

### SEC-007 — GitHub PATs Stored Plaintext in Database

**Severity:** HIGH
**Category:** Sensitive Data Exposure (CWE-312)
**Affected File:** `app/api/rmh-code/github/token/route.ts:55`

**Description:**
GitHub Personal Access Tokens are stored in the database without encryption. If the database is compromised (SQL injection elsewhere, backup leak, unauthorized access), all stored GitHub tokens are immediately usable.

**Vulnerable Code:**
```typescript
// app/api/rmh-code/github/token/route.ts:53-56
await prisma.userGitHubToken.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, token: token.trim(), login: ghUser.login },
    update: { token: token.trim(), login: ghUser.login },
});
```

**Impact:**
- Full access to users' GitHub repositories (read/write depending on token scopes)
- Code exfiltration, malicious commits, or repository deletion
- Lateral movement to other services connected to compromised GitHub accounts

**Recommended Fix:**
Encrypt tokens at rest using a server-side encryption key:

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!; // 32-byte hex key
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(data: string): string {
    const [ivHex, tagHex, encrypted] = data.split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

---

### SEC-008 — Unauthenticated Weather Webhook Endpoint

**Severity:** HIGH
**Category:** Missing Authentication (CWE-306)
**Affected File:** `app/api/weather-webhook/route.ts:3-21`

**Description:**
The weather webhook endpoint accepts any POST request without authentication or signature verification. Unlike the deploy webhook (`webhook-server.js`) which at least validates HMAC signatures, this endpoint has no security whatsoever.

**Vulnerable Code:**
```typescript
// app/api/weather-webhook/route.ts:3-21
export async function POST(req: NextRequest) {
    // Only allows POST — but NO authentication check
    const payload = await req.json();
    return new Response(
        JSON.stringify({ received: payload, status: 'Webhook received' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}
```

**Impact:**
- Resource exhaustion from spam requests
- If this endpoint triggers downstream automation, an attacker can trigger it at will
- The response echoes back the received payload, which could be used for reflected content attacks

**Recommended Fix:**
Add webhook signature verification or API key authentication:
```typescript
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.WEATHER_WEBHOOK_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    // ... rest of handler
}
```

---

### SEC-009 — Range Header Parsing Crash

**Severity:** HIGH
**Category:** Improper Input Validation (CWE-20)
**Affected File:** `app/api/slice-it/songs/stream/[id]/route.ts:44-47`

**Description:**
The audio streaming endpoint parses HTTP Range headers without validating that the parsed values are valid numbers or within acceptable bounds. Malformed Range headers can cause `NaN` values to be passed to `createReadStream`, resulting in server errors.

**Vulnerable Code:**
```typescript
// app/api/slice-it/songs/stream/[id]/route.ts:44-47
const parts = range.replace(/bytes=/, "").split("-");
const start = parseInt(parts[0], 10);        // Could be NaN
const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;  // Could be NaN
const chunksize = (end - start) + 1;          // NaN arithmetic
const stream = createReadStream(filePath, { start, end });  // NaN passed to fs
```

**Attack Vectors:**
- `Range: bytes=abc-def` — NaN values
- `Range: bytes=999999999-0` — end < start
- `Range: bytes=-1-5` — negative start
- `Range: bytes=0-999999999999` — end exceeds file size

**Impact:**
- Server crash / unhandled exceptions
- Potential denial of service if errors aren't caught properly
- Memory issues with extremely large range requests

**Recommended Fix:**
```typescript
if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
        return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${fileSize}` },
        });
    }

    const chunksize = (end - start) + 1;
    // ... rest of streaming logic
}
```

---

### SEC-010 — No Security Headers Configured

**Severity:** HIGH
**Category:** Security Misconfiguration (CWE-693)
**Affected File:** `next.config.ts`

**Description:**
The Next.js configuration has no security headers defined. The application is missing all standard browser security headers that prevent common web attacks.

**Current Config:**
```typescript
// next.config.ts — no headers() function, no security middleware
const nextConfig: NextConfig = {
    serverExternalPackages: [
        "audio-decode",
        "wasm-audio-decoders",
        // ...
    ],
};
```

**Missing Headers:**
| Header | Purpose | Risk Without It |
|---|---|---|
| `Content-Security-Policy` | Prevents XSS, clickjacking, data injection | Scripts from any origin can execute |
| `Strict-Transport-Security` | Enforces HTTPS | Downgrade attacks, cookie interception |
| `X-Frame-Options` | Prevents clickjacking | UI redressing attacks |
| `X-Content-Type-Options` | Prevents MIME sniffing | MIME-based attacks |
| `Referrer-Policy` | Controls referrer information | URL parameter leakage |
| `Permissions-Policy` | Restricts browser features | Unauthorized camera/mic/geolocation access |

**Recommended Fix:**
```typescript
const nextConfig: NextConfig = {
    serverExternalPackages: [ /* ... */ ],
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "X-XSS-Protection", value: "1; mode=block" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains; preload"
                    },
                    {
                        key: "Content-Security-Policy",
                        value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: ws:; frame-ancestors 'none';"
                    },
                ],
            },
        ];
    },
};
```

> Note: The CSP policy above is a starting point. Adjust `script-src`, `style-src`, and other directives based on your application's actual requirements (e.g., if using external CDNs or analytics).

---

### SEC-011 — Rate Limit Bypass via X-Forwarded-For Spoofing

**Severity:** MEDIUM
**Category:** Authentication Bypass (CWE-290)
**Affected File:** `lib/rate-limit.ts:50-56`

**Description:**
The `getClientIp` function trusts the `X-Forwarded-For` header unconditionally. If the application is not behind a trusted reverse proxy that strips/overwrites this header, any client can spoof their IP to bypass rate limits.

**Vulnerable Code:**
```typescript
// lib/rate-limit.ts:50-56
export function getClientIp(req: Request): string {
    const headers = req.headers;
    return (
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        headers.get('x-real-ip') ??
        '127.0.0.1'
    );
}
```

**Attack Vector:**
```bash
# Bypass rate limit by rotating spoofed IPs
curl -H "X-Forwarded-For: 1.2.3.4" POST /api/slice-it/songs/upload ...
curl -H "X-Forwarded-For: 5.6.7.8" POST /api/slice-it/songs/upload ...
# Each request appears to come from a different IP
```

**Impact:**
Renders all rate limiting ineffective against attackers.

**Recommended Fix:**
If behind a trusted proxy (nginx, Cloudflare, etc.), validate the header chain. Otherwise, use the connection IP:

```typescript
export function getClientIp(req: Request): string {
    // Only trust X-Forwarded-For if behind a known proxy
    // For Next.js on a VPS with nginx in front:
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
        // Take the LAST IP before your proxy (rightmost untrusted)
        const ips = xff.split(',').map(s => s.trim());
        // If your proxy appends the real IP, the rightmost non-proxy IP is the client
        return ips[0];  // Adjust based on your proxy setup
    }
    return req.headers.get('x-real-ip') ?? '127.0.0.1';
}
```

For stronger protection, consider user-session-based rate limiting (keying on `session.user.id` for authenticated routes) in addition to IP-based limiting.

---

### SEC-012 — Missing Rate Limits on Majority of API Routes

**Severity:** MEDIUM
**Category:** Denial of Service (CWE-770)
**Affected Files:**
- `app/api/rmh-notes/notes/route.ts` — note creation (POST)
- `app/api/rmh-notes/folders/route.ts` — folder creation (POST)
- `app/api/rmh-notes/tags/route.ts` — tag creation (POST)
- `app/api/rmh-notes/export/route.ts` — full data export (GET)
- `app/api/rmh-notes/share/[token]/route.ts` — public share access (GET)
- `app/api/rmh-code/projects/route.ts` — project creation (POST)
- `app/api/rmh-jobs/apply/route.ts` — job application (POST)
- `app/api/slice-it/songs/[id]/like/route.ts` — song likes (POST)
- `app/api/slice-it/leaderboard/route.ts` — leaderboard (GET)
- `app/api/temple-of-joy/save/route.ts` — game save (POST)

**Description:**
While some endpoints (file upload, comments, score submission) have rate limiting applied, the majority of API routes have no rate limiting. This allows attackers to spam resource-creating endpoints or exhaust server resources.

**Impact:**
- Database bloat from unlimited resource creation
- Denial of service via CPU/memory exhaustion
- Abuse of export endpoint to repeatedly download user data
- Like manipulation / vote stuffing

**Recommended Fix:**
Apply rate limiting globally via Next.js middleware, or add per-route limits:

```typescript
// middleware.ts — Global rate limiting for all API routes
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export function middleware(req: NextRequest) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
        const ip = getClientIp(req);
        const { allowed, retryAfter } = rateLimit(ip, {
            limit: 60,
            windowMs: 60_000,
            prefix: 'global'
        });
        if (!allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }
    }
}
```

---

### SEC-013 — IDOR on Patch Analysis Endpoint

**Severity:** MEDIUM
**Category:** Insecure Direct Object Reference (CWE-639)
**Affected File:** `app/api/slice-it/songs/[id]/patch-analysis/route.ts`

**Description:**
The PATCH endpoint for updating song analysis data verifies that the song exists and that no analysis already exists, but does not verify that the authenticated user owns the song. Any authenticated user can write analysis data to any song.

**Impact:**
- Data integrity compromise — analysis data can be overwritten
- Potential for abuse if analysis data affects game mechanics or scoring

**Recommended Fix:**
Add an ownership check:
```typescript
if (song.uploaderId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

---

### SEC-014 — Unbounded Request Bodies (DoS Vector)

**Severity:** MEDIUM
**Category:** Uncontrolled Resource Consumption (CWE-770)
**Affected Files:**
- `app/api/temple-of-joy/save/route.ts` — `saveData` object no size limit
- `app/api/rmh-code/projects/[projectId]/files/[fileId]/route.ts` — `content` field no size limit
- `app/api/rmh-code/projects/[projectId]/files/route.ts` — file creation no size limit
- `app/api/slice-it/songs/[id]/patch-analysis/route.ts` — `analysisData` no size limit

**Description:**
Multiple API endpoints accept JSON bodies with no validation of payload size. An attacker can send extremely large payloads to exhaust server memory or fill the database.

**Impact:**
- Server memory exhaustion (OOM crash)
- Database storage exhaustion
- Degraded performance for all users

**Recommended Fix:**
Add body size validation:
```typescript
const body = await req.json();
const bodySize = JSON.stringify(body).length;
if (bodySize > 1_000_000) { // 1MB limit — adjust per endpoint
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
}
```

For file content specifically, enforce per-file size limits matching your application requirements.

---

### SEC-015 — No Input Length Validation on User-Generated Content

**Severity:** MEDIUM
**Category:** Improper Input Validation (CWE-20)
**Affected Files:**
- `app/api/rmh-notes/folders/route.ts` — folder name (no max length)
- `app/api/rmh-notes/tags/route.ts` — tag name (no max length)
- `app/api/rmh-notes/notes/route.ts` — note title (no max length)
- `app/api/slice-it/songs/upload/route.ts:44-47` — title, artist, description (no max length)

**Description:**
User-supplied strings for names, titles, and descriptions are accepted without length restrictions. While Prisma handles parameterization, arbitrarily long strings can cause display issues, database storage bloat, and potential performance problems.

**Recommended Fix:**
Add length validation to all string inputs:
```typescript
if (name.trim().length > 255) {
    return NextResponse.json({ error: 'Name too long (max 255 characters)' }, { status: 400 });
}
```

---

### SEC-016 — Open Redirect Potential in Login Page

**Severity:** MEDIUM
**Category:** URL Redirection to Untrusted Site (CWE-601)
**Affected File:** `app/login/page.tsx`

**Description:**
The login page accepts a `callbackURL` query parameter. While there is a check that the URL starts with `/`, the validation occurs in `useState` initialization and may not cover all redirect paths in the component.

**Impact:**
- Phishing attacks using your domain as a redirect intermediary
- Credential harvesting by redirecting to lookalike sites after login

**Recommended Fix:**
Validate the callback URL at the point of redirect, not just initialization:
```typescript
function safeRedirect(url: string): string {
    // Only allow same-origin paths, no protocol-relative URLs
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    return '/games';
}
```

---

### SEC-017 — Production Console.error Leaks Internal Details

**Severity:** MEDIUM
**Category:** Information Exposure Through Error Messages (CWE-209)
**Affected Files:**
- `app/api/slice-it/songs/upload/route.ts:118,120,133,154`
- `app/api/slice-it/songs/[id]/route.ts:96,135,147`
- `app/api/slice-it/songs/[id]/comments/route.ts:38,111`
- `app/api/slice-it/songs/stream/[id]/route.ts:79`
- `app/api/signal-forge/*` — multiple files
- Many other API routes

**Description:**
Full error objects are logged via `console.error()` in production code. While responses return generic "Internal Server Error" messages (which is good), server logs may contain stack traces, database connection strings, file paths, and other sensitive information.

**Recommended Fix:**
Use a structured logging library with log levels:
```typescript
// lib/logger.ts
export function logError(context: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // In production, only log message — never full stack traces
    if (process.env.NODE_ENV === 'production') {
        console.error(JSON.stringify({ context, message, timestamp: Date.now() }));
    } else {
        console.error(context, error);
    }
}
```

---

### SEC-018 — In-Memory Rate Limiter Resets on Server Restart

**Severity:** MEDIUM
**Category:** Insufficient Anti-Automation (CWE-799)
**Affected File:** `lib/rate-limit.ts`

**Description:**
The rate limiter uses an in-memory `Map` to track request counts. On server restart or redeployment, all rate limit state is lost. In multi-instance deployments, each instance maintains separate counters.

**Impact:**
- Rate limits can be bypassed by timing requests around server restarts
- In horizontal scaling scenarios, effective rate limits are multiplied by instance count

**Recommended Fix:**
For a single-instance deployment, the current approach is acceptable. For stronger guarantees, consider Redis-backed rate limiting:
```typescript
// Use ioredis or @upstash/redis for persistent rate limiting
// This ensures limits survive restarts and work across instances
```

---

### SEC-019 — Missing JSON Parse Error Handling

**Severity:** MEDIUM
**Category:** Improper Error Handling (CWE-755)
**Affected File:** `app/api/rmh-jobs/apply/route.ts:13`

**Description:**
The `await req.json()` call is not wrapped in a try-catch. Malformed JSON payloads will cause unhandled exceptions.

**Recommended Fix:**
```typescript
let body;
try {
    body = await req.json();
} catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
}
```

---

### SEC-020 — Date Constructor Accepts Invalid Values

**Severity:** MEDIUM
**Category:** Improper Input Validation (CWE-20)
**Affected Files:**
- `app/api/rmh-notes/reminders/route.ts:51`
- `app/api/rmh-notes/search/route.ts:33-34`

**Description:**
`new Date(body.dueAt)` and `new Date(dateFrom)` / `new Date(dateTo)` are called on raw user input without validation. Invalid date strings produce `Invalid Date` objects that can cause downstream errors or unexpected behavior.

**Recommended Fix:**
```typescript
const date = new Date(body.dueAt);
if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
}
```

---

### SEC-021 — Unvalidated Song Upload Metadata

**Severity:** MEDIUM
**Category:** Improper Input Validation (CWE-20)
**Affected File:** `app/api/slice-it/songs/upload/route.ts:44-47`

**Description:**
Song metadata (title, artist, BPM, description) from the upload form is used without length or format validation.

**Vulnerable Code:**
```typescript
const title = formData.get("title") as string;
const artist = formData.get("artist") as string;
const bpm = parseFloat(formData.get("bpm") as string) || 0;
const description = (formData.get("description") as string) || "";
```

**Issues:**
- `title` and `artist` have no max length
- `bpm` could be `Infinity`, `NaN` (falls to 0), or negative
- `description` has no max length
- No HTML/script content validation

**Recommended Fix:**
```typescript
const title = (formData.get("title") as string)?.trim().slice(0, 200);
const artist = (formData.get("artist") as string)?.trim().slice(0, 200);
const rawBpm = parseFloat(formData.get("bpm") as string);
const bpm = (Number.isFinite(rawBpm) && rawBpm > 0 && rawBpm < 999) ? rawBpm : 0;
const description = (formData.get("description") as string)?.trim().slice(0, 2000) || "";
```

---

### SEC-022 — No Rate Limit on Data Export Endpoint

**Severity:** MEDIUM
**Category:** Uncontrolled Resource Consumption (CWE-770)
**Affected File:** `app/api/rmh-notes/export/route.ts`

**Description:**
The export endpoint returns all user data (notes, folders, tags, reminders, templates, moods) in a single response with no rate limiting. An attacker with a valid session could repeatedly trigger exports to exhaust server resources.

**Recommended Fix:**
Add rate limiting (e.g., 5 exports per hour per user):
```typescript
const { allowed, retryAfter } = rateLimit(session.user.id, {
    limit: 5, windowMs: 3_600_000, prefix: 'export'
});
if (!allowed) return NextResponse.json({ error: 'Too many exports' }, { status: 429 });
```

---

### SEC-023 — localStorage Game State Vulnerable to Tampering

**Severity:** LOW
**Category:** Client-Side Data Manipulation (CWE-602)
**Affected Files:**
- `lib/rmhtube/store.ts`
- `lib/rmhbox/store.ts`
- `lib/synapse-storm/settings.ts`
- `components/rmh-code/SettingsContext.tsx`

**Description:**
Game settings and state are persisted in localStorage, which users can modify via browser DevTools. While this is generally acceptable for client-side preferences, any game scores or progression stored in localStorage should be validated server-side.

**Impact:** Low — primarily a fairness concern for multiplayer games if scores are derived from client state.

---

### SEC-024 — No Automated Dependency Vulnerability Scanning

**Severity:** LOW
**Category:** Use of Components with Known Vulnerabilities (CWE-1035)
**Affected File:** `package.json`

**Description:**
No `npm audit` or equivalent command is found in the project scripts. With a large dependency tree (414MB `pnpm-lock.yaml`), there's no automated mechanism to detect known vulnerabilities in dependencies.

**Recommended Fix:**
Add to `package.json` scripts:
```json
{
    "scripts": {
        "audit": "pnpm audit --audit-level=moderate"
    }
}
```

Consider integrating GitHub Dependabot or Snyk for continuous monitoring.

---

### SEC-025 — Debug SQL Query Logging in Development

**Severity:** LOW
**Category:** Information Exposure Through Log Files (CWE-532)
**Affected File:** `lib/prisma.ts:10`

**Description:**
Prisma is configured with `log: ['query', 'error', 'warn']` in development mode. This logs all SQL queries to the console, which may include user data, tokens, or other sensitive information.

**Impact:** Development-only. Ensure this never runs in production.

---

### SEC-026 — Inconsistent Error Message Exposure

**Severity:** LOW
**Category:** Information Exposure (CWE-209)
**Affected Files:** Multiple API routes

**Description:**
Some routes conditionally expose error details based on `NODE_ENV` (good practice), while most return generic "Internal Server Error" (also good). A few routes may leak error specifics (e.g., GitHub push endpoint returns `errText` to the client). The approach is inconsistent.

**Recommended Fix:**
Standardize error responses across all routes. Never expose internal error details in production.

---

### SEC-027 — Race Condition in Storage Limit Check

**Severity:** LOW
**Category:** Time-of-Check Time-of-Use (CWE-367)
**Affected File:** `app/api/slice-it/songs/upload/route.ts:75-84`

**Description:**
The storage limit (10GB per user) is checked before the file is written. With concurrent uploads, two requests could both pass the check before either writes, exceeding the limit.

**Impact:** Minor storage limit bypass via concurrent uploads.

---

## Positive Security Observations

The codebase demonstrates good security awareness in several areas:

| Area | Implementation | File |
|---|---|---|
| SQL Injection Prevention | Prisma ORM with parameterized queries throughout | All database operations |
| File Type Validation | Magic byte verification (not MIME/extension based) | `lib/slice-it/upload-validation.ts:12-30` |
| Path Traversal Protection | `resolvePathUnder()` validates paths stay within base directory | `lib/slice-it/upload-validation.ts:60-67` |
| Upload Size Limits | Per-user storage caps enforced | `app/api/slice-it/songs/upload/route.ts` |
| Authentication on Protected Routes | `auth.api.getSession()` checked consistently on most routes | All `app/api/` routes |
| Socket Input Sanitization | `sanitizeLobbyId()` and `sanitizeUserName()` strip dangerous characters | `server/socket-server.ts:17-24` |
| HTML Escaping in SharedNoteView | `escapeHtml()` applied to text content in custom renderer | `components/rmh-notes/SharedNoteView.tsx:87` |
| Environment Variable Isolation | `.env` properly gitignored, not committed to repository | `.gitignore:34` |
| Comment Length Limits | 2000-char max enforced for song comments | `app/api/slice-it/songs/[id]/comments/route.ts` |
| Filename Sanitization | Upload filenames stripped of special characters | `app/api/slice-it/songs/upload/route.ts:86` |
| Webhook Signature Verification | Deploy webhook validates HMAC-SHA256 signatures | `webhook-server.js:27-33` |

---

## Remediation Roadmap

### Phase 1 — Immediate (This Week)
| Priority | Finding | Effort | Action |
|---|---|---|---|
| P0 | SEC-001 | 30 min | Set `SOCKET_CORS_ORIGIN` env var on all servers; crash if not set |
| P0 | SEC-003 | 15 min | Remove `'change-me'` fallback; require `WEBHOOK_SECRET` env var |
| P0 | SEC-002 | 1 hour | Add URL validation + private IP blocklist to OG preview |
| P0 | SEC-010 | 1 hour | Add security headers to `next.config.ts` |

### Phase 2 — High Priority (1-2 Weeks)
| Priority | Finding | Effort | Action |
|---|---|---|---|
| P1 | SEC-004/005 | 1 hour | Escape all HTML attributes in SharedNoteView renderer |
| P1 | SEC-006 | 30 min | Add HTML escaping before regex in `formatProblemDescription` |
| P1 | SEC-007 | 2-3 hours | Implement AES-256-GCM encryption for GitHub tokens |
| P1 | SEC-008 | 30 min | Add authentication to weather webhook |
| P1 | SEC-009 | 30 min | Validate Range header bounds |
| P1 | SEC-012 | 2 hours | Add global API rate limiting via middleware |

### Phase 3 — Medium Priority (2-4 Weeks)
| Priority | Finding | Effort | Action |
|---|---|---|---|
| P2 | SEC-011 | 1 hour | Implement session-based rate limiting for authenticated routes |
| P2 | SEC-013 | 15 min | Add ownership check to patch-analysis endpoint |
| P2 | SEC-014 | 1 hour | Add payload size validation to all POST/PATCH endpoints |
| P2 | SEC-015 | 1 hour | Add string length limits to all input fields |
| P2 | SEC-016 | 30 min | Validate callback URLs at point of redirect |
| P2 | SEC-019 | 15 min | Wrap `req.json()` in try-catch on apply route |
| P2 | SEC-020 | 30 min | Validate Date constructor inputs |
| P2 | SEC-021 | 30 min | Add metadata validation to song upload |
| P2 | SEC-022 | 15 min | Add rate limiting to export endpoint |

### Phase 4 — Maintenance (Ongoing)
| Priority | Finding | Effort | Action |
|---|---|---|---|
| P3 | SEC-017 | 2 hours | Implement structured logging across all API routes |
| P3 | SEC-024 | 30 min | Set up automated dependency scanning (Dependabot/Snyk) |
| P3 | SEC-026 | 1 hour | Standardize error response format across all routes |

---

*End of Security Audit Report*
