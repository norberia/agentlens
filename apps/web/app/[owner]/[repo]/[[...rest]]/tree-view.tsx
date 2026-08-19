"use client";

import { GitHubError, ingestGitHubRepo } from "@norberia/agentlens-core";
import { useEffect, useState } from "react";

type Props = {
  owner: string;
  repo: string;
  gitRef: string | undefined;
  subpath: string | undefined;
  includeRaw: string[];
  presetPatterns: string[];
  githubUrl: string;
};

export function RepoTree(props: Props) {
  const [tree, setTree] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTree(null);
    setError(null);
    ingestGitHubRepo({
      owner: props.owner,
      repo: props.repo,
      ref: props.gitRef,
      subpath: props.subpath,
      includeRaw: props.includeRaw,
      presetPatterns: props.presetPatterns,
      onWarning: () => {},
    })
      .then((result) => {
        if (!cancelled) setTree(result.tree);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof GitHubError) setError(err.message);
        else setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.owner,
    props.repo,
    props.gitRef,
    props.subpath,
    props.includeRaw.join("\0"),
    props.presetPatterns.join("\0"),
  ]);

  const title = `${props.owner}/${props.repo}`;

  return (
    <>
      <header style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "baseline", marginBottom: "1rem" }}>
        <strong>{title}</strong>
        <a href={props.githubUrl}>GitHub</a>
        {tree ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(tree);
            }}
            style={{ font: "inherit", cursor: "pointer" }}
          >
            Copy
          </button>
        ) : null}
      </header>
      <noscript>
        <p>This page loads the tree in the browser. Use the agentlens CLI for a text tree.</p>
      </noscript>
      {error ? <p>agentlens: error: {error}</p> : <pre style={{ margin: 0, overflow: "auto" }}>{tree ?? "Loading…"}</pre>}
    </>
  );
}
