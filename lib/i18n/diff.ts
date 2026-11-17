export type Catalog =
  Record<
    string,
    string
  >;

// Legacy catalogs can contain nested values despite the flat Catalog contract.
// Compare their contents, not the identity of separately parsed JSON objects.
const sameValue =
  (
    left: unknown,
    right: unknown,
  ) =>
    JSON.stringify(
      left,
    ) ===
    JSON.stringify(
      right,
    );

/**
 * Keys needing (re)translation: missing in target, or whose recorded English
 * source no longer matches the current English source. Human-edited target
 * values survive unless their English changes.
 */
export function keysToTranslate(args: {
  source: Catalog;
  sources: Catalog;
  target: Catalog;
}): string[] {
  const {
    source,
    sources,
    target,
  } =
    args;
  return Object.keys(
    source,
  ).filter(
    (
      key,
    ) =>
      !(
        key in
        target
      ) ||
      (key in
        sources &&
        !sameValue(
          sources[
            key
          ],
          source[
            key
          ],
        )),
  );
}

const PLURAL_CATEGORIES =
  [
    'zero',
    'one',
    'two',
    'few',
    'many',
    'other',
  ] as const;

/** `count_few` -> { base: 'count', category: 'few' }; anything else -> null. */
export function splitPlural(
  key: string,
): {
  base: string;
  category: string;
} | null {
  const i =
    key.lastIndexOf(
      '_',
    );
  if (
    i <=
    0
  )
    return null;
  const category =
    key.slice(
      i +
        1,
    );
  return (
    PLURAL_CATEGORIES as readonly string[]
  ).includes(
    category,
  )
    ? {
        base: key.slice(
          0,
          i,
        ),
        category,
      }
    : null;
}

/** Base keys English declares as plural groups (the same rule as the catalog test). */
function pluralBases(
  english: Catalog,
): Set<string> {
  const bases =
    new Set<string>();
  for (const key of Object.keys(
    english,
  )) {
    const p =
      splitPlural(
        key,
      );
    if (
      p
    )
      bases.add(
        p.base,
      );
  }
  return bases;
}

/** The plural categories a language requires, per CLDR. */
export function pluralCategories(
  locale: string,
): string[] {
  return [
    ...new Intl.PluralRules(
      locale,
    ).resolvedOptions()
      .pluralCategories,
  ].sort();
}

/**
 * The English catalog re-shaped to one locale's plural categories: what that
 * locale's catalog must contain. Japanese gets only `x_other`; Russian gets
 * `x_one`, `x_few`, `x_many` and `x_other`, the forms English lacks taking the
 * English `_other` text as their source (the model is told which form each
 * key is). Everything that is not a plural group is unchanged.
 */
export function localeSource(
  english: Catalog,
  categories: readonly string[],
): Catalog {
  const bases =
    pluralBases(
      english,
    );
  const out: Catalog =
    {};
  for (const [
    key,
    value,
  ] of Object.entries(
    english,
  )) {
    const p =
      splitPlural(
        key,
      );
    if (
      !p ||
      !bases.has(
        p.base,
      )
    )
      out[
        key
      ] =
        value;
  }
  for (const base of bases) {
    const fallback =
      english[
        `${base}_other`
      ] ??
      Object.entries(
        english,
      ).find(
        ([
          k,
        ]) =>
          splitPlural(
            k,
          )
            ?.base ===
          base,
      )?.[1];
    for (const category of categories) {
      const value =
        english[
          `${base}_${category}`
        ] ??
        fallback;
      if (
        value !==
        undefined
      )
        out[
          `${base}_${category}`
        ] =
          value;
    }
  }
  return out;
}

/**
 * Make a catalog safe to write. Removes keys English no longer has, plural forms
 * the language does not use (dead keys i18next can never select), and every
 * plural group that is not whole. A new file that reuse alone could not
 * complete is not written at all (a locale with no file has not started that
 * namespace); `paid` lifts that last rule only, so model output is never thrown
 * away for being partial. Returns false when the file should not be written.
 */
export function settleCatalog(args: {
  english: Catalog;
  source: Catalog;
  categories: readonly string[];
  target: Catalog;
  sources: Catalog;
  existed: boolean;
  paid: boolean;
}): boolean {
  const {
    english,
    source,
    categories,
    target,
    sources,
  } =
    args;
  // Keys English no longer has: nothing can ask for them. Pruned here because a
  // pull request that removes an English key cannot touch the other catalogs.
  for (const key of Object.keys(
    target,
  )) {
    if (
      !(
        key in
        source
      )
    )
      delete target[
        key
      ];
  }
  for (const key of Object.keys(
    sources,
  )) {
    if (
      !(
        key in
        source
      )
    )
      delete sources[
        key
      ];
  }
  const bases =
    pluralBases(
      english,
    );
  for (const key of Object.keys(
    target,
  )) {
    const p =
      splitPlural(
        key,
      );
    if (
      p &&
      bases.has(
        p.base,
      ) &&
      !categories.includes(
        p.category,
      )
    ) {
      delete target[
        key
      ];
      delete sources[
        key
      ];
    }
  }
  // A plural group is written whole or not at all: with a form missing, the
  // count falls back to English mid-sentence for some numbers. This holds for
  // paid output too (a failed batch can leave a group half-filled), and for a
  // group an older catalog already carried half-filled; the next run sends the
  // whole group again.
  for (const base of bases) {
    const keys =
      categories
        .map(
          (
            c,
          ) =>
            `${base}_${c}`,
        )
        .filter(
          (
            k,
          ) =>
            k in
            source,
        );
    const present =
      keys.filter(
        (
          k,
        ) =>
          k in
          target,
      );
    if (
      present.length ===
        0 ||
      present.length ===
        keys.length
    )
      continue;
    for (const k of present) {
      delete target[
        k
      ];
      delete sources[
        k
      ];
    }
  }
  if (
    !args.paid &&
    !args.existed &&
    Object.keys(
      source,
    ).some(
      (
        k,
      ) =>
        !(
          k in
          target
        ),
    )
  ) {
    return false;
  }
  return true;
}

/** Memory and dedupe identity: the same English in the same plural form. */
function memoryKey(
  key: string,
  english: string,
): string {
  return `${splitPlural(key)?.category ?? ''}\u0000${english}`;
}

/**
 * Whether `target` already holds a translation of today's English for `key`:
 * the exact rule {@link keysToTranslate} pays by, so anything this says is
 * current is never sent again.
 */
function isCurrent(
  key: string,
  source: Catalog,
  target: Catalog,
  sources: Catalog,
): boolean {
  if (
    !(
      key in
      target
    )
  )
    return false;
  return (
    !(
      key in
      sources
    ) ||
    sameValue(
      sources[
        key
      ],
      source[
        key
      ],
    )
  );
}

/**
 * An entry with no recorded source whose value IS the English: a placeholder
 * an old extract or a manual copy left behind, not a translation. The planner
 * does not pay to replace these (that would be new spend nobody asked for),
 * but a translation that was already paid for may take their place.
 */
function isEnglishPlaceholder(
  key: string,
  source: Catalog,
  target: Catalog,
  sources: Catalog,
): boolean {
  return (
    key in
      target &&
    !(
      key in
      sources
    ) &&
    typeof source[
      key
    ] ===
      'string' &&
    hasWords(
      source[
        key
      ],
    ) &&
    sameValue(
      target[
        key
      ],
      source[
        key
      ],
    )
  );
}

/**
 * Take a translation that was already paid for (the pending translation PR, an
 * older run's branch) wherever this catalog does not hold a current one.
 *
 * A candidate qualifies only when it was made from today's English. A human
 * correction on main is safe: it is current (its recorded English matches), so
 * it is never replaced. Returns how many keys were taken.
 */
export function adoptPaidTranslations(args: {
  source: Catalog;
  target: Catalog;
  sources: Catalog;
  paidTarget: Catalog;
  paidSources: Catalog;
}): number {
  const {
    source,
    target,
    sources,
    paidTarget,
    paidSources,
  } =
    args;
  let adopted = 0;
  for (const [
    key,
    english,
  ] of Object.entries(
    paidSources,
  )) {
    const text =
      paidTarget[
        key
      ];
    if (
      typeof english !==
        'string' ||
      english !==
        source[
          key
        ] ||
      typeof text !==
        'string' ||
      !text.trim()
    ) {
      continue;
    }
    if (
      isCurrent(
        key,
        source,
        target,
        sources,
      ) &&
      !isEnglishPlaceholder(
        key,
        source,
        target,
        sources,
      )
    ) {
      continue;
    }
    if (
      target[
        key
      ] ===
        text &&
      sources[
        key
      ] ===
        english
    )
      continue;
    target[
      key
    ] =
      text;
    sources[
      key
    ] =
      english;
    adopted++;
  }
  return adopted;
}

/** Plan a merge's work, reusing paid translations from the pending PR. */
export function planCatalogTranslations(args: {
  source: Catalog;
  previousSource?: Catalog;
  target: Catalog;
  sources: Catalog;
  pendingTarget?: Catalog;
  pendingSources?: Catalog;
}): {
  target: Catalog;
  sources: Catalog;
  todo: string[];
} {
  const {
    source,
    previousSource,
  } =
    args;
  const target =
    {
      ...args.target,
    };
  const sources =
    {
      ...args.sources,
    };
  adoptPaidTranslations(
    {
      source,
      target,
      sources,
      paidTarget:
        args.pendingTarget ??
        {},
      paidSources:
        args.pendingSources ??
        {},
    },
  );
  const todo =
    keysToTranslate(
      {
        source,
        // Old catalogs may predate source tracking. The merge's previous English
        // still lets us identify an outdated translation after an English edit.
        sources:
          {
            ...previousSource,
            ...sources,
          },
        target,
      },
    ).filter(
      (
        key,
      ) =>
        !previousSource ||
        !sameValue(
          previousSource[
            key
          ],
          source[
            key
          ],
        ),
    );
  // Numbers, symbols and bare placeholders ("10", "—", "{{done}}/{{total}}")
  // read the same in every locale, so copy them instead of paying for a call.
  const paid =
    todo.filter(
      (
        key,
      ) => {
        const english =
          source[
            key
          ];
        if (
          typeof english !==
            'string' ||
          hasWords(
            english,
          )
        )
          return true;
        target[
          key
        ] =
          english;
        sources[
          key
        ] =
          english;
        return false;
      },
    );
  return {
    target,
    sources,
    todo: paid,
  };
}

/** One namespace of one locale, planned and waiting for its paid keys. */
export interface CatalogPlan {
  source: Catalog;
  target: Catalog;
  sources: Catalog;
  todo: string[];
}

/**
 * (plural form, English) -> a current translation of it, gathered from every
 * namespace of one locale. The plural form is part of the identity: Russian
 * `_few` and `_many` share their English source but never their translation. Only entries whose recorded English matches today's English count: a
 * legacy entry with no record may be a translation of older English.
 */
export function translationMemory(
  plans: readonly CatalogPlan[],
): Map<
  string,
  string
> {
  const memory =
    new Map<
      string,
      string
    >();
  for (const {
    source,
    target,
    sources,
  } of plans) {
    for (const [
      key,
      english,
    ] of Object.entries(
      source,
    )) {
      const text =
        target[
          key
        ];
      if (
        typeof english ===
          'string' &&
        hasWords(
          english,
        ) &&
        sources[
          key
        ] ===
          english &&
        typeof text ===
          'string' &&
        text.trim() &&
        !memory.has(
          memoryKey(
            key,
            english,
          ),
        )
      ) {
        memory.set(
          memoryKey(
            key,
            english,
          ),
          text,
        );
      }
    }
  }
  return memory;
}

/**
 * Fill every todo key whose exact English already has a current translation in
 * this locale ("Cancel" in forty namespaces is paid for once), and replace any
 * English placeholder the same way. Mutates the plans and returns how many keys
 * were filled for free.
 */
export function applyTranslationMemory(
  plans: readonly CatalogPlan[],
  memory: ReadonlyMap<
    string,
    string
  >,
): number {
  let filled = 0;
  for (const plan of plans) {
    const fill =
      (
        key: string,
      ): boolean => {
        const english =
          plan
            .source[
            key
          ];
        const text =
          typeof english ===
          'string'
            ? memory.get(
                memoryKey(
                  key,
                  english,
                ),
              )
            : undefined;
        if (
          text ===
          undefined
        )
          return false;
        plan.target[
          key
        ] =
          text;
        plan.sources[
          key
        ] =
          english as string;
        filled++;
        return true;
      };
    plan.todo =
      plan.todo.filter(
        (
          key,
        ) =>
          !fill(
            key,
          ),
      );
    for (const key of Object.keys(
      plan.source,
    )) {
      if (
        isEnglishPlaceholder(
          key,
          plan.source,
          plan.target,
          plan.sources,
        )
      )
        fill(
          key,
        );
    }
  }
  return filled;
}

/** A todo key that waits on another key with the same English. */
export interface Follower<
  P extends
    CatalogPlan,
> {
  plan: P;
  key: string;
  /** The plan and key that is actually sent. */
  ownerPlan: P;
  ownerKey: string;
}

/**
 * Send each distinct English string once per locale. The first todo key with a
 * given English stays in its plan's todo (and keeps its real key, so the model
 * still sees the context); later keys with the same English are removed from
 * their todo and returned as followers that copy the owner's answer.
 */
export function dedupeTodo<
  P extends
    CatalogPlan,
>(
  plans: readonly P[],
): Follower<P>[] {
  const owners =
    new Map<
      string,
      {
        plan: P;
        key: string;
      }
    >();
  const followers: Follower<P>[] =
    [];
  for (const plan of plans) {
    plan.todo =
      plan.todo.filter(
        (
          key,
        ) => {
          const english =
            plan
              .source[
              key
            ];
          if (
            typeof english !==
            'string'
          )
            return true;
          const id =
            memoryKey(
              key,
              english,
            );
          const owner =
            owners.get(
              id,
            );
          if (
            !owner
          ) {
            owners.set(
              id,
              {
                plan,
                key,
              },
            );
            return true;
          }
          followers.push(
            {
              plan,
              key,
              ownerPlan:
                owner.plan,
              ownerKey:
                owner.key,
            },
          );
          return false;
        },
      );
  }
  return followers;
}

function hasWords(
  text: string,
): boolean {
  return /\p{L}/u.test(
    text.replace(
      /\{\{[^}]*\}\}/g,
      '',
    ),
  );
}

/** Never mark a missing/malformed answer as translated by saving English. */
export function validateTranslationBatch(
  entries: Catalog,
  value: unknown,
): Catalog {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      'Translation response must be a JSON object',
    );
  }
  const translated =
    value as Record<
      string,
      unknown
    >;
  const result: Catalog =
    {};
  for (const key of Object.keys(
    entries,
  )) {
    const text =
      translated[
        key
      ];
    if (
      typeof text !==
        'string' ||
      !text.trim()
    ) {
      throw new Error(
        `Translation response is missing key: ${key}`,
      );
    }
    result[
      key
    ] =
      text;
  }
  return result;
}

/**
 * Split a catalog's todo keys into request-sized batches without ever splitting
 * a plural group (`x_one`, `x_few`, `x_other`, ...): a group is answered, or
 * fails, as a unit, so a failed batch cannot leave one half-filled. A group
 * larger than `size` gets a batch of its own.
 */
export function batchKeys(
  todo: readonly string[],
  size: number,
): string[][] {
  const groups =
    new Map<
      string,
      string[]
    >();
  for (const key of todo) {
    const id =
      splitPlural(
        key,
      )
        ?.base ??
      `\u0000${key}`;
    const group =
      groups.get(
        id,
      ) ??
      [];
    group.push(
      key,
    );
    groups.set(
      id,
      group,
    );
  }
  const batches: string[][] =
    [];
  let current: string[] =
    [];
  for (const group of groups.values()) {
    if (
      current.length >
        0 &&
      current.length +
        group.length >
        size
    ) {
      batches.push(
        current,
      );
      current =
        [];
    }
    current.push(
      ...group,
    );
  }
  if (
    current.length >
    0
  )
    batches.push(
      current,
    );
  return batches;
}

/**
 * The first complete JSON object in a model reply. Models sometimes wrap it in
 * a code fence or follow it with a second object or a sentence; JSON.parse on
 * the whole reply then fails and a paid batch is thrown away.
 */
export function parseModelJson(
  reply: string,
): unknown {
  const start =
    reply.indexOf(
      '{',
    );
  if (
    start <
    0
  )
    throw new Error(
      'No JSON object in the reply',
    );
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (
    let i =
      start;
    i <
    reply.length;
    i++
  ) {
    const ch =
      reply[
        i
      ];
    if (
      inString
    ) {
      if (
        escaped
      )
        escaped = false;
      else if (
        ch ===
        '\\'
      )
        escaped = true;
      else if (
        ch ===
        '"'
      )
        inString = false;
      continue;
    }
    if (
      ch ===
      '"'
    )
      inString = true;
    else if (
      ch ===
      '{'
    )
      depth++;
    else if (
      ch ===
        '}' &&
      --depth ===
        0
    )
      return JSON.parse(
        reply.slice(
          start,
          i +
            1,
        ),
      );
  }
  throw new Error(
    'Unterminated JSON object in the reply',
  );
}
