import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../eslint-local-rules/no-adhoc-user-select.js';
import { userChipSelect, userDisplaySelect, userProfileSelect } from '@/lib/user-display';

/**
 * Two things are checked here, and they are checked separately on purpose.
 *
 * The **fragments** are data: what matters is that the one everything defaults
 * to still carries the joins that make a user render correctly (`profile` for a
 * custom display name/avatar, `inventory` for equipped cosmetics). Those two
 * keys disappearing is the exact regression the rule exists to prevent, and the
 * rule cannot catch it — it only polices call sites.
 *
 * The **rule** is code, so it gets a RuleTester: the interesting cases are the
 * ones it must NOT flag (a fragment passed by reference, a spread that composes
 * on top of one, a `select` on some other model), because a lint rule that
 * cries wolf gets switched off and stops protecting anything.
 */

describe('user-display fragments', () => {
  it('keeps the joins that make a user render correctly', () => {
    // Drop either of these and every surface using the fragment silently
    // renders the raw OAuth name/avatar with no cosmetics.
    expect(userDisplaySelect.profile).toBeDefined();
    expect(userDisplaySelect.inventory).toBeDefined();
    expect(userDisplaySelect.inventory.where).toEqual({ equipped: true });
  });

  it('has a profile fragment that is a superset of the display fragment', () => {
    for (const key of Object.keys(userDisplaySelect)) {
      expect(userProfileSelect).toHaveProperty(key);
    }
    // …and adds the counts a profile header would otherwise aggregate for.
    expect(userProfileSelect).toMatchObject({
      followerCount: true,
      followingCount: true,
      postCount: true,
      createdAt: true,
    });
  });

  it('keeps the chip fragment minimal but linkable', () => {
    // A chip renders a link and a label; anything more and the caller should
    // have reached for userDisplaySelect instead.
    expect(Object.keys(userChipSelect).sort()).toEqual(['handle', 'id', 'image', 'name']);
  });
});

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// `RuleTester.run` calls the ambient `describe`/`it` itself, so it has to sit at
// the top level — nesting it inside an `it()` makes vitest reject the suite.
ruleTester.run('local/no-adhoc-user-select', rule, {
  valid: [
    // The fragment passed by reference — the shape this rule is steering to.
    { code: 'prisma.user.findMany({ select: userDisplaySelect });' },
    { code: 'const q = { user: { select: userChipSelect } };' },
    // A select with no display fields cannot exhibit the bug this rule guards:
    // `{ id, handle }` resolves a mention to an id and renders nobody, so the
    // missing profile/cosmetics joins are irrelevant. Flagging it would train
    // people to write `eslint-disable` above correct code.
    { code: 'await tx.user.update({ where: { id }, select: { id: true, handle: true } });' },
    { code: 'prisma.user.findUnique({ where: { id }, select: { id: true } });' },
    // Composing on top of a fragment keeps the joins, so it is allowed.
    {
      code: 'prisma.user.findFirst({ select: { ...userDisplaySelect, email: true } });',
    },
    { code: 'const q = { author: { select: { ...userProfileSelect, bio: true } } };' },
    // A select on a different model is none of this rule's business.
    { code: 'prisma.rMHark.findMany({ select: { id: true, content: true } });' },
    // No inline literal to judge.
    { code: 'prisma.user.findMany({ where: { id } });' },
    { code: 'const q = { user: { select: buildSelect() } };' },
    // The file that declares the fragments necessarily "violates" the rule.
    {
      code: 'export const userChipSelect = { id: true };\nprisma.user.findMany({ select: { id: true } });',
      filename: '/repo/lib/user-display.ts',
    },
  ],
  invalid: [
    {
      code: 'prisma.user.findMany({ select: { id: true, name: true, image: true } });',
      errors: [{ messageId: 'adhoc' }],
    },
    {
      code: 'const q = { include: { user: { select: { id: true, name: true } } } };',
      errors: [{ messageId: 'adhoc' }],
    },
    {
      code: 'const q = { include: { author: { select: { id: true, name: true } } } };',
      errors: [{ messageId: 'adhoc' }],
    },
    {
      // A spread of something that is not a fragment does not launder it.
      code: 'prisma.user.findMany({ select: { ...baseSelect, id: true } });',
      errors: [{ messageId: 'adhoc' }],
    },
  ],
});
