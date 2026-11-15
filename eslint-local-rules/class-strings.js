/**
 * Shared plumbing for the class-string rules (`no-raw-palette-color`,
 * `no-hardcoded-radius`, `no-transition-all`, `no-dead-animate-classes`).
 *
 * A "class string" is any string literal or template chunk that sits inside
 *   - a `className=` / `class=` JSX attribute (however deeply nested: ternaries,
 *     `cn(...)`, template literals), or
 *   - the arguments of `cn()` / `clsx()` / `cva()` / `twMerge()` / `classNames()`
 *     wherever that call appears (a `cva` variant table defined at module scope
 *     is the usual case).
 *
 * `visitors(context, check)` returns the selector map to merge into a rule's
 * `create()` result. `check(node, text)` is called once per string. Depth
 * counters rather than ancestor walks keep it O(nodes).
 */

const CLASS_HELPERS =
  new Set(
    [
      'cn',
      'clsx',
      'cva',
      'twMerge',
      'classNames',
    ],
  );

function isClassAttribute(
  node,
) {
  return (
    node.name &&
    node
      .name
      .type ===
      'JSXIdentifier' &&
    (node
      .name
      .name ===
      'className' ||
      node
        .name
        .name ===
        'class')
  );
}

function isClassHelperCall(
  node,
) {
  return (
    node
      .callee
      .type ===
      'Identifier' &&
    CLASS_HELPERS.has(
      node
        .callee
        .name,
    )
  );
}

/**
 * @param {(node: import('estree').Node, text: string) => void} check
 */
export function classStringVisitors(
  check,
) {
  let depth = 0;
  return {
    JSXAttribute(
      node,
    ) {
      if (
        isClassAttribute(
          node,
        )
      )
        depth++;
    },
    'JSXAttribute:exit'(
      node,
    ) {
      if (
        isClassAttribute(
          node,
        )
      )
        depth--;
    },
    CallExpression(
      node,
    ) {
      if (
        isClassHelperCall(
          node,
        )
      )
        depth++;
    },
    'CallExpression:exit'(
      node,
    ) {
      if (
        isClassHelperCall(
          node,
        )
      )
        depth--;
    },
    Literal(
      node,
    ) {
      if (
        depth >
          0 &&
        typeof node.value ===
          'string'
      )
        check(
          node,
          node.value,
        );
    },
    TemplateElement(
      node,
    ) {
      if (
        depth >
        0
      )
        check(
          node,
          node
            .value
            .cooked ??
            node
              .value
              .raw,
        );
    },
  };
}

/**
 * Build a rule that reports every match of `pattern` in a class string.
 *
 * @param {object} opts
 * @param {string} opts.description
 * @param {string} opts.message   may use `{{match}}`
 * @param {RegExp} opts.pattern   must carry the `g` flag
 */
export function createPatternRule({
  description,
  message,
  pattern,
}) {
  return {
    meta: {
      type: 'problem',
      docs: {
        description,
      },
      schema:
        [],
      messages:
        {
          found:
            message,
        },
    },
    create(
      context,
    ) {
      return classStringVisitors(
        (
          node,
          text,
        ) => {
          pattern.lastIndex = 0;
          let m;
          while (
            (m =
              pattern.exec(
                text,
              ))
          ) {
            context.report(
              {
                node,
                messageId:
                  'found',
                data: {
                  match:
                    m[0],
                },
              },
            );
            if (
              m[0] ===
              ''
            )
              pattern.lastIndex++;
          }
        },
      );
    },
  };
}
