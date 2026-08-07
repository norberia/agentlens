/**
 * Depth-first traversal with gitingest-compatible filtering and limits.
 *
 * Port of gitingest's `ingestion._process_node` (tree-relevant parts only):
 *  - check the ignore set first (a hit prunes the whole branch), then the
 *    include set (files must match; directories always pass so children are
 *    visited, but directories left childless after filtering are pruned);
 *  - symlinks are recorded as standalone nodes and never followed;
 *  - limits: files > 10 MB skipped, depth > 20 stops descent, 10k files and
 *    500 MB totals stop the walk (defensive; tree scenarios barely hit them).
 *
 * Differences from gitingest (deliberate, per spec): unreadable directories /
 * entries are skipped with a warning instead of crashing.
 */

import fs from "node:fs";
import path from "node:path";
import type { Matcher } from "./matcher.js";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_DIRECTORY_DEPTH = 20;
export const MAX_FILES = 10_000;
export const MAX_TOTAL_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export enum NodeType {
  Directory = "directory",
  File = "file",
  Symlink = "symlink",
}

export interface FsNode {
  name: string;
  type: NodeType;
  /** Link target as reported by readlink (symlinks only). */
  linkTarget?: string;
  children: FsNode[];
}

interface Stats {
  totalFiles: number;
  totalSize: number;
}

export interface TraverseOptions {
  ignoreMatcher: Matcher;
  includeMatcher: Matcher | null;
  onWarning?: (message: string) => void;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export async function traverse(root: string, options: TraverseOptions): Promise<FsNode> {
  const warn = options.onWarning ?? ((m: string) => console.error(m));
  const stats: Stats = { totalFiles: 0, totalSize: 0 };

  const rootNode: FsNode = { name: path.basename(root), type: NodeType.Directory, children: [] };

  function limitExceeded(depth: number): boolean {
    if (depth > MAX_DIRECTORY_DEPTH) {
      warn(`agentlens: warning: maximum directory depth (${MAX_DIRECTORY_DEPTH}) reached`);
      return true;
    }
    if (stats.totalFiles >= MAX_FILES) {
      warn(`agentlens: warning: maximum file limit (${MAX_FILES}) reached`);
      return true;
    }
    if (stats.totalSize >= MAX_TOTAL_SIZE_BYTES) {
      warn(`agentlens: warning: maximum total size (${MAX_TOTAL_SIZE_BYTES} bytes) reached`);
      return true;
    }
    return false;
  }

  async function processNode(node: FsNode, dirAbs: string, relDir: string, depth: number): Promise<void> {
    if (limitExceeded(depth)) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      warn(`agentlens: warning: cannot read directory ${dirAbs}: ${(err as Error).message}`);
      return;
    }

    for (const entry of entries) {
      const entryAbs = path.join(dirAbs, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const posixRel = path.sep === "/" ? relPath : toPosix(relPath);

      // A symlink is classified by lstat semantics: `Dirent.isSymbolicLink()`.
      const isSymlink = entry.isSymbolicLink();

      // gitingest's `_should_include` uses `Path.is_dir()`, which follows
      // symlinks — a symlink to a directory passes the include filter like a
      // real directory. Mirror that with stat() on the link target.
      let isDirForInclude = entry.isDirectory();
      if (isSymlink) {
        try {
          isDirForInclude = (await fs.promises.stat(entryAbs)).isDirectory();
        } catch {
          isDirForInclude = false; // broken link: treated as a file-like entry
        }
      }

      // 1. Ignore set: a hit prunes the whole branch.
      if (options.ignoreMatcher.matches(posixRel)) continue;

      // 2. Include set: directories always pass; files must match.
      if (options.includeMatcher && !isDirForInclude && !options.includeMatcher.matches(posixRel)) {
        continue;
      }

      if (isSymlink) {
        let linkTarget: string;
        try {
          linkTarget = await fs.promises.readlink(entryAbs);
        } catch (err) {
          warn(`agentlens: warning: cannot read symlink ${entryAbs}: ${(err as Error).message}`);
          continue;
        }
        stats.totalFiles += 1;
        node.children.push({ name: entry.name, type: NodeType.Symlink, linkTarget, children: [] });
      } else if (entry.isFile()) {
        let size: number;
        try {
          size = (await fs.promises.stat(entryAbs)).size;
        } catch (err) {
          warn(`agentlens: warning: cannot stat ${entryAbs}: ${(err as Error).message}`);
          continue;
        }
        if (size > MAX_FILE_SIZE) continue;
        if (stats.totalFiles + 1 > MAX_FILES) {
          warn(`agentlens: warning: maximum file limit (${MAX_FILES}) reached`);
          continue;
        }
        if (stats.totalSize + size > MAX_TOTAL_SIZE_BYTES) {
          warn(`agentlens: warning: maximum total size (${MAX_TOTAL_SIZE_BYTES} bytes) reached`);
          continue;
        }
        stats.totalFiles += 1;
        stats.totalSize += size;
        node.children.push({ name: entry.name, type: NodeType.File, children: [] });
      } else if (entry.isDirectory()) {
        const child: FsNode = { name: entry.name, type: NodeType.Directory, children: [] };
        await processNode(child, entryAbs, relPath, depth + 1);
        // Prune branches left empty by filtering.
        if (child.children.length === 0) continue;
        node.children.push(child);
      } else {
        warn(`agentlens: warning: unknown file type, skipping ${entryAbs}`);
      }
    }

    sortChildren(node);
  }

  await processNode(rootNode, root, "", 0);
  return rootNode;
}

/**
 * gitingest's `sort_children`: README files, then regular files, hidden files,
 * regular directories, hidden directories; each group ordered by lowercased
 * name. Symlinks are grouped with directories (gitingest groups anything that
 * is not of type FILE into the directory groups).
 */
export function sortChildren(node: FsNode): void {
  const key = (child: FsNode): [number, string] => {
    const name = child.name.toLowerCase();
    if (child.type === NodeType.File) {
      if (name === "readme" || name.startsWith("readme.")) return [0, name];
      return [name.startsWith(".") ? 2 : 1, name];
    }
    return [name.startsWith(".") ? 4 : 3, name];
  };
  node.children.sort((a, b) => {
    const [ga, na] = key(a);
    const [gb, nb] = key(b);
    if (ga !== gb) return ga - gb;
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
}
