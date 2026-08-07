"use strict";

/** Tree rendering + sorting tests (gitingest output_formatter parity). */

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { NodeType, sortChildren } = require("../.test-build/traverse.js");
const { renderTree } = require("../.test-build/tree.js");

function dir(name, children = []) {
  const node = { name, type: NodeType.Directory, children };
  return node;
}
function file(name) {
  return { name, type: NodeType.File, children: [] };
}
function link(name, target) {
  return { name, type: NodeType.Symlink, linkTarget: target, children: [] };
}

test("sorting groups: readme, files, hidden files, dirs(+links), hidden dirs", () => {
  const root = dir("root", [
    dir("zed"),
    file("b.txt"),
    file(".hidden"),
    dir(".hdir"),
    file("README.md"),
    file("apple.py"),
    link("alink", "b.txt"),
    file("readme.txt"),
    dir("Alpha"),
  ]);
  sortChildren(root);
  assert.deepEqual(
    root.children.map((c) => c.name),
    ["README.md", "readme.txt", "apple.py", "b.txt", ".hidden", "alink", "Alpha", "zed", ".hdir"],
  );
});

test("render matches the gitingest sample byte-for-byte", () => {
  const root = dir("gi_test", [
    file("README.md"),
    dir("docs", [file("readme.md")]),
    link("link.py", "main.py"),
    dir("src", [file("main.py")]),
  ]);
  const expected = [
    "Directory structure:",
    "└── gi_test/",
    "    ├── README.md",
    "    ├── docs/",
    "    │   └── readme.md",
    "    ├── link.py -> main.py",
    "    └── src/",
    "        └── main.py",
    "",
  ].join("\n");
  assert.equal(renderTree(root), expected);
});

test("connectors: last vs non-last children, nested prefixes", () => {
  const root = dir("r", [
    dir("a", [file("x"), file("y")]),
    file("m"),
  ]);
  const expected = [
    "Directory structure:",
    "└── r/",
    "    ├── a/",
    "    │   ├── x",
    "    │   └── y",
    "    └── m",
    "",
  ].join("\n");
  assert.equal(renderTree(root), expected);
});

test("symlink display uses the raw target basename", () => {
  const root = dir("r", [link("l1", "../somewhere/target.txt"), link("l2", "/abs/path/f.py")]);
  sortChildren(root);
  const out = renderTree(root);
  assert.ok(out.includes("l1 -> target.txt"));
  assert.ok(out.includes("l2 -> f.py"));
});
