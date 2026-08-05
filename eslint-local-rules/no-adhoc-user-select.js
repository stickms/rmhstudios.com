/**
 * `local/no-adhoc-user-select` — every Prisma select on `User` must go through
 * one of the shared fragments in `lib/user-display.ts`.
 *
 * ## What this is protecting
 *
 * `lib/user-display.ts` exports `userChipSelect`, `userDisplaySelect` and
 * `userProfileSelect`. `userDisplaySelect` is not just a field list: it joins
 * `profile` (the custom display name / avatar a user set) and `inventory`
 * (their equipped cosmetics), and `resolveUser` collapses those into the shape
 * the UI renders.
 *
 * A hand-written `select: { id: true, name: true, image: true }` therefore
 * produces a *different user* than the rest of the site does — the OAuth name
 * instead of the chosen one, no avatar frame, no name colour — on exactly the
 * surfaces whose author wrote their own select. Nothing errors. It is only
 * visible to users who own cosmetics, which usually does not include whoever
 * wrote the query.
 *
 * ## What it flags
 *
 * Two shapes, matching how the mistake is actually written:
 *
 *   1. `prisma.user.findMany({ select: { … } })` — any `user` model call
 *      (`findMany`, `findUnique`, `findFirst`, `update`, `upsert`, …).
 *   2. `user: { select: { … } }` / `author: { select: { … } }` — a relation
 *      select on a `User` relation nested inside another query.
 *
 * An object literal is accepted when it **spreads a known fragment**
 * (`{ ...userDisplaySelect, email: true }`), because that composes rather than
 * replaces; and any non-literal value (`select: userChipSelect`,
 * `select: someVariable`) is left alone, since the rule can only see syntax.
 *
 * Reported at **warn**: there is an existing backlog, and a rule that turns the
 * build red on day one gets switched off rather than driven to zero.
 */

/** The exported fragments in `lib/user-display.ts` that satisfy this rule. */
const FRAGMENTS = new Set(['userDisplaySelect', 'userProfileSelect', 'userChipSelect']);

/**
 * Property names that hold a `User` relation. `author` is included because it
 * is how the feed, comments and every social surface name the relation, and it
 * is where the cosmetics bug actually shows up.
 */
const USER_RELATION_KEYS = new Set(['user', 'author', 'owner', 'recipient', 'sender']);

/** `lib/user-display.ts` declares the fragments, so it necessarily "violates" this. */
const EXEMPT_FILE = /lib[/\\]user-display\.ts$/;

/** The static name of a property key, or null for a computed one. */
function keyName(property) {
  if (property.type !== 'Property' || property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  return null;
}

/**
 * Fields whose presence means the query is RENDERING a user.
 *
 * The rule's whole rationale is the cosmetics/profile join: a hand-written
 * select shows the OAuth name instead of the chosen one, with no avatar frame
 * and no name colour. That can only go wrong on a query that actually displays
 * the person. A select of `{ id: true }` (an existence check) or
 * `{ id: true, handle: true }` (resolving a mention to an id) renders nothing
 * and cannot exhibit the bug — flagging those trains people to add
 * `eslint-disable` above correct code, which is how a good rule dies.
 */
const DISPLAY_FIELDS = new Set(['name', 'image']);

/** True when this select could render a user, and so must use a fragment. */
function selectsDisplayFields(objectExpression) {
  return objectExpression.properties.some((p) => {
    // A spread of something that is NOT a known fragment could contain anything,
    // including `name`/`image`. The rule can only see syntax, so it stays
    // conservative: unprovable means flagged.
    if (p.type === 'SpreadElement') {
      return !(p.argument.type === 'Identifier' && FRAGMENTS.has(p.argument.name));
    }
    return DISPLAY_FIELDS.has(keyName(p) ?? '');
  });
}

/** True when the object literal composes on top of one of the fragments. */
function spreadsAFragment(objectExpression) {
  return objectExpression.properties.some(
    (p) =>
      p.type === 'SpreadElement' &&
      p.argument.type === 'Identifier' &&
      FRAGMENTS.has(p.argument.name),
  );
}

/** The `select:` property of an object literal, if its value is also a literal. */
function inlineSelectOf(objectExpression) {
  for (const property of objectExpression.properties) {
    if (keyName(property) !== 'select') continue;
    if (property.value.type !== 'ObjectExpression') return null;
    return property.value;
  }
  return null;
}

/** True for `prisma.user.<anything>` / `tx.user.<anything>` member calls. */
function isUserModelCall(node) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return false;
  const model = callee.object;
  if (model.type !== 'MemberExpression' || model.computed) return false;
  return model.property.type === 'Identifier' && model.property.name === 'user';
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require the shared user-display fragments instead of an ad-hoc Prisma select on User.',
    },
    schema: [],
    messages: {
      adhoc:
        'Ad-hoc Prisma select on User. Use userDisplaySelect / userProfileSelect / userChipSelect ' +
        'from @/lib/user-display (or spread one) — a hand-written select drops the profile and ' +
        'cosmetics joins, so this surface renders a different user than the rest of the site.',
    },
  },

  create(context) {
    if (EXEMPT_FILE.test(context.filename)) return {};

    /** @param {import('estree').ObjectExpression | null} select */
    const report = (select) => {
      if (!select || spreadsAFragment(select)) return;
      // Only a select that could render a user can exhibit the bug.
      if (!selectsDisplayFields(select)) return;
      context.report({ node: select, messageId: 'adhoc' });
    };

    return {
      // 1. prisma.user.findMany({ select: { … } })
      CallExpression(node) {
        if (!isUserModelCall(node)) return;
        const [arg] = node.arguments;
        if (!arg || arg.type !== 'ObjectExpression') return;
        report(inlineSelectOf(arg));
      },

      // 2. { user: { select: { … } } } — a nested relation select.
      Property(node) {
        const name = keyName(node);
        if (name === null || !USER_RELATION_KEYS.has(name)) return;
        if (node.value.type !== 'ObjectExpression') return;
        report(inlineSelectOf(node.value));
      },
    };
  },
};

export default rule;
