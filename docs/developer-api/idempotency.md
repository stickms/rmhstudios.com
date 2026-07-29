# Idempotency

Write requests (`POST`, `PATCH`, `DELETE`) accept an **`Idempotency-Key`** header so a retry — after a network blip or timeout — never applies the action twice.

```bash
curl -X POST https://rmhstudios.com/api/v1/posts \
  -H "Authorization: Bearer $RMH_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 5f3a9c2e-1b7d-4e2a-9c8b-2f1a0d6e4b3c" \
  -d '{"content":"Posted exactly once"}'
```

## Semantics

- The **first** request for a given key is processed and its response stored.
- A **retry with the same key and body** replays the stored response and adds `Idempotency-Replayed: true`. No second action occurs.
- Reusing a key with a **different body** returns `409 idempotency_conflict`.
- Stored responses expire after ~24 hours.

Generate a unique key (e.g. a UUID v4) per logical operation — not per HTTP attempt. The point is that all attempts at *one* logical write share a key.

```{admonition} Which endpoints honour it
:class: note

Endpoints that support idempotency are marked **Idempotent** in the
[endpoint reference](./endpoints/index.md). Sending the header to an endpoint
that doesn't support it is harmless — it's ignored.
```
