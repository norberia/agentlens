#!/usr/bin/env node
/**
 * agentlens — blazingly fast, gitingest-compatible directory tree printer.
 *
 *   agentlens [source] [-i <pattern>...] [-o <file>]
 *
 * Only the tree section is produced (no summary, no file contents). When
 * writing to a file, stdout carries a single confirmation line; with `-o -`
 * the tree itself goes to stdout and every diagnostic goes to stderr, so
 * stdout stays pipe-safe.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  compileMatcher,
  presetNames,
  processPatterns,
  renderTree,
  resolvePresetPatterns,
  UnknownPresetError,
} from "@norberia/agentlens-core";
import { loadIgnorePatterns } from "./ignore-fs.js";
import { traverse } from "./traverse.js";

const USAGE = `Usage: agentlens [source] [-i <pattern>...] [-o <file>] [--preset <name>...]

Arguments:
  source                    Local directory to scan (default: ".")

Options:
  -i, --include-pattern <pattern>
                            gitwildmatch include pattern; repeatable. A single
                            value may hold several comma- or whitespace-separated
                            sub-patterns (e.g. "*.py,*.js" or "*.py *.js").
  --preset <name>           Built-in include-pattern set; repeatable. Unioned
                            with -i patterns. Available: ${presetNames().join(", ")}.
  -o, --output <file>       Output file (default: "digest.txt"); "-" means stdout.
  -h, --help                Show this help.
`;

function fail(message: string): never {
  console.error(`agentlens: error: ${message}`);
  process.exit(1);
}

interface CliValues {
  "include-pattern"?: string[];
  preset?: string[];
  output?: string;
  help?: boolean;
}

async function main(): Promise<void> {
  let values: CliValues;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        "include-pattern": { type: "string", short: "i", multiple: true },
        preset: { type: "string", multiple: true },
        output: { type: "string", short: "o" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    }) as { values: CliValues; positionals: string[] });
  } catch (err) {
    fail(`${(err as Error).message}\n\n${USAGE}`);
  }

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (positionals.length > 1) {
    fail(`expected at most one source directory, got ${positionals.length}\n\n${USAGE}`);
  }

  const source = positionals[0] ?? ".";
  const root = path.resolve(source);

  let rootStat: fs.Stats;
  try {
    rootStat = fs.statSync(root);
  } catch {
    fail(`path not found: ${source}`);
  }
  if (!rootStat.isDirectory()) {
    // gitingest can ingest a single file; agentlens deliberately does not.
    fail(`path is not a directory: ${source}`);
  }

  // Filtering order (gitingest-compatible):
  //   1. default ignore set, minus exact include-pattern matches
  //   2. every `.gitignore` / `.gitingestignore` found under the root
  //   3. include set (user -i patterns ∪ preset expansions), compiled once
  let presetPatterns: string[];
  try {
    presetPatterns = resolvePresetPatterns(values.preset ?? []);
  } catch (err) {
    if (err instanceof UnknownPresetError) fail(err.message);
    throw err;
  }

  const includeRaw = values["include-pattern"] ?? [];
  const { ignorePatterns, includePatterns } = processPatterns(includeRaw, presetPatterns);
  for (const fname of [".gitignore", ".gitingestignore"]) {
    for (const pattern of await loadIgnorePatterns(root, fname)) {
      ignorePatterns.add(pattern);
    }
  }

  const ignoreMatcher = compileMatcher(ignorePatterns);
  const includeMatcher = includePatterns ? compileMatcher(includePatterns) : null;

  const rootNode = await traverse(root, { ignoreMatcher, includeMatcher });
  const tree = renderTree(rootNode);

  const output = values.output ?? "digest.txt";
  if (output === "-") {
    process.stdout.write(tree);
    return;
  }
  try {
    fs.writeFileSync(output, tree, "utf8");
  } catch (err) {
    fail(`cannot write output file ${output}: ${(err as Error).message}`);
  }
  process.stdout.write(`Tree written to ${output}\n`);
}

main().catch((err: unknown) => {
  fail((err as Error).message ?? String(err));
});
