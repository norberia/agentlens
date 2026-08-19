/**
 * Fetch a GitHub repository tree via the Git Trees API (no clone, no file bodies
 * except gitignore / symlink blobs) and turn it into PathEntry[].
 */

import { buildTreeFromEntries, type PathEntry } from "./entries.js";
import { shouldKeepEntry } from "./filter.js";
import { parentDir, parseIgnoreFileContent, processPatterns } from "./ignore.js";
import { compileMatcher } from "./matcher.js";
import { renderTree } from "./tree.js";
import type { FsNode } from "./node.js";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const MAX_SYMLINK_FETCH = 32;

export class GitHubError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "github_error") {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.code = code;
  }
}

export interface GitHubIngestOptions {
  owner: string;
  repo: string;
  ref?: string;
  subpath?: string;
  includeRaw?: string[];
  presetPatterns?: readonly string[];
  token?: string;
  fetch?: typeof globalThis.fetch;
  onWarning?: (message: string) => void;
}

export interface GitHubIngestResult {
  tree: string;
  root: FsNode;
  treeSha: string;
  defaultBranch: string;
  ref: string;
}

interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

interface GitTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitTreeItem[];
}

type Fetcher = typeof globalThis.fetch;

function apiHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agentlens",
    "X-GitHub-Api-Version": API_VERSION,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubFetch(
  fetchImpl: Fetcher,
  url: string,
  token: string | undefined,
  cache: "force-cache" | "no-store",
): Promise<Response> {
  const response = await fetchImpl(url, { headers: apiHeaders(token), cache } as RequestInit);
  if (response.status === 404) {
    throw new GitHubError(404, "repository not found", "not_found");
  }
  if (response.status === 403 || response.status === 429) {
    throw new GitHubError(503, "GitHub rate limit exceeded", "rate_limit");
  }
  if (!response.ok) {
    throw new GitHubError(502, `GitHub API error (${response.status})`, "upstream");
  }
  return response;
}

function posixBasename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function decodeBase64Utf8(content: string): string {
  const bin = atob(content.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function filterToSubpath(items: GitTreeItem[], subpath: string | undefined): { items: GitTreeItem[]; rootName: string | null } {
  if (!subpath) return { items, rootName: null };

  const prefix = subpath.replace(/\/+$/, "");
  const self = items.find((item) => item.path === prefix);
  if (self?.type === "blob") {
    throw new GitHubError(404, "path is not a directory", "not_a_directory");
  }
  if (!self && !items.some((item) => item.path.startsWith(`${prefix}/`))) {
    throw new GitHubError(404, `path not found: ${subpath}`, "not_found");
  }

  const childPrefix = `${prefix}/`;
  const stripped: GitTreeItem[] = [];
  for (const item of items) {
    if (!item.path.startsWith(childPrefix)) continue;
    stripped.push({ ...item, path: item.path.slice(childPrefix.length) });
  }
  return { items: stripped, rootName: posixBasename(prefix) };
}

async function fetchBlobText(fetchImpl: Fetcher, owner: string, repo: string, sha: string, token: string | undefined): Promise<string> {
  const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${sha}`;
  const response = await githubFetch(fetchImpl, url, token, "force-cache");
  const body = (await response.json()) as { content?: string; encoding?: string };
  if (body.encoding !== "base64" || typeof body.content !== "string") {
    throw new GitHubError(502, "unexpected GitHub blob encoding", "upstream");
  }
  return decodeBase64Utf8(body.content);
}

export async function ingestGitHubRepo(options: GitHubIngestOptions): Promise<GitHubIngestResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const token = options.token;
  const owner = options.owner;
  const repo = options.repo;
  const warn = options.onWarning ?? ((m: string) => console.error(m));

  const repoUrl = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const repoRes = await githubFetch(fetchImpl, repoUrl, token, "no-store");
  const repoBody = (await repoRes.json()) as { default_branch: string; name: string };
  const defaultBranch = repoBody.default_branch;
  const ref = options.ref ?? defaultBranch;

  const commitUrl = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`;
  let commitRes: Response;
  try {
    commitRes = await githubFetch(fetchImpl, commitUrl, token, "no-store");
  } catch (err) {
    if (err instanceof GitHubError && err.code === "not_found") {
      throw new GitHubError(404, `ref not found: ${ref}`, "not_found");
    }
    throw err;
  }
  const commitBody = (await commitRes.json()) as { commit: { tree: { sha: string } } };
  const treeSha = commitBody.commit.tree.sha;

  const treeUrl = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${treeSha}?recursive=1`;
  const treeRes = await githubFetch(fetchImpl, treeUrl, token, "force-cache");
  const treeBody = (await treeRes.json()) as GitTreeResponse;
  if (treeBody.truncated) {
    throw new GitHubError(422, "repository tree is too large for the GitHub Trees API (truncated)", "truncated");
  }

  const scoped = filterToSubpath(treeBody.tree, options.subpath);
  const items = scoped.items;
  const rootName = scoped.rootName ?? repoBody.name;

  const { ignorePatterns, includePatterns } = processPatterns(options.includeRaw ?? [], options.presetPatterns ?? []);

  const ignoreFiles = items
    .filter((item) => item.type === "blob" && (posixBasename(item.path) === ".gitignore" || posixBasename(item.path) === ".gitingestignore"))
    .sort((a, b) => {
      const an = posixBasename(a.path);
      const bn = posixBasename(b.path);
      if (an !== bn) return an < bn ? -1 : 1;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });

  // Match CLI: all .gitignore files first, then all .gitingestignore files.
  const gitignores = ignoreFiles.filter((i) => posixBasename(i.path) === ".gitignore");
  const gitingestignores = ignoreFiles.filter((i) => posixBasename(i.path) === ".gitingestignore");
  for (const item of [...gitignores, ...gitingestignores]) {
    const content = await fetchBlobText(fetchImpl, owner, repo, item.sha, token);
    for (const pattern of parseIgnoreFileContent(content, parentDir(item.path))) {
      ignorePatterns.add(pattern);
    }
  }

  const ignoreMatcher = compileMatcher(ignorePatterns);
  const includeMatcher = includePatterns ? compileMatcher(includePatterns) : null;
  const matchers = { ignoreMatcher, includeMatcher };

  const symlinkItems = items.filter((item) => item.type === "blob" && item.mode === "120000");
  const linkTargets = new Map<string, string>();
  let fetched = 0;
  for (const item of symlinkItems) {
    if (!shouldKeepEntry(item.path, false, matchers)) continue;
    if (fetched >= MAX_SYMLINK_FETCH) {
      warn(`agentlens: warning: symlink blob fetch limit (${MAX_SYMLINK_FETCH}) reached`);
      break;
    }
    linkTargets.set(item.path, await fetchBlobText(fetchImpl, owner, repo, item.sha, token));
    fetched += 1;
  }

  const entries: PathEntry[] = [];
  for (const item of items) {
    if (item.type === "commit") continue;
    if (item.type === "tree") continue;
    if (item.mode === "120000") {
      entries.push({
        path: item.path,
        kind: "symlink",
        linkTarget: linkTargets.get(item.path) ?? "",
      });
    } else {
      entries.push({ path: item.path, kind: "file", size: item.size ?? 0 });
    }
  }

  const root = buildTreeFromEntries(rootName, entries, {
    ignoreMatcher,
    includeMatcher,
    onWarning: warn,
  });
  return {
    tree: renderTree(root),
    root,
    treeSha,
    defaultBranch,
    ref,
  };
}
