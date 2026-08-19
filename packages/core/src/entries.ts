/**
 * Build an FsNode tree from a flat path list (GitHub Trees API, tests).
 * Filtering matches the CLI walk; empty directories are pruned afterwards.
 */

import { shouldKeepEntry, type FilterMatchers } from "./filter.js";
import {
  MAX_DIRECTORY_DEPTH,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_TOTAL_SIZE_BYTES,
  NodeType,
  createWalkStats,
  pathDepth,
  sortChildren,
  warnLimit,
  type FsNode,
} from "./node.js";

export type PathEntryKind = "file" | "directory" | "symlink";

export interface PathEntry {
  /** POSIX path relative to the scan root (no leading slash). */
  path: string;
  kind: PathEntryKind;
  size?: number;
  linkTarget?: string;
}

export interface BuildTreeOptions extends FilterMatchers {
  onWarning?: (message: string) => void;
}

function posixBasename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/**
 * Insert `child` under `relPath`'s parent, creating intermediate directories.
 * Returns false if an ancestor is missing (should not happen).
 */
function ensureDir(root: FsNode, dirPath: string, dirs: Map<string, FsNode>): FsNode {
  if (dirPath === "") return root;
  const existing = dirs.get(dirPath);
  if (existing) return existing;

  const parentPath = dirPath.includes("/") ? dirPath.slice(0, dirPath.lastIndexOf("/")) : "";
  const parent = ensureDir(root, parentPath, dirs);
  const node: FsNode = { name: posixBasename(dirPath), type: NodeType.Directory, children: [] };
  parent.children.push(node);
  dirs.set(dirPath, node);
  return node;
}

function pruneEmptyDirs(node: FsNode): void {
  node.children = node.children.filter((child) => {
    if (child.type !== NodeType.Directory) return true;
    pruneEmptyDirs(child);
    return child.children.length > 0;
  });
}

function sortAll(node: FsNode): void {
  sortChildren(node);
  for (const child of node.children) {
    if (child.type === NodeType.Directory) sortAll(child);
  }
}

export function buildTreeFromEntries(rootName: string, entries: readonly PathEntry[], options: BuildTreeOptions): FsNode {
  const warn = options.onWarning ?? ((m: string) => console.error(m));
  const stats = createWalkStats();
  const root: FsNode = { name: rootName, type: NodeType.Directory, children: [] };
  const dirs = new Map<string, FsNode>([["", root]]);
  let warnedDepth = false;
  let warnedFiles = false;
  let warnedSize = false;

  for (const entry of entries) {
    if (entry.kind === "directory") continue;

    const depth = pathDepth(entry.path);
    if (depth > MAX_DIRECTORY_DEPTH) {
      if (!warnedDepth) {
        warnLimit("depth", warn);
        warnedDepth = true;
      }
      continue;
    }

    const isDirForInclude = false;
    if (!shouldKeepEntry(entry.path, isDirForInclude, options)) continue;

    if (entry.kind === "file") {
      const size = entry.size ?? 0;
      if (size > MAX_FILE_SIZE) continue;
      if (stats.totalFiles + 1 > MAX_FILES) {
        if (!warnedFiles) {
          warnLimit("files", warn);
          warnedFiles = true;
        }
        continue;
      }
      if (stats.totalSize + size > MAX_TOTAL_SIZE_BYTES) {
        if (!warnedSize) {
          warnLimit("size", warn);
          warnedSize = true;
        }
        continue;
      }
      stats.totalFiles += 1;
      stats.totalSize += size;
    } else {
      stats.totalFiles += 1;
    }

    const parentPath = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
    const parent = ensureDir(root, parentPath, dirs);
    if (entry.kind === "symlink") {
      parent.children.push({
        name: posixBasename(entry.path),
        type: NodeType.Symlink,
        linkTarget: entry.linkTarget ?? "",
        children: [],
      });
    } else {
      parent.children.push({
        name: posixBasename(entry.path),
        type: NodeType.File,
        children: [],
      });
    }
  }

  pruneEmptyDirs(root);
  sortAll(root);
  return root;
}
