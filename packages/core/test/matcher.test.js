"use strict";

/**
 * Matcher parity test: agentlens' gitwildmatch port vs the reference
 * implementation (Python pathspec, used by gitingest). Cases are generated
 * by test/generate-matcher-cases.py.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const { compileMatcher } = require("../.test-build/matcher.js");

const casesPath = path.join(__dirname, "matcher-cases.json");
const { cases } = JSON.parse(fs.readFileSync(casesPath, "utf8"));

// Group cases by pattern set so each matcher compiles once (like production).
const byPatterns = new Map();
for (const c of cases) {
  const key = JSON.stringify(c.patterns);
  if (!byPatterns.has(key)) byPatterns.set(key, []);
  byPatterns.get(key).push(c);
}

for (const [key, group] of byPatterns) {
  const patterns = JSON.parse(key);
  test(`patterns ${key}`, () => {
    const matcher = compileMatcher(patterns);
    for (const c of group) {
      // expected === null: pathspec raises on this pattern (gitingest would
      // crash); agentlens deliberately treats it as a null-op → no match.
      const expected = c.expected === null ? false : c.expected;
      assert.equal(
        matcher.matches(c.path),
        expected,
        `patterns=${key} path=${JSON.stringify(c.path)} expected=${String(c.expected)}`,
      );
    }
  });
}
