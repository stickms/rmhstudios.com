"""Order-preserving KeyValues reader. Valve's files repeat keys inside a block (several `texture_lookup`
children in a row) and the order matters, so a block is a list of (key, value) pairs, not a dict."""
import re

_TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|([{}])|([^\s{}"]+)')


def parse(text):
    """-> list of (key, value) where value is a string or a nested list of pairs."""
    text = re.sub(r"//[^\n]*", "", text)
    toks = [(m.group(1) if m.group(1) is not None else (m.group(2) or m.group(3))) for m in _TOKEN.finditer(text)]
    kinds = [("s" if m.group(1) is not None else "b") for m in _TOKEN.finditer(text)]
    pos = 0

    def block():
        nonlocal pos
        out = []
        while pos < len(toks):
            t, k = toks[pos], kinds[pos]
            if k == "b" and t == "}":
                pos += 1
                return out
            key = t
            pos += 1
            if pos >= len(toks):
                break
            if kinds[pos] == "b" and toks[pos] == "{":
                pos += 1
                out.append((key, block()))
            else:
                out.append((key, toks[pos]))
                pos += 1
        return out

    return block()


def get(pairs, key, default=None):
    for k, v in pairs:
        if k == key:
            return v
    return default


def get_all(pairs, key):
    return [v for k, v in pairs if k == key]
