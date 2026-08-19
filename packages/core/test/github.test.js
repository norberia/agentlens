"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { ingestGitHubRepo } = require("../.test-build/github.js");
const { renderTree } = require("../.test-build/tree.js");

function b64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(routes) {
  return async (url) => {
    const key = String(url);
    for (const [pattern, handler] of routes) {
      if (typeof pattern === "string" ? key === pattern : pattern.test(key)) {
        return handler(key);
      }
    }
    return jsonResponse({ message: "not mocked: " + key }, 500);
  };
}

const TREE_SHA = "aaa111";

test("ingestGitHubRepo builds a filtered tree from Trees API payloads", async () => {
  const fetchImpl = mockFetch([
    [
      "https://api.github.com/repos/FullAgent/fulling",
      () => jsonResponse({ default_branch: "main", name: "fulling" }),
    ],
    [
      "https://api.github.com/repos/FullAgent/fulling/commits/main",
      () => jsonResponse({ commit: { tree: { sha: TREE_SHA } } }),
    ],
    [
      `https://api.github.com/repos/FullAgent/fulling/git/trees/${TREE_SHA}?recursive=1`,
      () =>
        jsonResponse({
          sha: TREE_SHA,
          truncated: false,
          tree: [
            { path: "README.md", mode: "100644", type: "blob", sha: "1", size: 12 },
            { path: "src", mode: "040000", type: "tree", sha: "2" },
            { path: "src/cli.ts", mode: "100644", type: "blob", sha: "3", size: 40 },
            { path: "node_modules/x/index.js", mode: "100644", type: "blob", sha: "4", size: 8 },
            { path: ".gitignore", mode: "100644", type: "blob", sha: "5", size: 6 },
            { path: "link.py", mode: "120000", type: "blob", sha: "6", size: 11 },
            { path: "vendor/lib", mode: "160000", type: "commit", sha: "7" },
            { path: "secret.txt", mode: "100644", type: "blob", sha: "8", size: 3 },
          ],
        }),
    ],
    [
      "https://api.github.com/repos/FullAgent/fulling/git/blobs/5",
      () => jsonResponse({ encoding: "base64", content: b64("secret.txt\n") }),
    ],
    [
      "https://api.github.com/repos/FullAgent/fulling/git/blobs/6",
      () => jsonResponse({ encoding: "base64", content: b64("src/cli.ts") }),
    ],
  ]);

  const result = await ingestGitHubRepo({
    owner: "FullAgent",
    repo: "fulling",
    fetch: fetchImpl,
    onWarning: () => {},
  });

  assert.equal(result.treeSha, TREE_SHA);
  assert.equal(result.ref, "main");
  const tree = result.tree;
  assert.ok(tree.includes("README.md"));
  assert.ok(tree.includes("cli.ts"));
  assert.ok(tree.includes("link.py -> cli.ts"));
  assert.ok(!tree.includes("node_modules"));
  assert.ok(!tree.includes("secret.txt"), "gitignore-hidden file must be absent");
  assert.ok(!tree.includes("vendor"));
});

test("truncated trees fail closed", async () => {
  const fetchImpl = mockFetch([
    ["https://api.github.com/repos/o/r", () => jsonResponse({ default_branch: "main", name: "r" })],
    ["https://api.github.com/repos/o/r/commits/main", () => jsonResponse({ commit: { tree: { sha: "t" } } })],
    [
      "https://api.github.com/repos/o/r/git/trees/t?recursive=1",
      () => jsonResponse({ sha: "t", truncated: true, tree: [] }),
    ],
  ]);

  await assert.rejects(() => ingestGitHubRepo({ owner: "o", repo: "r", fetch: fetchImpl, onWarning: () => {} }), {
    code: "truncated",
  });
});

test("subpath scopes the tree root", async () => {
  const fetchImpl = mockFetch([
    ["https://api.github.com/repos/o/r", () => jsonResponse({ default_branch: "main", name: "r" })],
    ["https://api.github.com/repos/o/r/commits/main", () => jsonResponse({ commit: { tree: { sha: "t" } } })],
    [
      "https://api.github.com/repos/o/r/git/trees/t?recursive=1",
      () =>
        jsonResponse({
          sha: "t",
          truncated: false,
          tree: [
            { path: "README.md", mode: "100644", type: "blob", sha: "1", size: 1 },
            { path: "src", mode: "040000", type: "tree", sha: "2" },
            { path: "src/cli.ts", mode: "100644", type: "blob", sha: "3", size: 1 },
          ],
        }),
    ],
  ]);

  const result = await ingestGitHubRepo({
    owner: "o",
    repo: "r",
    subpath: "src",
    fetch: fetchImpl,
    onWarning: () => {},
  });
  const tree = renderTree(result.root);
  assert.ok(tree.includes("└── src/"));
  assert.ok(tree.includes("cli.ts"));
  assert.ok(!tree.includes("README.md"));
});
