import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  adoptPaidTranslations,
  applyTranslationMemory,
  batchKeys,
  dedupeTodo,
  localeSource,
  parseModelJson,
  planCatalogTranslations,
  pluralCategories,
  settleCatalog,
  translationMemory,
  validateTranslationBatch,
  type Catalog,
} from './diff';

describe('merge translation spending', () => {
  it('does not mistake separately parsed legacy nested catalogs for English edits', () => {
    const legacy =
      JSON.stringify(
        {
          bums: {
            title:
              'Bums Rush',
          },
        },
      );
    const plan =
      planCatalogTranslations(
        {
          source:
            JSON.parse(
              legacy,
            ) as Catalog,
          previousSource:
            JSON.parse(
              legacy,
            ) as Catalog,
          target:
            {},
          sources:
            {},
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [],
    );
  });

  it('translates new strings without paying for the historical backlog', () => {
    const plan =
      planCatalogTranslations(
        {
          source:
            {
              old: 'Old',
              added:
                'New',
            },
          previousSource:
            {
              old: 'Old',
            },
          target:
            {},
          sources:
            {},
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [
        'added',
      ],
    );
  });

  it('updates changed English even when the old catalog has no source metadata', () => {
    const plan =
      planCatalogTranslations(
        {
          source:
            {
              greeting:
                'Good evening',
            },
          previousSource:
            {
              greeting:
                'Good morning',
            },
          target:
            {
              greeting:
                'Bonjour',
            },
          sources:
            {},
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [
        'greeting',
      ],
    );
  });

  const pending =
    {
      source:
        {
          added:
            'New',
        },
      previousSource:
        {},
      target:
        {},
      sources:
        {},
      pendingTarget:
        {
          added:
            'Nouveau',
        },
      pendingSources:
        {
          added:
            'New',
        },
    };

  it('reuses an unmerged translation without another model call', () => {
    const plan =
      planCatalogTranslations(
        pending,
      );
    expect(
      plan.todo,
    ).toEqual(
      [],
    );
    expect(
      plan.target,
    ).toEqual(
      {
        added:
          'Nouveau',
      },
    );
    expect(
      plan.sources,
    ).toEqual(
      {
        added:
          'New',
      },
    );
  });

  it('does not reuse a paid translation after its English changes again', () => {
    const plan =
      planCatalogTranslations(
        {
          ...pending,
          source:
            {
              added:
                'Latest',
            },
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [
        'added',
      ],
    );
    expect(
      plan.target,
    ).toEqual(
      {},
    );
  });

  it('preserves a human correction merged while the translation PR is pending', () => {
    const plan =
      planCatalogTranslations(
        {
          ...pending,
          target:
            {
              added:
                'Nouvelle',
            },
          sources:
            {
              added:
                'New',
            },
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [],
    );
    expect(
      plan.target,
    ).toEqual(
      {
        added:
          'Nouvelle',
      },
    );
  });

  it('keeps previous pending namespaces when a later merge changes another namespace', () => {
    const plan =
      planCatalogTranslations(
        {
          ...pending,
          previousSource:
            pending.source,
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [],
    );
    expect(
      plan.target,
    ).toEqual(
      pending.pendingTarget,
    );
  });

  it('does not pay again when the translation landed in the English merge itself', () => {
    const plan =
      planCatalogTranslations(
        {
          ...pending,
          pendingTarget:
            undefined,
          pendingSources:
            undefined,
          target:
            {
              added:
                'Nouveau',
            },
          sources:
            {
              added:
                'New',
            },
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [],
    );
  });

  it('copies strings with nothing to translate instead of paying for them', () => {
    const plan =
      planCatalogTranslations(
        {
          source:
            {
              rank: '10',
              ratio:
                '{{done}}/{{total}}',
              none: '—',
              label:
                '{{count}} items',
            },
          previousSource:
            {},
          target:
            {},
          sources:
            {},
        },
      );
    expect(
      plan.todo,
    ).toEqual(
      [
        'label',
      ],
    );
    expect(
      plan.target,
    ).toEqual(
      {
        rank: '10',
        ratio:
          '{{done}}/{{total}}',
        none: '—',
      },
    );
    expect(
      plan.sources,
    ).toEqual(
      plan.target,
    );
  });

  it('rejects incomplete responses instead of treating English fallback as translated', () => {
    const entries =
      {
        a: 'Hello',
        b: 'Goodbye',
      };
    for (const response of [
      null,
      [],
      {},
      {
        a: 'Bonjour',
      },
      {
        a: 'Bonjour',
        b: ' ',
      },
    ]) {
      expect(
        () =>
          validateTranslationBatch(
            entries,
            response,
          ),
      ).toThrow();
    }
    expect(
      validateTranslationBatch(
        entries,
        {
          a: 'Bonjour',
          b: 'Au revoir',
        },
      ),
    ).toEqual(
      {
        a: 'Bonjour',
        b: 'Au revoir',
      },
    );
  });
});

describe('paying for a string at most once', () => {
  it('adopts a paid translation over a stale one, but never over a current one', () => {
    const source: Catalog =
      {
        stale:
          'Play again',
        fresh:
          'Quit',
        missing:
          'Save',
      };
    const target: Catalog =
      {
        stale:
          'Jouer',
        fresh:
          'Quitter (corrigé)',
      };
    const sources: Catalog =
      {
        stale:
          'Play',
        fresh:
          'Quit',
      };
    const adopted =
      adoptPaidTranslations(
        {
          source,
          target,
          sources,
          paidTarget:
            {
              stale:
                'Rejouer',
              fresh:
                'Quitter',
              missing:
                'Enregistrer',
            },
          paidSources:
            {
              stale:
                'Play again',
              fresh:
                'Quit',
              missing:
                'Save',
            },
        },
      );
    expect(
      adopted,
    ).toBe(
      2,
    );
    expect(
      target,
    ).toEqual(
      {
        stale:
          'Rejouer',
        fresh:
          'Quitter (corrigé)',
        missing:
          'Enregistrer',
      },
    );
    expect(
      sources,
    ).toEqual(
      {
        stale:
          'Play again',
        fresh:
          'Quit',
        missing:
          'Save',
      },
    );
  });

  it('never adopts a translation of English that has since changed', () => {
    const target: Catalog =
      {};
    const sources: Catalog =
      {};
    adoptPaidTranslations(
      {
        source:
          {
            a: 'New wording',
          },
        target,
        sources,
        paidTarget:
          {
            a: 'Ancien texte',
          },
        paidSources:
          {
            a: 'Old wording',
          },
      },
    );
    expect(
      target,
    ).toEqual(
      {},
    );
  });

  it('replaces an English placeholder with a paid translation, keeps a legacy translation', () => {
    const source: Catalog =
      {
        copy: 'Main menu',
        legacy:
          'Quit',
      };
    const target: Catalog =
      {
        copy: 'Main menu',
        legacy:
          'Quitter',
      };
    const sources: Catalog =
      {};
    adoptPaidTranslations(
      {
        source,
        target,
        sources,
        paidTarget:
          {
            copy: 'Menu principal',
            legacy:
              'Sortir',
          },
        paidSources:
          {
            copy: 'Main menu',
            legacy:
              'Quit',
          },
      },
    );
    expect(
      target,
    ).toEqual(
      {
        copy: 'Menu principal',
        legacy:
          'Quitter',
      },
    );
  });

  it('copies a string already translated elsewhere in the locale instead of sending it', () => {
    const done =
      {
        source:
          {
            cancel:
              'Cancel',
          },
        target:
          {
            cancel:
              'Annuler',
          },
        sources:
          {
            cancel:
              'Cancel',
          },
        todo: [] as string[],
      };
    const stale =
      {
        source:
          {
            cancel:
              'Cancel',
          },
        target:
          {
            cancel:
              'Abandonner',
          },
        sources:
          {
            cancel:
              'Abort',
          },
        todo: [] as string[],
      };
    const next =
      {
        source:
          {
            cancel:
              'Cancel',
            back: 'Back',
            menu: 'Main menu',
          },
        target:
          {
            menu: 'Main menu',
          } as Catalog,
        sources:
          {} as Catalog,
        todo: [
          'cancel',
          'back',
        ],
      };
    const memory =
      translationMemory(
        [
          done,
          stale,
          next,
        ],
      );
    expect(
      [
        ...memory.values(),
      ],
    ).toEqual(
      [
        'Annuler',
      ],
    );
    expect(
      applyTranslationMemory(
        [
          done,
          next,
        ],
        memory,
      ),
    ).toBe(
      1,
    );
    expect(
      next.todo,
    ).toEqual(
      [
        'back',
      ],
    );
    expect(
      next.target,
    ).toEqual(
      {
        cancel:
          'Annuler',
        menu: 'Main menu',
      },
    );
    expect(
      next.sources,
    ).toEqual(
      {
        cancel:
          'Cancel',
      },
    );
  });

  it('fills an English placeholder from the memory', () => {
    const done =
      {
        source:
          {
            m: 'Main menu',
          },
        target:
          {
            m: 'Menu principal',
          },
        sources:
          {
            m: 'Main menu',
          },
        todo: [] as string[],
      };
    const copy =
      {
        source:
          {
            m: 'Main menu',
          },
        target:
          {
            m: 'Main menu',
          } as Catalog,
        sources:
          {} as Catalog,
        todo: [] as string[],
      };
    applyTranslationMemory(
      [
        done,
        copy,
      ],
      translationMemory(
        [
          done,
          copy,
        ],
      ),
    );
    expect(
      copy.target,
    ).toEqual(
      {
        m: 'Menu principal',
      },
    );
  });

  it('sends each distinct English string once per locale', () => {
    const a =
      {
        source:
          {
            save: 'Save',
            quit: 'Quit',
          },
        target:
          {},
        sources:
          {},
        todo: [
          'save',
          'quit',
        ],
      };
    const b =
      {
        source:
          {
            store:
              'Save',
            title:
              'Title',
          },
        target:
          {},
        sources:
          {},
        todo: [
          'store',
          'title',
        ],
      };
    const followers =
      dedupeTodo(
        [
          a,
          b,
        ],
      );
    expect(
      a.todo,
    ).toEqual(
      [
        'save',
        'quit',
      ],
    );
    expect(
      b.todo,
    ).toEqual(
      [
        'title',
      ],
    );
    expect(
      followers,
    ).toEqual(
      [
        {
          plan: b,
          key: 'store',
          ownerPlan:
            a,
          ownerKey:
            'save',
        },
      ],
    );
  });
});

describe('plural forms per language', () => {
  const english: Catalog =
    {
      items_one:
        '{{count}} item',
      items_other:
        '{{count}} items',
      title:
        'Title',
    };

  it('asks for exactly the CLDR categories the language uses', () => {
    expect(
      Object.keys(
        localeSource(
          english,
          pluralCategories(
            'ja',
          ),
        ),
      ).sort(),
    ).toEqual(
      [
        'items_other',
        'title',
      ],
    );
    expect(
      localeSource(
        english,
        pluralCategories(
          'ru',
        ),
      ),
    ).toEqual(
      {
        title:
          'Title',
        items_few:
          '{{count}} items',
        items_many:
          '{{count}} items',
        items_one:
          '{{count}} item',
        items_other:
          '{{count}} items',
      },
    );
  });

  it('never shares a translation between plural forms with the same English', () => {
    const ru =
      {
        source:
          localeSource(
            english,
            pluralCategories(
              'ru',
            ),
          ),
        target:
          {},
        sources:
          {},
        todo: [
          'items_few',
          'items_many',
          'items_other',
        ],
      };
    const again =
      {
        source:
          {
            more_many:
              '{{count}} items',
          },
        target:
          {},
        sources:
          {},
        todo: [
          'more_many',
        ],
      };
    const followers =
      dedupeTodo(
        [
          ru,
          again,
        ],
      );
    expect(
      ru.todo,
    ).toEqual(
      [
        'items_few',
        'items_many',
        'items_other',
      ],
    );
    expect(
      followers.map(
        (
          f,
        ) => [
          f.key,
          f.ownerKey,
        ],
      ),
    ).toEqual(
      [
        [
          'more_many',
          'items_many',
        ],
      ],
    );
  });

  const settle =
    (
      over: Partial<
        Parameters<
          typeof settleCatalog
        >[0]
      >,
    ) => {
      const categories =
        pluralCategories(
          'ru',
        );
      const args =
        {
          english,
          source:
            localeSource(
              english,
              categories,
            ),
          categories,
          target:
            {} as Catalog,
          sources:
            {} as Catalog,
          existed: true,
          paid: false,
          ...over,
        };
      return {
        write:
          settleCatalog(
            args,
          ),
        target:
          args.target,
      };
    };

  it('drops a plural group that free work filled only partly', () => {
    const {
      write,
      target,
    } =
      settle(
        {
          target:
            {
              title:
                'Заголовок',
              items_one:
                '{{count}} предмет',
              items_other:
                '{{count}} предметов',
            },
        },
      );
    expect(
      write,
    ).toBe(
      true,
    );
    expect(
      target,
    ).toEqual(
      {
        title:
          'Заголовок',
      },
    );
  });

  it('drops a half-filled group even from paid output or an older catalog', () => {
    expect(
      settle(
        {
          paid: true,
          target:
            {
              items_one:
                'a',
              items_other:
                'b',
            },
        },
      )
        .target,
    ).toEqual(
      {},
    );
    const whole =
      {
        items_one:
          'a',
        items_few:
          'b',
        items_many:
          'c',
        items_other:
          'd',
      };
    expect(
      settle(
        {
          paid: true,
          target:
            {
              ...whole,
            },
        },
      )
        .target,
    ).toEqual(
      whole,
    );
  });

  it('a paid run may start a new file even when part of it failed', () => {
    expect(
      settle(
        {
          paid: true,
          existed: false,
          target:
            {
              title:
                'Заголовок',
            },
        },
      )
        .write,
    ).toBe(
      true,
    );
  });

  it('removes forms the language does not use', () => {
    const categories =
      pluralCategories(
        'ja',
      );
    const target: Catalog =
      {
        items_one:
          '{{count}}個',
        items_other:
          '{{count}}個',
      };
    settleCatalog(
      {
        english,
        source:
          localeSource(
            english,
            categories,
          ),
        categories,
        target,
        sources:
          {},
        existed: true,
        paid: false,
      },
    );
    expect(
      target,
    ).toEqual(
      {
        items_other:
          '{{count}}個',
      },
    );
  });

  it('prunes keys English no longer has', () => {
    const {
      target,
    } =
      settle(
        {
          target:
            {
              title:
                'Заголовок',
              gone: 'Удалено',
            },
        },
      );
    expect(
      target,
    ).toEqual(
      {
        title:
          'Заголовок',
      },
    );
  });

  it('does not start a namespace file that free work cannot complete', () => {
    expect(
      settle(
        {
          existed: false,
          target:
            {
              title:
                'Заголовок',
            },
        },
      )
        .write,
    ).toBe(
      false,
    );
  });
});

describe('talking to the model', () => {
  it('never splits a plural group across batches', () => {
    const todo =
      [
        'a',
        'n_zero',
        'n_one',
        'n_two',
        'n_few',
        'n_many',
        'n_other',
        'b',
        'c',
      ];
    const batches =
      batchKeys(
        todo,
        4,
      );
    expect(
      batches,
    ).toEqual(
      [
        [
          'a',
        ],
        [
          'n_zero',
          'n_one',
          'n_two',
          'n_few',
          'n_many',
          'n_other',
        ],
        [
          'b',
          'c',
        ],
      ],
    );
    expect(
      batches
        .flat()
        .sort(),
    ).toEqual(
      [
        ...todo,
      ].sort(),
    );
  });

  it('reads the first JSON object even with a fence or trailing text', () => {
    expect(
      parseModelJson(
        '{"a":"x"}',
      ),
    ).toEqual(
      {
        a: 'x',
      },
    );
    expect(
      parseModelJson(
        '{"a":"}{ \\"q\\" }"} {"b":"y"}',
      ),
    ).toEqual(
      {
        a: '}{ "q" }',
      },
    );
    expect(
      parseModelJson(
        'Here you go:\n{"a":"x"}\nDone.',
      ),
    ).toEqual(
      {
        a: 'x',
      },
    );
    expect(
      () =>
        parseModelJson(
          'no json',
        ),
    ).toThrow();
    expect(
      () =>
        parseModelJson(
          '{"a":"x"',
        ),
    ).toThrow();
  });
});
