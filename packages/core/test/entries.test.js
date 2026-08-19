"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { compileMatcher } = require("../.test-build/matcher.js");
const { processPatterns } = require("../.test-build/ignore.js");
const { buildTreeFromEntries } = require("../.test-build/entries.js");
const { renderTree } = require("../.test-build/tree.js");

function matchers(includeRaw = [], extra = []) {
  const { ignorePatterns, includePatterns } = processPatterns(includeRaw, extra);
  return {
    ignoreMatcher: compileMatcher(ignorePatterns),
    includeMatcher: includePatterns ? compileMatcher(includePatterns) : null,
  };
}

test("builds nested tree and prunes empty dirs after include filter", () => {
  const root = buildTreeFromEntries(
    "repo",
    [
      { path: "README.md", kind: "file", size: 10 },
      { path: "src/cli.ts", kind: "file", size: 10 },
      { path: "src/skip.py", kind: "file", size: 10 },
      { path: "docs/guide.md", kind: "file", size: 10 },
    ],
    matchers(["*.ts", "*.md"]),
  );
  const tree = renderTree(root);
  assert.ok(tree.includes("cli.ts"));
  assert.ok(tree.includes("README.md"));
  assert.ok(tree.includes("guide.md"));
  assert.ok(!tree.includes("skip.py"));
});

test("default-ignored files are omitted", () => {
  const root = buildTreeFromEntries(
    "repo",
    [
      { path: "README.md", kind: "file", size: 1 },
      { path: "node_modules/pkg/index.js", kind: "file", size: 1 },
      { path: ".env", kind: "file", size: 1 },
    ],
    matchers(),
  );
  const tree = renderTree(root);
  assert.ok(tree.includes("README.md"));
  assert.ok(!tree.includes("node_modules"));
  assert.ok(!tree.includes(".env"));
});

test("symlink entries render with target basename", () => {
  const root = buildTreeFromEntries(
    "repo",
    [{ path: "link.py", kind: "symlink", linkTarget: "src/main.py" }],
    matchers(),
  );
  assert.ok(renderTree(root).includes("link.py -> main.py"));
});
