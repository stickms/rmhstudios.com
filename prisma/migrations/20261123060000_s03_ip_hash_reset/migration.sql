-- Anonymous view deduplication hashes were unkeyed SHA-256 of the client address (reversible over IPv4).
-- Null them; new views store a keyed hash. Null hashes never collide in the (parent, ip_hash) unique indexes.
UPDATE "rmheet_comment_view" SET "ipHash" = NULL WHERE "ipHash" IS NOT NULL;
UPDATE "build_view" SET "ipHash" = NULL WHERE "ipHash" IS NOT NULL;
