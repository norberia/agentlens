"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { parseGitHubRepoPath } = require("../.test-build/github-path.js");

test("owner/repo uses default branch", () => {
  assert.deepEqual(parseGitHubRepoPath("FullAgent", "fulling", undefined), {
    ok: true,
    owner: "FullAgent",
    repo: "fulling",
    ref: undefined,
    subpath: undefined,
  });
});

test("strips .git suffix", () => {
  const result = parseGitHubRepoPath("FullAgent", "fulling.git", []);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.repo, "fulling");
});

test("tree ref and subpath", () => {
  assert.deepEqual(parseGitHubRepoPath("vercel", "next.js", ["tree", "canary", "packages", "next"]), {
    ok: true,
    owner: "vercel",
    repo: "next.js",
    ref: "canary",
    subpath: "packages/next",
  });
});

test("blob paths are rejected", () => {
  const result = parseGitHubRepoPath("vercel", "next.js", ["blob", "canary", "README.md"]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.match(result.message, /file contents are not served/);
});

test("issues and other GitHub pages are rejected", () => {
  const result = parseGitHubRepoPath("vercel", "next.js", ["issues", "1"]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test("invalid owner is rejected", () => {
  const result = parseGitHubRepoPath("-bad", "repo", []);
  assert.equal(result.ok, false);
});
