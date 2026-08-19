import { parseGitHubRepoPath, resolvePresetPatterns, UnknownPresetError } from "@norberia/agentlens-core";
import type { Metadata } from "next";
import { queryList } from "@/lib/http";
import { RepoTree } from "./tree-view";

type PageProps = {
  params: Promise<{ owner: string; repo: string; rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function searchParamsToURL(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (typeof value === "string") {
      params.append(key, value);
    }
  }
  return params;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo}` };
}

export default async function RepoPage({ params, searchParams }: PageProps) {
  const { owner, repo, rest } = await params;
  const parsed = parseGitHubRepoPath(owner, repo, rest);
  if (!parsed.ok) {
    return <p>agentlens: error: {parsed.message}</p>;
  }

  const qs = searchParamsToURL(await searchParams);
  let presetPatterns: string[];
  try {
    presetPatterns = resolvePresetPatterns(queryList(qs, ["preset"]));
  } catch (err) {
    const message = err instanceof UnknownPresetError ? err.message : (err as Error).message;
    return <p>agentlens: error: {message}</p>;
  }

  const includeRaw = queryList(qs, ["i", "include", "include-pattern"]);
  const githubPath = parsed.subpath
    ? `${parsed.owner}/${parsed.repo}/tree/${parsed.ref ?? "HEAD"}/${parsed.subpath}`
    : parsed.ref
      ? `${parsed.owner}/${parsed.repo}/tree/${parsed.ref}`
      : `${parsed.owner}/${parsed.repo}`;

  return (
    <RepoTree
      owner={parsed.owner}
      repo={parsed.repo}
      gitRef={parsed.ref}
      subpath={parsed.subpath}
      includeRaw={includeRaw}
      presetPatterns={presetPatterns}
      githubUrl={`https://github.com/${githubPath}`}
    />
  );
}
