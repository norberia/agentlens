/**
 * Built-in `deploy` preset: include patterns that surface deployment-relevant
 * files, so an agent can quickly see how a project is built and deployed.
 *
 * Groups:
 *  - A: language/framework marker files (extracted from railpack providers'
 *    Detect() logic, https://github.com/railwayapp/railpack)
 *  - B: container / orchestration conventions
 *  - C: deploy platform / CI / IaC conventions
 *  - D: environment / runtime version files (kept separate for easy removal)
 *
 * † marks entries that also exist in gitingest's DEFAULT_IGNORE_PATTERNS; they
 * are "rescued" by the exact-string subtraction of the include set from the
 * ignore set, so these strings must match the ignore table character for
 * character (e.g. `Cargo.lock`, not `cargo.lock`).
 *
 * Patterns without `/` match basenames at any depth (`Dockerfile*` hits
 * `services/api/Dockerfile`); patterns with `/` are anchored to the root
 * (`.github/workflows/*` only matches at the repository root). Both are
 * intentional. gitwildmatch has no brace expansion, so `.yml`/`.yaml` are
 * listed separately.
 *
 * False positives (`*.tf`, `template.yaml`, `main.go`) are a deliberate
 * trade-off: this preset is a heuristic lens for agents, not a build
 * decision input — better to over-include than to miss.
 */
export const DEPLOY_PRESET_PATTERNS: readonly string[] = [
  // ── A: language / framework markers (from railpack) ─────────────────────
  "package.json",
  "package.json5",
  "package-lock.json", // †
  "yarn.lock", // †
  ".yarnrc.yml",
  ".yarnrc.yaml",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "bun.lock", // †
  "bun.lockb", // †
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "astro.config.mjs",
  "astro.config.ts",
  "nuxt.config.ts",
  "svelte.config.js",
  "vite.config.ts",
  "vite.config.js",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "Pipfile.lock", // †
  "uv.lock",
  "pdm.lock",
  "poetry.lock", // †
  "runtime.txt",
  "manage.py",
  "setup.py",
  "go.mod",
  "go.sum",
  "go.work",
  "go.work.sum",
  "main.go",
  "Cargo.toml",
  "Cargo.lock", // †
  "rust-toolchain",
  "rust-toolchain.toml",
  "Gemfile",
  "Gemfile.lock", // †
  "config.ru",
  "Rakefile",
  "composer.json",
  "composer.lock",
  "artisan",
  "pom.xml",
  "mvnw",
  "gradlew",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "*.csproj",
  "*.sln",
  "global.json",
  "mix.exs",
  "mix.lock",
  "gleam.toml",
  "deno.json",
  "deno.jsonc",
  "Procfile",
  "Staticfile",
  "Caddyfile",
  "start.sh",
  "railpack.json",

  // ── B: container / orchestration ────────────────────────────────────────
  "Dockerfile*",
  "Containerfile*",
  ".dockerignore",
  "docker-compose*.yml",
  "docker-compose*.yaml",
  "compose*.yml",
  "compose*.yaml",

  // ── C: deploy platform / CI / IaC ───────────────────────────────────────
  "vercel.json",
  "netlify.toml",
  "fly.toml",
  "render.yaml",
  "railway.json",
  "railway.toml",
  "nixpacks.toml",
  "app.yaml",
  "app.json",
  "Aptfile",
  "heroku.yml",
  "serverless.yml",
  "template.yaml",
  "captain-definition",
  "amplify.yml",
  "wrangler.toml",
  "firebase.json",
  "now.json",
  ".github/workflows/*",
  ".gitlab-ci.yml",
  ".circleci/config.yml",
  "Jenkinsfile",
  "azure-pipelines.yml",
  "bitbucket-pipelines.yml",
  ".drone.yml",
  ".travis.yml",
  ".buildkite/*",
  "*.tf",
  "Pulumi.yaml",
  "cdk.json",
  "Chart.yaml",
  "kustomization.yaml",
  "skaffold.yaml",
  "Tiltfile",

  // ── D: environment / runtime versions ───────────────────────────────────
  ".env", // †
  ".env.*",
  ".ruby-version", // †
  ".nvmrc",
  ".node-version",
  ".python-version",
  ".go-version",
  ".java-version",
  ".tool-versions",
  "mise.toml",
];
