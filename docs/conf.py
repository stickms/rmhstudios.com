"""Sphinx configuration for the rmhstudios.com documentation site.

Everything under ``docs/`` is authored as Markdown for humans and coding
agents; ``myst-parser`` renders it as-is so there is no second copy of the
docs in reStructuredText to keep in sync. Build locally with::

    pip install -r docs/requirements.txt
    python -m sphinx -b html docs docs/_build/html

Read the Docs runs the same build from ``.readthedocs.yaml``.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent


def _stringify_dates(value: Any) -> Any:
    """Recursively replace date/datetime values with ISO-8601 strings."""
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _stringify_dates(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_stringify_dates(item) for item in value]
    return value


def _patch_myst_front_matter() -> None:
    """Let YAML front matter carry bare dates.

    Many docs here are dated snapshots and open with ``date: 2026-07-18``.
    PyYAML turns that into a ``datetime.date``, and myst-parser renders front
    matter through ``json.dumps``, which raises ``TypeError`` on it — killing
    the whole build over one unquoted date. Stringify those values on the way
    in so authors don't have to remember to quote them.
    """
    try:
        from myst_parser.mdit_to_docutils import base
    except ImportError:  # pragma: no cover - myst missing, Sphinx will complain
        return

    original = base.DocutilsRenderer.dict_to_fm_field_list

    def patched(self, data, language_code, line=0):  # type: ignore[no-untyped-def]
        return original(self, _stringify_dates(data), language_code, line)

    base.DocutilsRenderer.dict_to_fm_field_list = patched


_patch_myst_front_matter()

# -- Project information -----------------------------------------------------

project = "rmhstudios.com"
author = "RMH Studios"
project_copyright = "2026, RMH Studios"

# Single source of truth for the version is the root package.json.
try:
    release = json.loads((_REPO_ROOT / "package.json").read_text())["version"]
except (OSError, ValueError, KeyError):  # pragma: no cover - defensive
    release = "0.0.0"
version = release

# -- General configuration ---------------------------------------------------

extensions = [
    "myst_parser",
    "sphinx_copybutton",
    "sphinx_design",
]

source_suffix = {
    ".md": "markdown",
    ".rst": "restructuredtext",
}

# MyST features the existing docs already rely on: fenced admonitions, bare
# URLs, definition lists and GitHub-style task lists. Deliberately *not*
# enabling "substitution" — the docs are full of literal `{{ … }}` from
# template and shell snippets, which the substitution engine would try to
# expand.
myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "linkify",
    "tasklist",
]

# Generate anchors for h1–h3 so cross-doc "#section" links resolve.
myst_heading_anchors = 3

exclude_patterns = [
    "_build",
    ".DS_Store",
    "Thumbs.db",
    # Generated book projects: content artifacts, not code docs. They are
    # hundreds of chapter files with their own build tooling.
    "indonesia-history/**",
    "textbook/**",
    # Node build tooling for the rendered go-migration PDF.
    "go-migration/build/**",
]

"""Translations.

The site ships in 16 locales (``lib/i18n/config.ts`` is the authoritative list);
the docs use the same set. Catalogs live in ``docs/locale/<lang>/LC_MESSAGES/``
as one ``.po`` per document — ``gettext_compact = False`` — so a page can be
translated without touching any other page, and an untranslated string simply
falls back to English.

Workflow (see docs/translations.md):

    pnpm docs:i18n          # extract messages, then update every .po
    pnpm docs:i18n:build ja # build one language locally

Read the Docs serves each language as its own project, linked as translations
of the English one, so a per-language build sets ``language`` on the command
line rather than here.
"""

# English is authoritative. A per-language build overrides this on the command
# line (`-D language=ja`), which is what Read the Docs does for a translation
# project — so this file stays identical across all 16 of them.
language = "en"

locale_dirs = ["locale/"]
gettext_compact = False
# Stable message ids across extractions keep diffs reviewable — without this,
# editing one paragraph renumbers its neighbours and every .po churns.
gettext_uuid = True
gettext_additional_targets = ["literal-block"]

suppress_warnings = [
    # The docs link to files outside docs/ (CLAUDE.md, app/, deploy/, …).
    # Those targets are real in the repo but not part of the Sphinx source
    # tree, so the resolver can't follow them — don't shout about it.
    "myst.xref_missing",
    # Code fences are tagged for GitHub, not Pygments: `prisma` has no lexer,
    # and TSX-in-```typescript blocks trip the TypeScript lexer (it falls back
    # to relaxed mode and still renders). Noise, not signal.
    "misc.highlighting_failure",
]

# -- HTML output -------------------------------------------------------------

html_theme = "furo"
html_title = f"rmhstudios.com docs ({release})"
html_favicon = "_static/favicon.svg"
html_static_path = ["_static"]
html_css_files = ["custom.css"]

# The site's design language is monochrome-first — near-black on white, near-white
# on black, generously rounded, SF Pro/Inter with JetBrains Mono for code (see
# docs/design-language.md). Mirror it here so the docs read as part of the same
# product rather than as stock Sphinx. Everything else is in _static/custom.css.
html_theme_options = {
    "source_repository": "https://github.com/stickms/rmhstudios.com/",
    "source_branch": "main",
    "source_directory": "docs/",
    "light_css_variables": {
        "color-brand-primary": "#000000",
        "color-brand-content": "#000000",
        "color-brand-visited": "#565656",
        "color-background-primary": "#ffffff",
        "color-background-secondary": "#fafafa",
        "color-foreground-primary": "#000000",
        "color-foreground-secondary": "#565656",
        "color-foreground-muted": "#767676",
        "color-background-border": "rgba(0, 0, 0, 0.16)",
        "color-api-background": "#fafafa",
        "font-stack": "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif",
        "font-stack--monospace": "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
    },
    "dark_css_variables": {
        "color-brand-primary": "#ffffff",
        "color-brand-content": "#ffffff",
        "color-brand-visited": "#a8a8a8",
        "color-background-primary": "#000000",
        "color-background-secondary": "#0a0a0a",
        "color-foreground-primary": "#ffffff",
        "color-foreground-secondary": "#a8a8a8",
        "color-foreground-muted": "#8a8a8a",
        "color-background-border": "rgba(255, 255, 255, 0.18)",
        "color-api-background": "#0a0a0a",
    },
}
