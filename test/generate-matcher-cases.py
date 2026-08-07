#!/usr/bin/env python3
"""Generate matcher test cases from the reference implementation (pathspec).

For every (pattern-set, path) pair, records whether pathspec's gitwildmatch
matcher reports a match. The JS test asserts agentlens' matcher agrees.

Output: test/matcher-cases.json  →  {"cases": [{"patterns": [...], "path": "...", "expected": true|false|null}]}
`expected: null` means pathspec raises (invalid pattern) — agentlens treats
those as null-ops instead of crashing and must return False.
"""

import json
import sys

import pathspec

SINGLE_PATTERNS = [
    # --- defaults (representative sample across all categories) ---
    "*.pyc", "__pycache__", ".pytest_cache", "poetry.lock",
    "node_modules", "package-lock.json", ".npm", "bun.lockb",
    "*.class", ".gradle/", "build/", ".settings/", "gradle-app.setting", "*.gradle",
    "*.o", "*.dll", "*.bin",
    ".build/", "*.xcodeproj/", "xcuserdata/", "*.xcuserstate",
    "*.gem", ".bundle/", "vendor/bundle", "Gemfile.lock",
    "Cargo.lock", "**/*.rs.bk", "target/", "pkg/",
    "obj/", "*.suo", "*.nupkg", "bin/",
    ".git", ".svn", ".gitignore", ".gitattributes", ".gitmodules",
    "*.svg", "*.png", "*.mp4",
    "venv", ".venv", "env", ".env", "virtualenv",
    ".idea", ".vscode", "*.swo", ".settings", "*.sublime-*",
    "*.log", "*.bak", ".DS_Store", "Thumbs.db",
    "build", "dist", "target", "out", "*.egg-info", "*.whl", "*.so",
    "site-packages", ".docusaurus", ".next", ".nuxt",
    "*.db", "*.sqlite3",
    "*.min.js", "*.min.css", "*.map", "*.tfstate*", "vendor/", "digest.txt",
    # --- tricky syntax ---
    "logs/",                        # dir-only
    "/anchored.txt",                # root-anchored
    "a/b",                          # anchored (contains slash)
    "x/**/y",                       # inner double-star
    "x/**",                         # trailing double-star
    "**/x",                         # leading double-star
    "**",                           # match everything
    "*",                            # match everything (normalized)
    "*/",                           # every dir
    "docs/**/README.md",
    "foo[0-9].txt",                 # range
    "foo[!0-9].txt",                # negated range
    "foo[^0-9].txt",                # caret-negated range
    "[]!]x",                        # bracket-literal expression
    "[a-z]at",
    "invalid[range",                # invalid range → discarded (null-op)
    "\\!literal",                   # escaped bang
    "\\#hash",                      # escaped hash
    "trailing\\ ",                  # escaped trailing space
    "with space.txt",
    "double//slash",                # empty inner segment
    "a/**/**/b",                    # duplicate double-star collapse
    "dangling\\",                   # dangling escape → pathspec raises
]

MULTI_SETS = [
    ["logs/", "!logs/keep.txt"],            # negation re-includes inside excluded dir
    ["*.py", "!test_*.py"],
    ["*.py", "src/*.py", "!src/main.py"],
    ["!keep.txt", "*.txt"],                 # order matters: later wins
    ["*.txt", "!keep.txt"],
    ["/foo", "!/foo/bar"],
    ["doc/**", "!doc/**/*.md"],
]

PATHS = [
    "build", "build/x", "build/sub", "build/sub/y", "src/build", "src/build/x",
    "logs", "logs/keep.txt", "logs/x.txt", "a/logs/keep.txt",
    "a.py", "src/a.py", "test_a.py", "src/test_a.py", "src/main.py",
    "docs/README.md", "docs/a/b/README.md", "x/README.md", "README.md",
    "x.rs.bk", "a/x.rs.bk", "deep/a/b/x.rs.bk",
    "a/b", "a/c/b", "a/c/d/b", "x/a/y/b",
    "foo1.txt", "fooa.txt", "foo.txt", "cat", "Cat", "bat",
    "node_modules", "node_modules/pkg/index.js", "src/node_modules/x.js",
    "vendor/bundle", "x/vendor/bundle", "vendor/bundle/x.rb", "vendor/other/x",
    ".gitignore", "a/.gitignore", ".git", ".git/config", "x/.git/config",
    "digest.txt", "sub/digest.txt", "keep.txt", "sub/keep.txt",
    "foo", "foo/bar", "foo/bar/baz", "x/foo/bar",
    "anchored.txt", "sub/anchored.txt",
    "!literal", "a/!literal", "#hash", "trailing ", "trailing",
    "with space.txt", "a/with space.txt",
    "double/slash", "double//slash",
    "doc/x.md", "doc/a/x.md", "doc/x.txt",
    "x", "a/x", "a/b/x", "x/y", "x/a/y", "x/a/b/y",
    "main.tfstate", "main.tfstate.backup", "x/main.tfstate",
    "app.min.js", "app.js", "styles.min.css",
    "file.egg-info", "pkg/file.egg", "x.whl", "lib.so", "lib.so.1",
    " Cargo.lock", "Cargo.lock", "a/Cargo.lock",
]

cases = []
for pat in SINGLE_PATTERNS:
    for p in PATHS:
        try:
            spec = pathspec.PathSpec.from_lines("gitwildmatch", [pat])
            cases.append({"patterns": [pat], "path": p, "expected": bool(spec.match_file(p))})
        except Exception:
            cases.append({"patterns": [pat], "path": p, "expected": None})

for pats in MULTI_SETS:
    for p in PATHS:
        try:
            spec = pathspec.PathSpec.from_lines("gitwildmatch", pats)
            cases.append({"patterns": pats, "path": p, "expected": bool(spec.match_file(p))})
        except Exception:
            cases.append({"patterns": pats, "path": p, "expected": None})

with open("test/matcher-cases.json", "w") as fh:
    json.dump({"cases": cases}, fh, indent=1)

print(f"wrote {len(cases)} cases", file=sys.stderr)
