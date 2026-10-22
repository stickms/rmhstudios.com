import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { effectiveRules } from '@/lib/ops/alarm-rules';
import {
  KNOWN_RULE_KEYS,
  evaluateMetricAlarms,
  loadOverrides,
  setOverride,
} from '@/lib/ops/alarm-rules.server';

const patchSchema = z.object({
  key: z.string().max(160),
  /** null = use the value in lib/ops/alarm-rules.ts. */
  threshold: z.number().finite().nonnegative().max(1e9).nullable(),
  muted: z.boolean(),
});

/**
 * GET   /api/admin/oncall-rules — every metric alarm rule (code + overrides)
 *        with its current window value per dimension.
 * PATCH /api/admin/oncall-rules — override a rule's threshold or mute it;
 *        `{threshold: null, muted: false}` resets it to the code. Audited.
 * Admin only.
 */
export const Route = createFileRoute('/api/admin/oncall-rules')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', label: 'admin-oncall-rules' },
        async () => {
          const [overrides, evaluations] = await Promise.all([
            loadOverrides(),
            evaluateMetricAlarms(),
          ]);
          const rules = effectiveRules(overrides).map((r) => ({
            ...r,
            evaluations: evaluations
              .filter((e) => e.rule.key === r.key)
              .map(({ dim, current, samples, active }) => ({ dim, current, samples, active })),
          }));
          return Response.json({ rules }, { headers: { 'Cache-Control': 'no-store' } });
        },
      ),
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: patchSchema, label: 'admin-oncall-rules-patch' },
        async ({ userId, body }) => {
          if (!KNOWN_RULE_KEYS.has(body.key)) {
            return Response.json({ error: 'unknown_rule' }, { status: 404 });
          }
          await setOverride(body.key, { threshold: body.threshold, muted: body.muted }, userId);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
