/**
 * Tree rendering, byte-compatible with gitingest's
 * `output_formatter._create_tree_structure`.
 *
 *  - first line is the literal `Directory structure:`;
 *  - the root node is `└── <dirname>/`;
 *  - directories carry a trailing `/`, symlinks render as `<name> -> <target basename>`;
 *  - connectors match unix `tree`: `├── `, `└── `, `│   `, `    `;
 *  - exactly one trailing newline after the last line.
 */

import { NodeType, type FsNode } from "./node.js";

function posixBasename(p: string): string {
  const norm = p.split("\\").join("/");
  const i = norm.lastIndexOf("/");
  return i === -1 ? norm : norm.slice(i + 1);
}

function displayName(node: FsNode): string {
  if (node.type === NodeType.Directory) return `${node.name}/`;
  if (node.type === NodeType.Symlink) {
    // gitingest shows `readlink(path).name` — the basename of the raw target.
    return `${node.name} -> ${posixBasename(node.linkTarget ?? "")}`;
  }
  return node.name;
}

function renderNode(node: FsNode, prefix: string, isLast: boolean, out: string[]): void {
  out.push(`${prefix}${isLast ? "└── " : "├── "}${displayName(node)}\n`);
  if (node.type === NodeType.Directory && node.children.length > 0) {
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    node.children.forEach((child, i) => {
      renderNode(child, childPrefix, i === node.children.length - 1, out);
    });
  }
}

export function renderTree(root: FsNode): string {
  const out: string[] = ["Directory structure:\n"];
  renderNode(root, "", true, out);
  return out.join("");
}
