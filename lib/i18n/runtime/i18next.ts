/**
 * The site's translation runtime: the part of i18next 27 the site uses, and
 * nothing else (modernization audit, "small translation runtime").
 *
 * `i18next` resolves to this file in every build (vite.config.ts,
 * vite.islands.config.ts, vitest.config.ts: `I18N_RUNTIME_ALIASES` in
 * vite.shared.ts), so the call sites keep importing `i18next` and keep its
 * types. Server tools that run outside Vite (scripts/) still get the real
 * package.
 *
 * What it implements, matching i18next 27.1.5 line for line where it matters:
 * - flat JSON catalogs per (language, namespace), `ns:key` keys, `ns` arrays;
 * - the lookup order per language — `key_zero` (count 0), `key_<plural>`, `key`,
 *   `key_other` — over the language, then `fallbackLng`;
 * - empty strings and non-strings count as missing; then the call's
 *   `defaultValue` (plural-aware: `defaultValue_<plural>`), then the key;
 * - `{{var}}` interpolation from the options (or `replace`), dotted paths, an
 *   unknown variable left in place, one passed as `undefined` written as '';
 * - postProcessors, a backend with i18next's queue and load states, the
 *   `initialized` / `languageChanged` / `loaded` / `failedLoading` events,
 *   `missingKeyHandler` with `saveMissing`.
 *
 * What it does not: nesting (`$t(...)`), formatters (`{{x, number}}`),
 * `{{- x}}`, context, ordinals, `returnObjects`, `keyPrefix`, language
 * detectors. lib/i18n/__tests__/runtime-parity.test.ts fails if a catalog, a
 * default or a `t()` call starts using one, and compares this runtime with
 * i18next on every key of every shipped locale.
 */
import type { i18n as I18n } from 'i18next';

type Bundle =
  Record<
    string,
    unknown
  >;
type Options =
  Record<
    string,
    any
  >;
// Listeners take whatever their event carries; each registers with its own parameter types.
type Listener =
  (
    ...args: never[]
  ) => void;
type ReadCallback =
  (
    err: unknown,
    data:
      | Bundle
      | null
      | false,
  ) => void;
interface Backend {
  type: 'backend';
  init?: (
    ...args: unknown[]
  ) => void;
  read: (
    language: string,
    namespace: string,
    callback: ReadCallback,
  ) => unknown;
}
interface PostProcessor {
  type: 'postProcessor';
  name: string;
  process: (
    value: string,
    key: string[],
    options: Options,
    translator: unknown,
  ) =>
    | string
    | undefined;
}
interface LoadQueueItem {
  pending: Set<string>;
  loaded: Record<
    string,
    string[]
  >;
  errors: unknown[];
  done?: boolean;
  callback: (
    errors?: unknown[],
  ) => void;
}

const has =
  (
    o: unknown,
    k: string,
  ) =>
    o !=
      null &&
    Object.prototype.hasOwnProperty.call(
      o,
      k,
    );
const isString =
  (
    v: unknown,
  ): v is string =>
    typeof v ===
    'string';
const makeString =
  (
    v: unknown,
  ) =>
    v ==
    null
      ? ''
      : String(
          v,
        );
const ENTITIES: Record<
  string,
  string
> =
  {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
const escapeHtml =
  (
    v: unknown,
  ) =>
    isString(
      v,
    )
      ? v.replace(
          /[&<>"']/g,
          (
            c,
          ) =>
            ENTITIES[
              c
            ]!,
        )
      : v;

/** i18next's getPath + deepFind: a dotted path into nested data, or a flat key that contains dots. */
function getPath(
  object: unknown,
  path: string[],
): unknown {
  let obj =
    object as
      | Record<
          string,
          unknown
        >
      | string
      | null
      | undefined;
  for (
    let i = 0;
    i <
    path.length -
      1;
    i++
  ) {
    if (
      !obj ||
      isString(
        obj,
      )
    )
      return undefined;
    obj =
      (
        has(
          obj,
          path[
            i
          ]!,
        )
          ? obj[
              path[
                i
              ]!
            ]
          : {}
      ) as typeof obj;
  }
  if (
    !obj ||
    isString(
      obj,
    )
  )
    return undefined;
  const k =
    path[
      path.length -
        1
    ]!;
  return has(
    obj,
    k,
  )
    ? obj[
        k
      ]
    : undefined;
}
function deepFind(
  input: unknown,
  path: string,
): unknown {
  const obj =
    input as
      | Record<
          string,
          unknown
        >
      | null
      | undefined;
  if (
    !obj
  )
    return undefined;
  if (
    obj[
      path
    ]
  )
    return has(
      obj,
      path,
    )
      ? obj[
          path
        ]
      : undefined;
  const tokens =
    path.split(
      '.',
    );
  let current: unknown =
    obj;
  for (
    let i = 0;
    i <
    tokens.length;
  ) {
    if (
      !current ||
      typeof current !==
        'object'
    )
      return undefined;
    const node =
      current as Record<
        string,
        unknown
      >;
    let next: unknown;
    let nextPath =
      '';
    for (
      let j =
        i;
      j <
      tokens.length;
      ++j
    ) {
      if (
        j !==
        i
      )
        nextPath +=
          '.';
      nextPath +=
        tokens[
          j
        ];
      next =
        node[
          nextPath
        ];
      if (
        (typeof next ===
          'function' ||
          nextPath ===
            '__proto__') &&
        !has(
          node,
          nextPath,
        )
      )
        next =
          undefined;
      if (
        next !==
        undefined
      ) {
        if (
          [
            'string',
            'number',
            'boolean',
          ].includes(
            typeof next,
          ) &&
          j <
            tokens.length -
              1
        )
          continue;
        i +=
          j -
          i +
          1;
        break;
      }
    }
    current =
      next;
  }
  return current;
}
const lookup =
  (
    data: unknown,
    key: string,
  ) => {
    const found =
      getPath(
        data,
        key.split(
          '.',
        ),
      );
    return found !=
      null
      ? found
      : deepFind(
          data,
          key,
        );
  };

/** i18next's looksLikeObjectPath: a key with spaces or punctuation is natural language, never `ns:key`. */
function looksLikeObjectPath(
  key: string,
): boolean {
  const r =
    /( |,|\?|!|;)/;
  if (
    !r.test(
      key,
    )
  )
    return true;
  const ki =
    key.indexOf(
      '.',
    );
  return (
    ki >
      0 &&
    !r.test(
      key.substring(
        0,
        ki,
      ),
    )
  );
}

const pluralRules =
  new Map<
    string,
    Intl.PluralRules
  >();
function pluralCategory(
  code:
    | string
    | undefined,
  count: number,
): string {
  const cleaned =
    code ===
    undefined
      ? undefined
      : (code ===
        'dev'
          ? 'en'
          : code
        ).replace(
          /_/g,
          '-',
        );
  let rule =
    pluralRules.get(
      String(
        cleaned,
      ),
    );
  if (
    !rule
  ) {
    try {
      rule =
        new Intl.PluralRules(
          cleaned,
        );
    } catch {
      return count ===
        1
        ? 'one'
        : 'other';
    }
    pluralRules.set(
      String(
        cleaned,
      ),
      rule,
    );
  }
  return rule.select(
    count,
  );
}

const DEFAULTS: Options =
  {
    ns: [
      'translation',
    ],
    defaultNS:
      [
        'translation',
      ],
    fallbackLng:
      [
        'dev',
      ],
    supportedLngs: false,
    pluralSeparator:
      '_',
    saveMissing: false,
    missingKeyHandler: false,
    postProcess: false,
    returnNull: false,
    returnEmptyString: false,
    partialBundledLanguages: false,
    initAsync: true,
    overloadTranslationOptionHandler:
      (
        args: unknown[],
      ) => {
        let ret: Options =
          {};
        if (
          typeof args[1] ===
          'object'
        )
          ret =
            args[1] as Options;
        if (
          isString(
            args[1],
          )
        )
          ret.defaultValue =
            args[1];
        if (
          isString(
            args[2],
          )
        )
          ret.tDescription =
            args[2];
        if (
          typeof args[2] ===
            'object' ||
          typeof args[3] ===
            'object'
        ) {
          const o =
            (args[3] ||
              args[2]) as Options;
          for (const k of Object.keys(
            o,
          ))
            ret[
              k
            ] =
              o[
                k
              ];
        }
        return ret;
      },
    interpolation:
      {
        escapeValue: true,
      },
  };

class Instance {
  options: Options =
    {
      ...DEFAULTS,
    };
  language:
    | string
    | undefined =
    undefined;
  languages: string[] =
    [];
  resolvedLanguage:
    | string
    | undefined =
    undefined;
  isInitialized = false;
  isInitializing = false;
  isLanguageChangingTo:
    | string
    | undefined =
    undefined;
  private initCalled = false;
  /** react-i18next reads `services.backendConnector` in a precheck the site never enables. */
  services: {
    backendConnector: {
      backend:
        | Backend
        | undefined;
      state: Record<
        string,
        number
      >;
    };
  };

  private data: Record<
    string,
    Record<
      string,
      Bundle
    >
  > =
    {};
  private state: Record<
    string,
    number
  > =
    {};
  private backend:
    | Backend
    | undefined =
    undefined;
  private postProcessors: Record<
    string,
    PostProcessor
  > =
    {};
  private external: {
    init?: (
      i: Instance,
    ) => void;
  }[] =
    [];
  private listeners: Record<
    string,
    Set<Listener>
  > =
    {};
  private queue: LoadQueueItem[] =
    [];
  private reading = 0;
  private waitingReads: (() => void)[] =
    [];

  constructor() {
    this.services =
      {
        backendConnector:
          {
            backend:
              undefined,
            state:
              this
                .state,
          },
      };
  }

  // ── events ────────────────────────────────────────────────────────────
  on(
    events: string,
    fn: Listener,
  ) {
    for (const e of events.split(
      ' ',
    ))
      (this.listeners[
        e
      ] ??=
        new Set()).add(
        fn,
      );
    return this;
  }
  off(
    events: string,
    fn?: Listener,
  ) {
    for (const e of events.split(
      ' ',
    )) {
      if (
        fn
      )
        this.listeners[
          e
        ]?.delete(
          fn,
        );
      else
        delete this
          .listeners[
          e
        ];
    }
    return this;
  }
  emit(
    event: string,
    ...args: unknown[]
  ) {
    for (const fn of [
      ...(this
        .listeners[
        event
      ] ??
        []),
    ])
      (
        fn as (
          ...a: unknown[]
        ) => void
      )(
        ...args,
      );
  }

  // ── setup ─────────────────────────────────────────────────────────────
  use(module: {
    type: string;
    name?: string;
    read?: unknown;
    process?: unknown;
    init?: unknown;
  }) {
    if (
      !module?.type
    )
      throw new Error(
        'i18n runtime: use() needs a module with a type',
      );
    if (
      module.type ===
      'backend'
    )
      this.backend =
        module as Backend;
    else if (
      module.type ===
      'postProcessor'
    )
      this.postProcessors[
        module.name!
      ] =
        module as PostProcessor;
    else if (
      module.type ===
      '3rdParty'
    )
      this.external.push(
        module as {
          init?: (
            i: Instance,
          ) => void;
        },
      );
    else
      throw new Error(
        `i18n runtime: unsupported module type "${module.type}"`,
      );
    return this;
  }

  init(
    options: Options = {},
    callback?: (
      err: unknown,
      t: Instance['t'],
    ) => void,
  ): Promise<
    Instance['t']
  > {
    this.isInitializing = true;
    this.initCalled = true;
    if (
      options.defaultNS ==
        null &&
      options.ns
    ) {
      if (
        isString(
          options.ns,
        )
      )
        options.defaultNS =
          options.ns;
      else if (
        !options.ns.includes(
          'translation',
        )
      )
        options.defaultNS =
          options.ns[0];
    }
    const merged: Options =
      {
        ...this
          .options,
        ...options,
      };
    merged.interpolation =
      {
        ...DEFAULTS.interpolation,
        ...options.interpolation,
      };
    if (
      isString(
        merged.ns,
      )
    )
      merged.ns =
        [
          merged.ns,
        ];
    else
      merged.ns =
        [
          ...merged.ns,
        ];
    if (
      isString(
        merged.fallbackLng,
      )
    )
      merged.fallbackLng =
        [
          merged.fallbackLng,
        ];
    if (
      Array.isArray(
        merged.supportedLngs,
      ) &&
      !merged.supportedLngs.includes(
        'cimode',
      )
    ) {
      merged.supportedLngs =
        [
          ...merged.supportedLngs,
          'cimode',
        ];
    }
    this.options =
      merged;
    this.data =
      (options.resources as typeof this.data) ??
      this
        .data;
    this.services.backendConnector.backend =
      this.backend;
    this.backend?.init?.(
      this
        .services,
      merged.backend,
      merged,
    );
    for (const m of this
      .external)
      m.init?.(
        this,
      );
    if (
      merged.fallbackLng &&
      !merged.lng
    ) {
      const codes =
        this.fallbackCodes();
      if (
        codes.length >
          0 &&
        codes[0] !==
          'dev'
      )
        merged.lng =
          codes[0];
    }
    return new Promise(
      (
        resolve,
      ) => {
        const load =
          () => {
            const finish =
              (
                err: unknown,
              ) => {
                this.isInitializing = false;
                this.isInitialized = true;
                this.emit(
                  'initialized',
                  this
                    .options,
                );
                resolve(
                  this
                    .t,
                );
                callback?.(
                  err,
                  this
                    .t,
                );
              };
            if (
              (this
                .languages
                .length ||
                this
                  .isLanguageChangingTo) &&
              !this
                .isInitialized
            )
              return finish(
                null,
              );
            void this.changeLanguage(
              this
                .options
                .lng,
              finish,
            );
          };
        if (
          this
            .options
            .resources ||
          !this
            .options
            .initAsync
        )
          load();
        else
          setTimeout(
            load,
            0,
          );
      },
    );
  }

  // ── languages ─────────────────────────────────────────────────────────
  private fallbackCodes(): string[] {
    const f =
      this
        .options
        .fallbackLng;
    if (
      !f
    )
      return [];
    return isString(
      f,
    )
      ? [
          f,
        ]
      : Array.isArray(
            f,
          )
        ? f
        : [];
  }
  private isSupportedCode(
    code: string,
  ): boolean {
    const s =
      this
        .options
        .supportedLngs;
    return (
      !s ||
      s.includes(
        code,
      )
    );
  }
  /** i18next's toResolveHierarchy for the codes this site uses (`xx` and `xx-YY`), with `load: 'all'`. */
  toResolveHierarchy(
    code:
      | string
      | undefined,
  ): string[] {
    const codes: string[] =
      [];
    const add =
      (
        c:
          | string
          | undefined,
      ) => {
        if (
          c &&
          this.isSupportedCode(
            c,
          ) &&
          !codes.includes(
            c,
          )
        )
          codes.push(
            c,
          );
      };
    if (
      code
    ) {
      if (
        code.includes(
          '-',
        )
      ) {
        add(
          code,
        );
        add(
          code.split(
            '-',
          )[0],
        );
      } else
        add(
          code,
        );
    }
    for (const f of this.fallbackCodes())
      add(
        f,
      );
    return codes;
  }
  private bestMatch(
    codes: string[],
  ):
    | string
    | undefined {
    for (const c of codes)
      if (
        this.isSupportedCode(
          c,
        )
      )
        return c;
    for (const c of codes) {
      const part =
        c.split(
          '-',
        )[0]!;
      if (
        this.isSupportedCode(
          part,
        )
      )
        return part;
    }
    return this.fallbackCodes()[0];
  }
  private hasLanguageSomeTranslations(
    lng:
      | string
      | undefined,
  ): boolean {
    const d =
      lng
        ? this
            .data[
            lng
          ]
        : undefined;
    return (
      !!d &&
      Object.keys(
        d,
      ).some(
        (
          ns,
        ) =>
          d[
            ns
          ] &&
          Object.keys(
            d[
              ns
            ]!,
          )
            .length >
            0,
      )
    );
  }
  private setResolvedLanguage(
    l: string,
  ) {
    if (
      !l ||
      !this
        .languages
        .length ||
      l ===
        'cimode' ||
      l ===
        'dev'
    )
      return;
    this.resolvedLanguage =
      this.languages.find(
        (
          x,
        ) =>
          x !==
            'cimode' &&
          x !==
            'dev' &&
          this.hasLanguageSomeTranslations(
            x,
          ),
      );
    if (
      !this
        .resolvedLanguage &&
      !this.languages.includes(
        l,
      ) &&
      this.hasLanguageSomeTranslations(
        l,
      )
    ) {
      this.resolvedLanguage =
        l;
      this.languages.unshift(
        l,
      );
    }
  }
  private setLngProps(
    l: string,
  ) {
    this.language =
      l;
    this.languages =
      this.toResolveHierarchy(
        l,
      );
    this.resolvedLanguage =
      undefined;
    this.setResolvedLanguage(
      l,
    );
  }

  changeLanguage(
    lng?: string,
    callback?: (
      err: unknown,
      t: Instance['t'],
    ) => void,
  ): Promise<
    Instance['t']
  > {
    this.isLanguageChangingTo =
      lng;
    this.emit(
      'languageChanging',
      lng,
    );
    return new Promise(
      (
        resolve,
      ) => {
        // No language at all: i18next loads only the fallbacks and announces nothing.
        let l =
          !lng
            ? undefined
            : this.hasLanguageSomeTranslations(
                  lng,
                )
              ? lng
              : this.bestMatch(
                  [
                    lng,
                  ],
                );
        if (
          this
            .options
            .supportedLngs &&
          l &&
          !this.isSupportedCode(
            l,
          )
        )
          l =
            this.bestMatch(
              [],
            );
        if (
          l &&
          !this
            .language
        )
          this.setLngProps(
            l,
          );
        this.loadResources(
          l,
          (
            err,
          ) => {
            if (
              l &&
              this
                .isLanguageChangingTo ===
                lng
            ) {
              this.setLngProps(
                l,
              );
              this.isLanguageChangingTo =
                undefined;
              this.emit(
                'languageChanged',
                l,
              );
            } else if (
              !l
            )
              this.isLanguageChangingTo =
                undefined;
            resolve(
              this
                .t,
            );
            callback?.(
              err,
              this
                .t,
            );
          },
        );
      },
    );
  }

  // ── resources ─────────────────────────────────────────────────────────
  getResource(
    lng: string,
    ns: string,
    key?: string,
  ): unknown {
    const bundle =
      this
        .data[
        lng
      ]?.[
        ns
      ];
    if (
      !key
    )
      return bundle;
    return lookup(
      bundle,
      key,
    );
  }
  getResourceBundle(
    lng: string,
    ns: string,
  ) {
    const b =
      this
        .data[
        lng
      ]?.[
        ns
      ];
    return b
      ? {
          ...b,
        }
      : b;
  }
  hasResourceBundle(
    lng: string,
    ns: string,
  ): boolean {
    return (
      this
        .data[
        lng
      ]?.[
        ns
      ] !==
      undefined
    );
  }
  addResourceBundle(
    lng: string,
    ns: string,
    resources: Bundle,
    deep?: boolean,
    overwrite?: boolean,
  ) {
    const langData =
      (this.data[
        lng
      ] ??=
        {});
    let pack: Bundle =
      langData[
        ns
      ] ??
      {};
    if (
      deep
    ) {
      for (const [
        k,
        v,
      ] of Object.entries(
        resources,
      )) {
        if (
          k ===
            '__proto__' ||
          k ===
            'constructor'
        )
          continue;
        if (
          !has(
            pack,
            k,
          ) ||
          overwrite
        )
          pack[
            k
          ] =
            v;
      }
    } else
      pack =
        {
          ...pack,
          ...resources,
        };
    langData[
      ns
    ] =
      pack;
    if (
      !this.options.ns.includes(
        ns,
      )
    )
      this.options.ns.push(
        ns,
      );
    this.emit(
      'added',
      lng,
      ns,
      resources,
    );
    return this;
  }
  // ── loading (i18next's BackendConnector) ──────────────────────────────
  private loadResources(
    language:
      | string
      | undefined,
    callback: (
      err?: unknown,
    ) => void,
  ) {
    if (
      this
        .options
        .resources &&
      !this
        .options
        .partialBundledLanguages
    )
      return callback(
        null,
      );
    const lngs =
      language
        ? this.toResolveHierarchy(
            language,
          )
        : this.fallbackCodes();
    for (const l of this
      .options
      .preload ||
      [])
      for (const c of this.toResolveHierarchy(
        l,
      ))
        if (
          !lngs.includes(
            c,
          )
        )
          lngs.push(
            c,
          );
    this.load(
      lngs,
      this
        .options
        .ns,
      (
        err,
      ) => {
        if (
          !err &&
          !this
            .resolvedLanguage &&
          this
            .language
        )
          this.setResolvedLanguage(
            this
              .language,
          );
        callback(
          err,
        );
      },
    );
  }
  private load(
    languages: string[],
    namespaces: string[],
    callback: (
      errors?: unknown[],
    ) => void,
  ) {
    if (
      !this
        .backend
    )
      return callback();
    const toLoad: string[] =
      [];
    const pending =
      new Set<string>();
    for (const lng of languages) {
      for (const ns of namespaces) {
        const name = `${lng}|${ns}`;
        if (
          this.hasResourceBundle(
            lng,
            ns,
          )
        )
          this.state[
            name
          ] =
            2;
        else if (
          (this
            .state[
            name
          ] ??
            0) <
          0
        ) {
          // failed before: not retried
        } else if (
          this
            .state[
            name
          ] ===
          1
        )
          pending.add(
            name,
          );
        else {
          this.state[
            name
          ] =
            1;
          pending.add(
            name,
          );
          toLoad.push(
            name,
          );
        }
      }
    }
    if (
      pending.size
    )
      this.queue.push(
        {
          pending,
          loaded:
            {},
          errors:
            [],
          callback,
        },
      );
    if (
      !toLoad.length
    ) {
      if (
        !pending.size
      )
        callback();
      return;
    }
    for (const name of toLoad)
      this.read(
        name,
      );
  }
  private read(
    name: string,
  ) {
    if (
      this
        .reading >=
      10
    ) {
      this.waitingReads.push(
        () =>
          this.read(
            name,
          ),
      );
      return;
    }
    this
      .reading++;
    const [
      lng,
      ns,
    ] =
      name.split(
        '|',
      ) as [
        string,
        string,
      ];
    let finished = false;
    const done: ReadCallback =
      (
        err,
        data,
      ) => {
        if (
          finished
        )
          return;
        finished = true;
        this
          .reading--;
        this.waitingReads.shift()?.();
        this.loaded(
          name,
          err,
          data,
        );
      };
    try {
      const r =
        this.backend!.read(
          lng,
          ns,
          done,
        ) as
          | PromiseLike<Bundle>
          | undefined;
      if (
        r &&
        typeof r.then ===
          'function'
      )
        r.then(
          (
            d,
          ) =>
            done(
              null,
              d,
            ),
          (
            e,
          ) =>
            done(
              e,
              null,
            ),
        );
    } catch (err) {
      done(
        err,
        null,
      );
    }
  }
  private loaded(
    name: string,
    err: unknown,
    data:
      | Bundle
      | null
      | false,
  ) {
    const [
      lng,
      ns,
    ] =
      name.split(
        '|',
      ) as [
        string,
        string,
      ];
    if (
      err
    )
      this.emit(
        'failedLoading',
        lng,
        ns,
        err,
      );
    if (
      !err &&
      data
    )
      this.addResourceBundle(
        lng,
        ns,
        data,
      );
    this.state[
      name
    ] =
      err
        ? data
          ? 0
          : -1
        : 2;
    const loaded: Record<
      string,
      Record<
        string,
        boolean
      >
    > = {};
    for (const q of this
      .queue) {
      (q.loaded[
        lng
      ] ??=
        []).push(
        ns,
      );
      q.pending.delete(
        name,
      );
      if (
        err
      )
        q.errors.push(
          err,
        );
      if (
        q
          .pending
          .size ===
          0 &&
        !q.done
      ) {
        for (const [
          l,
          list,
        ] of Object.entries(
          q.loaded,
        )) {
          const into =
            (loaded[
              l
            ] ??=
              {});
          for (const n of list)
            into[
              n
            ] =
              true;
        }
        q.done = true;
        if (
          q
            .errors
            .length
        )
          q.callback(
            q.errors,
          );
        else
          q.callback();
      }
    }
    this.emit(
      'loaded',
      loaded,
    );
    this.queue =
      this.queue.filter(
        (
          q,
        ) =>
          !q.done,
      );
  }

  loadNamespaces(
    ns:
      | string
      | string[],
    callback?: (
      err?: unknown,
    ) => void,
  ): Promise<void> {
    const list =
      isString(
        ns,
      )
        ? [
            ns,
          ]
        : ns;
    for (const n of list)
      if (
        !this.options.ns.includes(
          n,
        )
      )
        this.options.ns.push(
          n,
        );
    return new Promise(
      (
        resolve,
      ) => {
        this.loadResources(
          this
            .language,
          (
            err,
          ) => {
            resolve();
            callback?.(
              err,
            );
          },
        );
      },
    );
  }
  loadLanguages(
    lngs:
      | string
      | string[],
    callback?: (
      err?: unknown,
    ) => void,
  ): Promise<void> {
    const list =
      (
        isString(
          lngs,
        )
          ? [
              lngs,
            ]
          : lngs
      ).filter(
        (
          l,
        ) =>
          !this.options.preload?.includes(
            l,
          ),
      );
    return new Promise(
      (
        resolve,
      ) => {
        if (
          !list.length
        ) {
          resolve();
          return callback?.();
        }
        this.options.preload =
          [
            ...(this
              .options
              .preload ||
              []),
            ...list,
          ];
        this.load(
          list.flatMap(
            (
              l,
            ) =>
              this.toResolveHierarchy(
                l,
              ),
          ),
          this
            .options
            .ns,
          (
            err,
          ) => {
            resolve();
            callback?.(
              err,
            );
          },
        );
      },
    );
  }

  hasLoadedNamespace(
    ns: string,
    options: {
      lng?: string;
      precheck?: (
        i18n: Instance,
        loadNotPending: (
          l: string,
          n: string,
        ) => boolean,
      ) =>
        | boolean
        | undefined;
    } = {},
  ): boolean {
    if (
      !this
        .isInitialized ||
      !this
        .languages
        .length
    )
      return false;
    const lng =
      options.lng ||
      this
        .resolvedLanguage ||
      this
        .languages[0]!;
    const lastLng =
      this
        .languages[
        this
          .languages
          .length -
          1
      ]!;
    if (
      lng.toLowerCase() ===
      'cimode'
    )
      return true;
    const loadNotPending =
      (
        l: string,
        n: string,
      ) =>
        [
          -1,
          0,
          2,
        ].includes(
          this
            .state[
            `${l}|${n}`
          ] as number,
        );
    if (
      options.precheck
    ) {
      const pre =
        options.precheck(
          this,
          loadNotPending,
        );
      if (
        pre !==
        undefined
      )
        return pre;
    }
    if (
      this.hasResourceBundle(
        lng,
        ns,
      )
    )
      return true;
    if (
      !this
        .backend ||
      (this
        .options
        .resources &&
        !this
          .options
          .partialBundledLanguages)
    )
      return true;
    const loadLng =
      !options.lng
        ? lng
        : this.isSupportedCode(
            lng,
          ) &&
          this.toResolveHierarchy(
            lng,
          )[0];
    return (
      (!loadLng ||
        loadNotPending(
          loadLng,
          ns,
        )) &&
      (!this
        .options
        .fallbackLng ||
        loadNotPending(
          lastLng,
          ns,
        ))
    );
  }

  // ── translation ───────────────────────────────────────────────────────
  private extractFromKey(
    key: string,
    opt: Options,
  ): {
    key: string;
    namespaces: string[];
  } {
    let namespaces:
      | string
      | string[] =
      opt.ns ||
      this
        .options
        .defaultNS ||
      [];
    if (
      key.includes(
        ':',
      ) &&
      looksLikeObjectPath(
        key,
      )
    ) {
      const parts =
        key.split(
          ':',
        );
      namespaces =
        parts.shift()!;
      key =
        parts.join(
          '.',
        );
    }
    return {
      key,
      namespaces:
        isString(
          namespaces,
        )
          ? [
              namespaces,
            ]
          : namespaces,
    };
  }
  private isValid(
    res: unknown,
  ): boolean {
    return (
      res !==
        undefined &&
      !(
        !this
          .options
          .returnNull &&
        res ===
          null
      ) &&
      !(
        !this
          .options
          .returnEmptyString &&
        res ===
          ''
      )
    );
  }
  private resolve(
    keys: string[],
    opt: Options,
  ) {
    let found: unknown;
    let usedLng:
      | string
      | undefined;
    let usedNS:
      | string
      | undefined;
    const count =
      opt.count;
    const plural =
      count !==
        undefined &&
      !isString(
        count,
      );
    const zero =
      plural &&
      count ===
        0;
    const sep =
      this
        .options
        .pluralSeparator;
    for (const k of keys) {
      if (
        this.isValid(
          found,
        )
      )
        break;
      const {
        key,
        namespaces,
      } =
        this.extractFromKey(
          k,
          opt,
        );
      const codes =
        this.toResolveHierarchy(
          opt.lng ||
            this
              .language,
        );
      for (const ns of namespaces) {
        if (
          this.isValid(
            found,
          )
        )
          break;
        usedNS =
          ns;
        for (const code of codes) {
          if (
            this.isValid(
              found,
            )
          )
            break;
          usedLng =
            code;
          const finalKeys =
            [
              key,
            ];
          if (
            plural
          ) {
            const suffix = `${sep}${pluralCategory(code, count)}`;
            finalKeys.push(
              key +
                suffix,
            );
            if (
              zero
            )
              finalKeys.push(
                `${key}${sep}zero`,
              );
            if (
              suffix !==
              `${sep}other`
            )
              finalKeys.unshift(
                `${key}${sep}other`,
              );
          }
          let possible:
            | string
            | undefined;
          // i18next stops at the first falsy key, so an empty key never matches.
          while (
            (possible =
              finalKeys.pop())
          ) {
            if (
              !this.isValid(
                found,
              )
            )
              found =
                this.getResource(
                  code,
                  ns,
                  possible,
                );
          }
        }
      }
    }
    return {
      res: found,
      usedLng,
      usedNS,
    };
  }

  private interpolate(
    str: string,
    data: Options,
    opt: Options,
  ): string {
    if (
      !str.includes(
        '{{',
      )
    )
      return str;
    const escapeValue =
      this
        .options
        .interpolation
        ?.escapeValue !==
      false;
    const re =
      /\{\{(.+?)\}\}/g;
    let match: RegExpExecArray | null;
    let replaces = 0;
    while (
      (match =
        re.exec(
          str,
        ))
    ) {
      const name =
        match[1]!.trim();
      const varName =
        name.includes(
          ',',
        )
          ? name
              .split(
                ',',
              )[0]!
              .trim()
          : name;
      let value =
        getPath(
          data,
          varName.split(
            '.',
          ),
        );
      if (
        value ==
        null
      )
        value =
          deepFind(
            data,
            varName,
          );
      if (
        value ===
        undefined
      ) {
        if (
          has(
            opt,
            varName,
          )
        )
          value =
            '';
        else
          continue;
      } else if (
        !isString(
          value,
        )
      )
        value =
          makeString(
            value,
          );
      const safe =
        makeString(
          escapeValue
            ? escapeHtml(
                value,
              )
            : value,
        );
      str =
        str.slice(
          0,
          match.index,
        ) +
        safe +
        str.slice(
          match.index +
            match[0]
              .length,
        );
      re.lastIndex +=
        safe.length -
        match[0]
          .length;
      if (
        ++replaces >=
        1000
      )
        break;
    }
    return str;
  }

  t =
    (
      ...args: unknown[]
    ): unknown =>
      this.translate(
        args[0],
        args[1],
        args.slice(
          2,
        ),
      );

  private translate(
    keysIn: unknown,
    o: unknown,
    rest: unknown[] = [],
  ): unknown {
    let opt: Options =
      typeof o ===
        'object' &&
      o !==
        null
        ? {
            ...(o as Options),
          }
        : this.options.overloadTranslationOptionHandler(
            [
              keysIn,
              o,
              ...rest,
            ],
          );
    if (
      !opt
    )
      opt =
        {};
    // i18next answers '' until init() has run.
    if (
      !this
        .initCalled ||
      keysIn ==
        null
    )
      return '';
    const keys =
      (
        Array.isArray(
          keysIn,
        )
          ? keysIn
          : [
              keysIn,
            ]
      ).map(
        String,
      );
    const {
      key,
      namespaces,
    } =
      this.extractFromKey(
        keys[
          keys.length -
            1
        ]!,
        opt,
      );
    const namespace =
      namespaces[
        namespaces.length -
          1
      ];
    const lng =
      opt.lng ||
      this
        .language;
    const resolved =
      this.resolve(
        keys,
        opt,
      );
    let res: unknown =
      resolved.res;
    const plural =
      opt.count !==
        undefined &&
      !isString(
        opt.count,
      );
    const sep =
      this
        .options
        .pluralSeparator;
    const suffix =
      plural
        ? `${sep}${pluralCategory(lng, opt.count)}`
        : '';
    const zero =
      plural &&
      opt.count ===
        0;
    const hasDefault =
      Object.keys(
        opt,
      ).some(
        (
          k,
        ) =>
          k.startsWith(
            'defaultValue',
          ) &&
          opt[
            k
          ] !==
            undefined,
      );
    const defaultValue =
      (zero &&
        opt[
          `defaultValue${sep}zero`
        ]) ||
      opt[
        `defaultValue${suffix}`
      ] ||
      (opt.defaultValue ??
        (plural
          ? opt[
              `defaultValue${sep}other`
            ]
          : undefined));
    // A namespace object (or any non-string) is not a translation.
    if (
      res !==
        undefined &&
      res !==
        null &&
      typeof res ===
        'object'
    )
      res =
        undefined;
    let usedDefault = false;
    let usedKey = false;
    if (
      !this.isValid(
        res,
      ) &&
      hasDefault
    ) {
      usedDefault = true;
      res =
        defaultValue;
    }
    if (
      !this.isValid(
        res,
      ) &&
      !(
        usedDefault &&
        res ===
          ''
      )
    ) {
      usedKey = true;
      res =
        key;
    }
    if (
      (usedKey ||
        usedDefault) &&
      this
        .options
        .saveMissing &&
      this
        .options
        .missingKeyHandler
    ) {
      this.options.missingKeyHandler(
        this.fallbackCodes(),
        namespace,
        key,
        hasDefault &&
          defaultValue !==
            res
          ? defaultValue
          : res,
        false,
        opt,
      );
    }
    if (
      !opt.skipInterpolation &&
      isString(
        res,
      )
    ) {
      const data =
        opt.replace &&
        !isString(
          opt.replace,
        )
          ? opt.replace
          : opt;
      res =
        this.interpolate(
          res,
          data,
          opt,
        );
    }
    const postProcess =
      opt.postProcess ||
      this
        .options
        .postProcess;
    const names =
      isString(
        postProcess,
      )
        ? [
            postProcess,
          ]
        : postProcess;
    if (
      res !=
        null &&
      names?.length &&
      opt.applyPostProcessor !==
        false
    ) {
      for (const name of names) {
        const p =
          this
            .postProcessors[
            name
          ];
        if (
          p
        )
          res =
            p.process(
              res as string,
              keys,
              opt,
              this,
            ) ??
            res;
      }
    }
    return res;
  }

  getFixedT(
    lng:
      | string
      | string[]
      | null,
    ns?:
      | string
      | string[],
    keyPrefix?: string,
  ) {
    const fixedT =
      ((
        key: unknown,
        opts: unknown,
        ...rest: unknown[]
      ) => {
        const o: Options =
          typeof opts !==
            'object' ||
          opts ===
            null
            ? this.options.overloadTranslationOptionHandler(
                [
                  key,
                  opts,
                  ...rest,
                ],
              )
            : {
                ...(opts as Options),
              };
        o.lng =
          o.lng ||
          fixedT.lng;
        o.ns =
          o.ns ||
          fixedT.ns;
        const prefix =
          o.keyPrefix !==
          ''
            ? o.keyPrefix ||
              keyPrefix
            : undefined;
        const resultKey =
          prefix
            ? Array.isArray(
                key,
              )
              ? key.map(
                  (
                    k,
                  ) =>
                    `${prefix}.${k}`,
                )
              : `${prefix}.${key}`
            : key;
        return this.t(
          resultKey,
          o,
        );
      }) as ((
        ...args: unknown[]
      ) => unknown) & {
        lng?: string;
        ns?:
          | string
          | string[];
        keyPrefix?: string;
      };
    if (
      isString(
        lng,
      )
    )
      fixedT.lng =
        lng;
    fixedT.ns =
      ns;
    fixedT.keyPrefix =
      keyPrefix;
    return fixedT;
  }

  createInstance(): I18n {
    return createInstance();
  }
}

export function createInstance(): I18n {
  return new Instance() as unknown as I18n;
}

const i18next =
  createInstance();
export default i18next;
