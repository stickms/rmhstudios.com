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
html_theme_options = {
    "source_repository": "https://github.com/stickms/rmhstudios.com/",
    "source_branch": "main",
    "source_directory": "docs/",
}
