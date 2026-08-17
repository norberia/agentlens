/**
 * Tree node types, sort order, and gitingest-compatible walk limits.
 */

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

export interface WalkStats {
  totalFiles: number;
  totalSize: number;
}

export function createWalkStats(): WalkStats {
  return { totalFiles: 0, totalSize: 0 };
}

/**
 * Depth of a root-relative POSIX path: number of ancestor directories below
 * the scan root. Top-level entries have depth 0.
 */
export function pathDepth(relPath: string): number {
  if (!relPath) return 0;
  let n = 0;
  for (let i = 0; i < relPath.length; i++) {
    if (relPath.charCodeAt(i) === 47) n += 1;
  }
  return n;
}

export function warnLimit(kind: "depth" | "files" | "size", warn: (message: string) => void): void {
  if (kind === "depth") {
    warn(`agentlens: warning: maximum directory depth (${MAX_DIRECTORY_DEPTH}) reached`);
  } else if (kind === "files") {
    warn(`agentlens: warning: maximum file limit (${MAX_FILES}) reached`);
  } else {
    warn(`agentlens: warning: maximum total size (${MAX_TOTAL_SIZE_BYTES} bytes) reached`);
  }
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
