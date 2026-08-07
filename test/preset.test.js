"use strict";

/**
 * `--preset deploy` tests.
 * Runs the built CLI against a temp fixture and asserts on the tree output.
 */

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, before, after } = require("node:test");

const CLI = path.join(__dirname, "..", "dist", "cli.js");

let fixture;

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

function treeOf(args) {
  const res = run([fixture, ...args, "-o", "-"]);
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
  return res.stdout;
}

before(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), "agentlens-preset-"));
  const files = [
    // rescue targets († in the default ignore set)
    "Cargo.lock",
    ".env",
    "package-lock.json",
    "Gemfile.lock",
    // any-depth hit
    "services/api/Dockerfile",
    // anchored hit with intermediate dirs
    ".github/workflows/ci.yml",
    // regular deploy files
    "package.json",
    "vercel.json",
    "docker-compose.yml",
    // non-matching files that must be filtered out
    "src/index.ts",
    "README.md",
    "docs/guide.md",
    // a directory holding only non-matching files (must be pruned whole)
    "lib/util.js",
  ];
  for (const rel of files) {
    const abs = path.join(fixture, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "x\n");
  }
});

after(() => {
  fs.rmSync(fixture, { recursive: true, force: true });
});

test("rescue: default-ignored files appear under --preset deploy", () => {
  const tree = treeOf(["--preset", "deploy"]);
  for (const name of ["Cargo.lock", ".env", "package-lock.json", "Gemfile.lock"]) {
    assert.ok(tree.includes(`├── ${name}`) || tree.includes(`└── ${name}`), `${name} missing:\n${tree}`);
  }
});

test("any-depth: services/api/Dockerfile appears", () => {
  const tree = treeOf(["--preset", "deploy"]);
  assert.ok(tree.includes("api/"), "intermediate dir api/ missing");
  assert.ok(tree.includes("└── Dockerfile"), `Dockerfile missing:\n${tree}`);
});

test("anchored: .github/workflows/ci.yml keeps its path structure", () => {
  const tree = treeOf(["--preset", "deploy"]);
  assert.ok(tree.includes(".github/"), ".github/ missing");
  assert.ok(tree.includes("workflows/"), "workflows/ missing");
  assert.ok(tree.includes("└── ci.yml"), `ci.yml missing:\n${tree}`);
});

test("pruning: non-matching files and their whole branches disappear", () => {
  const tree = treeOf(["--preset", "deploy"]);
  for (const absent of ["index.ts", "README.md", "guide.md", "docs/", "lib/", "util.js"]) {
    assert.ok(!tree.includes(absent), `${absent} should be absent:\n${tree}`);
  }
});

test("union: --preset deploy -i '*.md' shows both deploy files and markdown", () => {
  const tree = treeOf(["--preset", "deploy", "-i", "*.md"]);
  assert.ok(tree.includes("README.md"), "README.md missing from union");
  assert.ok(tree.includes("docs/guide.md") || (tree.includes("docs/") && tree.includes("guide.md")), "guide.md missing from union");
  assert.ok(tree.includes("vercel.json"), "preset file missing from union");
});

test("unknown preset exits non-zero and lists available names", () => {
  const res = run([fixture, "--preset", "foo", "-o", "-"]);
  assert.notEqual(res.status, 0);
  assert.ok(res.stderr.includes("unknown preset"), res.stderr);
  assert.ok(res.stderr.includes("deploy"), `stderr should list 'deploy': ${res.stderr}`);
});

test("regression: without --preset the full tree is unaffected", () => {
  const tree = treeOf([]);
  // No include filter: everything not default-ignored shows up.
  for (const present of ["README.md", "index.ts", "docs/", "lib/", "package.json", ".github/"]) {
    assert.ok(tree.includes(present), `${present} missing:\n${tree}`);
  }
  // Default-ignored files stay hidden.
  for (const absent of ["Cargo.lock", "package-lock.json", "Gemfile.lock", ".env"]) {
    assert.ok(!tree.includes(absent), `${absent} should be absent:\n${tree}`);
  }
});

test("repeated --preset is accepted", () => {
  const res = run([fixture, "--preset", "deploy", "--preset", "deploy", "-o", "-"]);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes("vercel.json"));
});
