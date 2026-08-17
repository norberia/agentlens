# agentlens

A fast directory-tree printer for agents and humans. Inspired by [gitingest](https://github.com/cyclotruc/gitingest).

This repository is an npm workspace:

- [`packages/cli`](packages/cli) — published as [`@norberia/agentlens`](https://www.npmjs.com/package/@norberia/agentlens). Local-directory CLI.
- [`packages/core`](packages/core) — shared matcher, ignore/include, presets, tree render, GitHub ingest. Not published.
- [`apps/web`](apps/web) — website: `https://<host>/<owner>/<repo>` returns that GitHub repository's tree.

```
agentlens [source] [-i <pattern>...] [-o <file>] [--preset <name>...]
```

## Install (CLI)

```bash
npm install -g @norberia/agentlens
```

Or run without installing:

```bash
npx @norberia/agentlens
```

Or build from source:

```bash
npm install
npm run build      # packages/cli → dist/cli.js (single file, zero runtime dependencies)
npm link -w @norberia/agentlens
```

Requires Node.js >= 18.

## Usage

```bash
agentlens                      # cwd → write digest.txt; confirm on stdout
agentlens ./src                # specific directory
agentlens . -o -               # tree on stdout (hints/warnings on stderr; pipe-safe)
agentlens . -i "*.py"          # keep matching files; prune empty directory branches
agentlens . -i "*.py,*.js"     # comma-separated
agentlens . -i "*.py *.js"     # whitespace-separated
agentlens . -i "*.py" -i "*.md"  # repeated flags
agentlens . --preset deploy      # built-in deploy lens
agentlens . --preset deploy -i "*.md"  # preset ∪ custom -i
```

### `--preset deploy`

A built-in deploy lens: surfaces files relevant to build and deployment—language/framework markers (`package.json`, `go.mod`, `Cargo.toml`, …), containers and orchestration (`Dockerfile*`, `compose*.yml`, …), platforms/CI/IaC (`vercel.json`, `.github/workflows/*`, `*.tf`, …), and environment/runtime pins (`.env`, `.nvmrc`, …). Pattern data: `packages/core/src/presets/deploy.ts`.

- Patterns are unioned with user `-i` and share the same include pipeline.
- Entries that also sit in the default ignore set (`Cargo.lock`, `.env`, `package-lock.json`, …) are restored via exact-subtraction rescue.
- Heuristic for agents: prefer recall over precision (`*.tf`, `main.go`, and similar false positives are deliberate).

Unknown preset names exit non-zero and list valid values on stderr.

Example output:

```
Directory structure:
└── gi_test/
    ├── README.md
    ├── docs/
    │   └── readme.md
    ├── link.py -> main.py
    └── src/
        └── main.py
```

## Website

Same tree as the CLI, from a GitHub URL. Replace `github.com` with the site host:

| GitHub | agentlens |
| --- | --- |
| `https://github.com/FullAgent/fulling` | `https://<host>/FullAgent/fulling` |
| `https://github.com/FullAgent/fulling/tree/main/src` | `https://<host>/FullAgent/fulling/tree/main/src` |

The page loads in the browser, then **the visitor's browser** queries GitHub (no server token). Query: `?preset=deploy`, `?i=*.ts`. For a pipe-friendly text tree, use the CLI.

```bash
npm run dev --workspace=@norberia/agentlens-web
```

`/blob/...` is not served (trees only).

## Performance

Wall-clock times on real open-source checkouts versus gitingest (representative sample):

| Repo | gitingest | agentlens |
|------|-----------|-----------|
| Twenty CRM | 478.89 s | 1.38 s |
| PostHog | 312.74 s | 1.08 s |
| Zabbix | 235.12 s | 0.47 s |
| Penpot | 170.50 s | 0.31 s |
| Stirling-PDF | 165.45 s | 0.46 s |
| Immich | 13.27 s | 0.22 s |
| Chatwoot | 13.93 s | 0.53 s |
| Grocy | 0.91 s | 0.07 s |

## Development

```bash
npm run typecheck
npm test           # core matcher/tree/GitHub ingest + CLI preset tests
```

`packages/core/test/matcher-cases.json` is produced by `packages/core/test/generate-matcher-cases.py` (requires a local `pathspec` install).

## Package name

The unscoped name `agentlens` is taken on npm (1.0.0, Oct 2024). The CLI ships as `@norberia/agentlens`; the binary remains `agentlens`.

## License

MIT
