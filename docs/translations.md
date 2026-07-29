# Translations

The docs site ships in the same 16 languages as the product: `en` plus `zh`, `ar`, `hi`, `es`, `fr`, `pt`, `ru`, `de`, `ja`, `ko`, `it`, `id`, `vi`, `tr`, `ur`. That list mirrors `LOCALES` in `lib/i18n/config.ts` — the app and the docs deliberately support the same set, so a reader who uses the site in Japanese isn't dropped into English documentation.

`ar` and `ur` are right-to-left, matching `RTL_LOCALES` in the same module.

English is authoritative. Everything is written in English first and translated from it.

## How it works

Sphinx uses gettext. Catalogs live in `docs/locale/<lang>/LC_MESSAGES/`, one `.po` file per document (`gettext_compact = False`), and fall back **per string**: an untranslated paragraph renders in English while the rest of the page stays translated. A partially translated page is therefore usable rather than broken, which is what makes incremental translation viable at all.

## Coverage

Translations are maintained for the reader-facing pages:

| Page | Why |
| ---- | --- |
| `index` | The docs landing page. |
| `site-reference/index` | What the platform is. |
| `developer-api/*` guides | Overview, authentication, scopes, rate limits, errors, pagination, idempotency, webhooks, changelog. |

Deliberately **not** translated:

- **`developer-api/endpoints/*`** — the generated endpoint reference. It is mostly HTTP verbs, paths, JSON bodies and one-line summaries; the translatable fraction is small, and it regenerates whenever the registry changes, which would invalidate the translations on every API change.
- **`developer-api/internals.md`** and the rest of `docs/` — ~190 dated design docs, plans, audits and per-game specs. These are internal working documents written for contributors, they churn constantly, and machine-translating them would add tens of thousands of catalog entries that nobody reads.

The subset lives in `TRANSLATED` in `scripts/docs-i18n.sh`. To start translating another page, add its docname there and run `extract` then `update`.

## Workflow

```bash
pip install -r docs/requirements.txt sphinx-intl

scripts/docs-i18n.sh extract          # English sources → .pot
scripts/docs-i18n.sh update           # merge into every locale's .po
scripts/docs-i18n.sh build ja         # build one language locally
scripts/docs-i18n.sh stats            # per-locale translated/untranslated counts
```

`update` **merges**: a string whose English text changed is marked `fuzzy` with its old translation kept, rather than silently discarded. Fuzzy entries are ignored at build time — the page falls back to English for that string until someone re-translates it. So editing English prose degrades a translation gracefully instead of leaving a stale claim in place, which is the failure mode that matters.

## Rules for translators

- Never touch `msgid`. Only fill in `msgstr`.
- Leave the contents of inline code spans in English — identifiers, file paths, HTTP header names, scope ids, error codes and route paths are part of the API, not prose. `` `read:profile` `` is a literal value a developer types.
- Preserve Markdown and MyST syntax exactly, including directive names (```{note}), roles, and link targets. Translate link *text*, never the target.
- Don't translate brand names or URLs.
- For `ar` and `ur`, do not insert Unicode directional control marks. Pages render with `dir="rtl"` and the browser's bidi algorithm handles mixed-script runs; embedded control characters corrupt output and are invisible in review.

## Read the Docs setup

Read the Docs models translations as **separate projects linked to a parent**, not as one multilingual build. For each language:

1. Create a project pointing at the same repository, named e.g. `rmhstudios-ja`.
2. Set its **Language** to that locale in the project's settings.
3. On the English project, add it under **Translations**.

RTD then passes `-D language=<code>` to Sphinx and serves the result at `/<code>/`, with the language switcher in the flyout wired up automatically. `docs/conf.py` sets `language = "en"` and is otherwise identical across every project — nothing per-language is committed except the catalogs.
