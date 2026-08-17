/**
 * Parse a GitHub-style site path: /{owner}/{repo}[/tree/{ref}/{subpath}].
 */

export interface GitHubRepoPath {
  owner: string;
  repo: string;
  /** Undefined means the repository default branch. */
  ref: string | undefined;
  /** Directory to use as the tree root, relative to the repo. */
  subpath: string | undefined;
}

export interface ParsePathFailure {
  ok: false;
  status: 404;
  message: string;
}

export type ParsePathResult = ({ ok: true } & GitHubRepoPath) | ParsePathFailure;

const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]+$/;

const BLOB_MESSAGE =
  "file contents are not served; use /{owner}/{repo} or /{owner}/{repo}/tree/{ref}/{path}";

export function parseGitHubRepoPath(owner: string, repo: string, rest: string[] | undefined): ParsePathResult {
  const repoName = repo.replace(/\.git$/i, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repoName) || repoName === "." || repoName === "..") {
    return { ok: false, status: 404, message: "not a GitHub repository path" };
  }

  if (!rest || rest.length === 0) {
    return { ok: true, owner, repo: repoName, ref: undefined, subpath: undefined };
  }

  const [kind, ...tail] = rest;
  if (kind === "blob") {
    return { ok: false, status: 404, message: BLOB_MESSAGE };
  }
  if (kind !== "tree") {
    return { ok: false, status: 404, message: "not a repository tree path" };
  }
  if (tail.length === 0 || !tail[0]) {
    return { ok: false, status: 404, message: "missing tree ref" };
  }

  const ref = tail[0];
  const subpath = tail.length > 1 ? tail.slice(1).join("/") : undefined;
  return { ok: true, owner, repo: repoName, ref, subpath };
}
