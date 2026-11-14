#!/usr/bin/env python3
"""
stamp_version.py — cache versioning for v2/ without a build step. Run it before every push that changes a file
under v2/js/ or v2/css/:

    python3 v2/dev/stamp_version.py           # rewrite the three pages with the current version
    python3 v2/dev/stamp_version.py --check   # exit 1 if a page is not stamped with the current version

The version is one short hash of every script and stylesheet the pages load. It goes on the stylesheet links, on
the page's entry script, and into an import map that sends every module import (`./model.js` and so on) to its
`?v=` address. A browser that already had the page open then fetches a whole new, consistent set of files after
reloading, instead of mixing old modules from its cache with new ones (seen 2026-11-13: the page stuck on
"Loading matches…"). A browser without import-map support ignores the map and loads the files as before.

tests/version.test.mjs recomputes the hash, so a push of changed code without re-stamping fails the tests.
GitHub Pages ignores the query string, so the version only changes which URL the browser caches under.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

V2 = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "players.html", "about.html"]
BEGIN, END = "<!-- version:begin -->", "<!-- version:end -->"


def assets() -> list[str]:
    """Every script and stylesheet the pages load, as paths relative to v2/, sorted."""
    files = sorted(V2.glob("js/**/*.js")) + sorted(V2.glob("css/*.css"))
    return sorted(str(p.relative_to(V2)).replace("\\", "/") for p in files)


def version() -> str:
    """sha256 over each asset's path and bytes, in path order; the first 10 hex digits. tests/version.test.mjs
    computes exactly the same thing."""
    h = hashlib.sha256()
    for rel in assets():
        h.update(rel.encode() + b"\0")
        h.update((V2 / rel).read_bytes() + b"\0")
    return h.hexdigest()[:10]


def importmap(v: str) -> str:
    imports = {f"./{rel}": f"./{rel}?v={v}" for rel in assets() if rel.endswith(".js")}
    return (f'{BEGIN}\n<script type="importmap">\n{json.dumps({"imports": imports}, indent=1)}\n</script>\n{END}')


def stamp(text: str, v: str) -> str:
    block = importmap(v)
    if BEGIN in text:
        text = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _m: block, text, flags=re.S)
    else:
        # The map must come before any module script: put it straight after the inline theme script.
        anchor = re.search(r"<script>try\{var t=localStorage.*?</script>\n", text)
        if not anchor:
            sys.exit("! could not find the theme script to place the import map after")
        text = text[: anchor.end()] + block + "\n" + text[anchor.end():]
    text = re.sub(r'(href="css/[a-z-]+\.css)(\?v=[0-9a-f]+)?"', rf'\1?v={v}"', text)
    text = re.sub(r'(<script type="module" src="js/[a-z-]+\.js)(\?v=[0-9a-f]+)?"', rf'\1?v={v}"', text)
    return text


def main() -> int:
    v = version()
    check = "--check" in sys.argv
    stale = []
    for page in PAGES:
        p = V2 / page
        old = p.read_text(encoding="utf-8")
        new = stamp(old, v)
        if new != old:
            stale.append(page)
            if not check:
                p.write_text(new, encoding="utf-8")
    if check:
        if stale:
            print(f"! not stamped with version {v}: {', '.join(stale)} (run python3 v2/dev/stamp_version.py)")
            return 1
        print(f"stamped: version {v}")
        return 0
    print(f"version {v}: " + (f"stamped {', '.join(stale)}" if stale else "every page already current"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
