/**
 * Collect `.gitignore` / `.gitingestignore` files from a local directory tree.
 */

import fs from "node:fs";
import path from "node:path";
import { parseIgnoreFileContent } from "@norberia/agentlens-core";

export interface CollectOptions {
  /** Called for unreadable directories/files; defaults to stderr warnings. */
  onWarning?: (message: string) => void;
}

/**
 * Collect every `filename` ignore file under `root` (all nesting levels,
 * unconditionally — gitingest uses `Path.rglob`, which does not consult the
 * ignore set) and return the unified, prefixed pattern list.
 *
 * Directory symlinks are not followed. Unreadable directories are skipped with
 * a warning (gitingest crashes here; agentlens deliberately does not).
 */
export async function loadIgnorePatterns(
  root: string,
  filename: string,
  options: CollectOptions = {},
): Promise<string[]> {
  const warn = options.onWarning ?? ((m: string) => console.error(m));
  const patterns: string[] = [];

  async function walk(dirAbs: string, relDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      warn(`agentlens: warning: cannot read directory ${dirAbs}: ${(err as Error).message}`);
      return;
    }
    for (const entry of entries) {
      const entryAbs = path.join(dirAbs, entry.name);
      const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(entryAbs, entryRel);
      } else if (entry.isFile() && entry.name === filename) {
        let content: string;
        try {
          content = await fs.promises.readFile(entryAbs, "utf8");
        } catch (err) {
          warn(`agentlens: warning: cannot read ${entryAbs}: ${(err as Error).message}`);
          continue;
        }
        patterns.push(...parseIgnoreFileContent(content, relDir));
      }
    }
  }

  await walk(root, "");
  return patterns;
}
