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
import {
  MAX_DIRECTORY_DEPTH,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_TOTAL_SIZE_BYTES,
  NodeType,
  createWalkStats,
  shouldKeepEntry,
  sortChildren,
  warnLimit,
  type FilterMatchers,
  type FsNode,
} from "@norberia/agentlens-core";

export interface TraverseOptions extends FilterMatchers {
  onWarning?: (message: string) => void;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export async function traverse(root: string, options: TraverseOptions): Promise<FsNode> {
  const warn = options.onWarning ?? ((m: string) => console.error(m));
  const stats = createWalkStats();

  const rootNode: FsNode = { name: path.basename(root), type: NodeType.Directory, children: [] };

  function limitExceeded(depth: number): boolean {
    if (depth > MAX_DIRECTORY_DEPTH) {
      warnLimit("depth", warn);
      return true;
    }
    if (stats.totalFiles >= MAX_FILES) {
      warnLimit("files", warn);
      return true;
    }
    if (stats.totalSize >= MAX_TOTAL_SIZE_BYTES) {
      warnLimit("size", warn);
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

      if (!shouldKeepEntry(posixRel, isDirForInclude, options)) continue;

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
          warnLimit("files", warn);
          continue;
        }
        if (stats.totalSize + size > MAX_TOTAL_SIZE_BYTES) {
          warnLimit("size", warn);
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
