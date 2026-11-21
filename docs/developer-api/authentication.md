# Authentication

Every request must include an API key. Two equivalent options:

```http
Authorization: Bearer rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

```http
X-API-Key: rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

API keys authenticate as **your user account**. Writes are scoped to your own account; you cannot act on behalf of others.

## Key security

- Keys are random 256-bit secrets formatted `rmh_live_<base62>`.
- The server stores **only a SHA-256 hash** — the plaintext is shown **once** at creation and can never be retrieved again. The dashboard shows a non-secret 4-character suffix so you can tell keys apart.
- Treat a key like a password. Keep it server-side; never embed it in a public client, repo, or browser bundle you don't control.
- **Scopes:** each key carries granular permissions — see [Scopes](./scopes.md). Grant the least privilege a given integration needs.
- **Expiry:** a key may be created with an expiry date; expired keys are rejected exactly like revoked ones.
- **Allowed addresses:** restrict a key to up to 20 IPv4/IPv6 addresses or CIDR ranges (IPv4 /8 to /32, IPv6 /16 to /128). A request from anywhere else is refused with `403 ip_not_allowed` before any limit is counted, and shows on the key as a refused request with the address masked. An empty list allows any address. The address checked is the one `getClientIp` derives: Cloudflare's `CF-Connecting-IP`, which is only trustworthy because the origin accepts traffic from Cloudflare's ranges alone (`deploy/apache/rmhstudios.conf`, client-IP trust boundary). Keep that origin firewall in place: it is what makes the allowlist unforgeable.
- **Rotation:** rotate a key from [`/developer`](https://rmhstudios.com/developer) to issue a new secret while keeping the same key record — the old secret stops working immediately.
- **Revocation:** revoke a key any time from [`/developer`](https://rmhstudios.com/developer); it takes effect at once.
- If a subscription lapses or the account is suspended, all of that account's keys stop working until the subscription is restored.

```{admonition} CORS and browser clients
:class: warning

Cross-origin requests are permitted, and authentication is by bearer key rather
than cookies — so the API is not a CSRF surface. That is *not* a licence to ship
a key in a public browser bundle: anything in client-side JavaScript is readable
by anyone who loads the page. Keep keys on a server you control.
```
