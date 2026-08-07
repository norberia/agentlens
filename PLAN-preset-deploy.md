# PLAN: 为 agentlens 增加 `--preset deploy` 参数

> 本文档是一份可直接执行的需求 + 实现计划，面向负责实现的 agent。
> 前置文档：项目基础规格见同目录 `SPEC.md`（CLI、过滤管线、tree 输出格式、限制规则均以 SPEC.md 为准）。本文档只描述增量功能。

## 1. 背景与目标

agentlens 的基础功能是输出本地目录的文件树（与 gitingest 的 tree 段逐字节一致）。现在增加一个内置预设 `--preset deploy`：**只列出与部署相关的文件路径**，供 agent 快速理解"这个项目如何构建/部署"。

模式清单不是拍脑袋猜的，来源有三个：

1. **railpack 源码中提取的语言/框架 marker 文件**（`core/providers/*/ *.go` 的 `Detect()` 逻辑，见 `https://github.com/railwayapp/railpack`）
2. **容器/编排约定文件**（Dockerfile、compose 等）
3. **部署平台 / CI / IaC 约定文件**（vercel.json、GitHub Actions、Terraform 等）

另加第四组"环境/运行时版本"文件，独立成组方便日后摘除。

## 2. CLI 语义

```
agentlens /path/to/dir --preset deploy              # 只列出部署相关文件
agentlens /path/to/dir --preset deploy -i "*.md"    # 预设 ∪ 自定义 -i
```

- `--preset <name>`：可重复。当前唯一合法值为 `deploy`；传入未知值时退出码非零，报错信息中列出全部可选 preset 名（为未来 `--preset node` 等留扩展口）。
- 预设展开为一组 include 模式，与用户 `-i` 模式**取并集**后，统一走 SPEC.md §3 定义的 gitingest include 管线：
  - 排除检查（默认忽略集 + .gitignore/.gitingestignore）在前，include 检查在后；
  - include 集按**字符串精确相等**从忽略集中相减（这就是下方清单中 † 条目能被"rescue"出来的机制）；
  - 目录一律放行以便递归，过滤后无子节点的目录整支剪掉；
  - 单个模式串内逗号/空白分隔、反斜杠归一等既有行为不变。
- 输出仍是 SPEC.md §4 定义的标准 tree 格式。命中文件在中间目录下时（如 `.github/workflows/ci.yml`），中间目录保留路径结构。
- ⚠️ 使用 preset 时输出与 gitingest 没有可比性（gitingest 无此功能）。SPEC.md §5 中"与 gitingest diff 为空"的验收标准仅适用于不带 `--preset` 的场景。

## 3. 模式清单（全量）

说明：
- **† = 该条目同时存在于 gitingest 默认忽略集**，依靠"include 集精确相减忽略集"的机制自动 rescue。**preset 中的字符串必须与忽略表逐字符一致**（如写 `Cargo.lock` 而非 `cargo.lock`），否则 rescue 失败。
- 不含 `/` 的模式匹配任意深度的 basename（`Dockerfile*` 可命中 `services/api/Dockerfile`）；含 `/` 的模式锚定根目录（`.github/workflows/*` 只匹配仓库根）——两者都是有意设计。
- gitwildmatch **不支持 brace 展开**（`{yml,yaml}` 非法），同类扩展名必须分开列。

### A 组：语言/框架 marker（源自 railpack 提取）

```
package.json
package.json5
package-lock.json†
yarn.lock†
.yarnrc.yml
.yarnrc.yaml
pnpm-lock.yaml
pnpm-workspace.yaml
bun.lock†
bun.lockb†
next.config.js
next.config.mjs
next.config.ts
astro.config.mjs
astro.config.ts
nuxt.config.ts
svelte.config.js
vite.config.ts
vite.config.js
requirements.txt
pyproject.toml
Pipfile
Pipfile.lock†
uv.lock
pdm.lock
poetry.lock†
runtime.txt
manage.py
setup.py
go.mod
go.sum
go.work
go.work.sum
main.go
Cargo.toml
Cargo.lock†
rust-toolchain
rust-toolchain.toml
Gemfile
Gemfile.lock†
config.ru
Rakefile
composer.json
composer.lock
artisan
pom.xml
mvnw
gradlew
build.gradle
build.gradle.kts
settings.gradle
*.csproj
*.sln
global.json
mix.exs
mix.lock
gleam.toml
deno.json
deno.jsonc
Procfile
Staticfile
Caddyfile
start.sh
railpack.json
```

### B 组：容器/编排

```
Dockerfile*
Containerfile*
.dockerignore
docker-compose*.yml
docker-compose*.yaml
compose*.yml
compose*.yaml
```

### C 组：部署平台 / CI / IaC

```
vercel.json
netlify.toml
fly.toml
render.yaml
railway.json
railway.toml
nixpacks.toml
app.yaml
app.json
Aptfile
heroku.yml
serverless.yml
template.yaml
captain-definition
amplify.yml
wrangler.toml
firebase.json
now.json
.github/workflows/*
.gitlab-ci.yml
.circleci/config.yml
Jenkinsfile
azure-pipelines.yml
bitbucket-pipelines.yml
.drone.yml
.travis.yml
.buildkite/*
*.tf
Pulumi.yaml
cdk.json
Chart.yaml
kustomization.yaml
skaffold.yaml
Tiltfile
```

### D 组：环境/运行时版本（独立成组，方便日后摘除）

```
.env†
.env.*
.ruby-version†
.nvmrc
.node-version
.python-version
.go-version
.java-version
.tool-versions
mise.toml
```

注：agentlens 只列路径、不读文件内容，因此 `.env` 进清单没有泄密风险。

## 4. 实现要点

1. **新模块 `src/presets/deploy.ts`**：导出 `DEPLOY_PRESET_PATTERNS: readonly string[]`，按 A–D 四组分组注释，每组标注来源。后续新 preset 放同目录。
2. **`src/cli.ts`**：解析 `--preset`（可重复），校验合法值，将展开的模式数组与 `-i` 模式合并后传入既有管线。**其余管线零改动**。
3. **不引入新匹配语义**：不为此功能修改 `ignore.ts` / `traverse.ts` 的匹配逻辑；preset 只是 include 模式的来源之一。
4. **假阳性是有意取舍**：`*.tf`、`template.yaml`、`main.go` 可能命中非部署文件。preset 的定位是"给 agent 的启发式透镜"，不是构建决策依据，宁多勿漏。
5. **性能**：preset 模式并入 include 匹配器后仍在遍历开始前编译一次，不得引入逐文件重复编译（SPEC.md §5 的性能要求不变）。

## 5. 验收标准（测试要求）

构造 fixture 目录，覆盖以下断言：

1. **rescue 生效**：fixture 含 `Cargo.lock`、`.env`、`package-lock.json`、`Gemfile.lock` → `--preset deploy` 输出中全部出现（它们会被默认忽略集排除，验证精确相减机制）。
2. **任意深度命中**：`services/api/Dockerfile` 出现在输出中。
3. **锚定行为**：`.github/workflows/ci.yml` 出现，且中间目录 `.github/`、`workflows/` 保留路径结构。
4. **整支剪枝**：`src/index.ts`、`README.md` 等不匹配文件不出现；只含非匹配文件的目录整支不出现。
5. **并集语义**：`--preset deploy -i "*.md"` 时，`README.md` 与部署文件同时出现。
6. **未知 preset**：`--preset foo` 退出码非零，stderr 报错并列出可选值。
7. **回归**：不带 `--preset` 时，输出与 gitingest tree 段 diff 为空（SPEC.md §5 原验收不变）。

## 6. 交付物

- `src/presets/deploy.ts`（清单数据）
- `src/cli.ts` 改动（`--preset` 解析与合并）
- 上述测试（fixture + 断言）
- 若 `--preset` 落地，同步在 `SPEC.md` §2 补一条 CLI 条目、§5 补模块与验收条款（可留到最后一步做）
