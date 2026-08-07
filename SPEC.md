# agentlens 需求规格

> 本文档是对 gitingest（`/Users/che/Documents/GitHub/gitingest`）调研后重写的实现需求，可直接交给实现 agent 使用。

## 1. 项目目标

用 TypeScript 实现一个 CLI 小工具 `agentlens`：给定一个本地目录路径，**极快地**输出该目录的文件树。输出与 gitingest 输出三段中的 tree 段**逐字节一致**（有少量下文明确列出的有意偏离）。本项目自用，但代码按可发布 npm package 的标准组织。

**明确不做**（gitingest 有、agentlens 砍掉的功能）：

- 不支持远程仓库 URL / git clone / branch / tag / token / submodules
- 不输出 summary 段和文件内容段，只输出 tree
- 不读取任何文件内容（因此无需编码检测、二进制检测、token 估算）
- 不支持 `-e/--exclude-pattern`、`-s/--max-size` 等其它 CLI 选项

## 2. CLI 规范

```
agentlens [source] [-i <pattern>...] [-o <file>]
```

- **`source`**：位置参数，本地目录路径，默认 `.`，相对/绝对路径均可。
  - 路径不存在 → stderr 报错，非零码退出。
  - 路径是文件而非目录 → 报错退出（gitingest 支持单文件 ingest，agentlens **有意不支持**）。
- **`-i, --include-pattern <pattern>`**：可重复多次，gitwildmatch 风格模式（同 `.gitignore` 语法）。
  - 只有匹配至少一个 include 模式的**文件**进入 tree；目录一律放行以便递归，但过滤后无任何子节点的目录会被**整支剪掉**（所以 `agentlens . -i "*.py"` 时，不含 `.py` 的目录完全不出现）。
  - 单个模式串内允许用逗号或空白分隔多个子模式：`-i "*.py,*.js"`、`-i "*.py *.js"` 均合法；反斜杠统一归一为正斜杠。
  - 每个 include 模式会从默认忽略集中按字符串精确相减（与 gitingest 的 `process_patterns` 一致）。
- **`-o, --output <file>`**：默认写到当前目录的 `digest.txt`；`-o -` 表示写 stdout。
- **输出通道约定**：写文件时，stdout 只打一行确认（如 `Tree written to digest.txt`）；`-o -` 时 tree 本体写 stdout，所有提示/警告信息一律走 stderr，保证 stdout 可被管道消费。

## 3. 遍历与过滤规则（与 gitingest 一致）

过滤按以下顺序叠加生效：

1. **默认忽略集**：逐条复刻 gitingest 的 `DEFAULT_IGNORE_PATTERNS`（约 140 条，见附录 A；源文件：`/Users/che/Documents/GitHub/gitingest/src/gitingest/utils/ignore_patterns.py`）。注意 `.gitignore`、`.gitattributes`、`.gitmodules` 本身也在忽略集里，不会出现在 tree 中。
2. **`.gitignore` + `.gitingestignore`**：从根目录出发收集**所有层级**的这两个文件（含嵌套子目录）。逐行解析：跳过空行与 `#` 注释；`!` 开头为取反规则（保留 `!` 前缀）；去掉前导 `/`；每条模式拼上"该 ignore 文件所在目录相对根目录的路径前缀"后并入忽略集。
3. **include 覆盖**：将 `-i` 模式集从忽略集中按字符串精确相减。
4. **匹配语义**：gitwildmatch（含 `!` 取反、`/` 锚定、`**`），匹配对象是**相对根目录的 posix 风格路径**；不含 `/` 的模式可匹配任意深度（如 `*.py` 命中 `src/main.py`）。
5. **遍历**：DFS。每个条目先查忽略集（命中即跳过整支），再查 include 集（文件不匹配则跳过，目录总是放行）。符号链接作为独立节点记录，**不跟随**。遇到无权限读取的目录/文件：跳过并 stderr 警告（gitingest 此时直接崩溃——这是**有意的小偏离**）。
6. **限制规则（全部保留）**：单文件 >10MB 跳过不进 tree；目录深度 >20 停止下钻；累计文件数达 10,000 停止；累计总大小达 500MB 停止（后两者仅为防御，tree 场景几乎不会触发）。

## 4. Tree 输出格式（逐字节规范）

- 第 1 行固定为字面量 `Directory structure:`
- 第 2 行起为树本体，根节点 = 目标目录的 basename：`└── <dirname>/`
- 目录名带尾斜杠 `/`；符号链接显示为 `<name> -> <目标basename>`
- 连线/缩进与 unix `tree` 相同：`├── `、`└── `、`│   `、`    `
- **每个目录内的排序规则**：① `README*` 文件 → ② 普通文件 → ③ 点开头的隐藏文件 → ④ 普通目录 → ⑤ 点开头的隐藏目录；各组内部按小写字母序（case-insensitive）
- 过滤后无子节点的目录不出现
- 树最后一行后有且仅有一个换行

参考样例（实测 gitingest 输出）：

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

## 5. 技术实现要求

- **运行时**：TypeScript + Node.js（>= 18），tsup 打包为单文件，包名占位 `@<scope>/agentlens`（⚠️ npm 上 `agentlens` 已被占用，2024-10 发布的 1.0.0，正式上架需用 scope 或改名）。
- **package.json**：`bin: { "agentlens": "dist/cli.js" }`、shebang `#!/usr/bin/env node`、`files: ["dist"]`、`engines` 字段。
- **性能是核心指标**：
  - 全程只做 `readdir` + `stat`，不打开任何文件内容；
  - 忽略集与 include 集的匹配器在遍历开始前**编译一次**（gitingest 的 Python 实现每个文件都重新编译一次 PathSpec，这是它的主要慢点之一，agentlens 必须避免）；
  - 建议：遍历手写 `fs.promises.readdir({ withFileTypes: true })` 递归或用 `fdir`；gitwildmatch 匹配用 `ignore` 包（完整实现 .gitignore 语义含取反）或 `picomatch`；CLI 参数解析优先用 `node:util` 的 `parseArgs`（零依赖）。
- **建议模块划分**：`src/cli.ts`（参数解析与输出通道）、`src/ignore.ts`（默认忽略表 + gitignore 收集解析）、`src/traverse.ts`（DFS + 过滤 + 限制）、`src/tree.ts`（排序与渲染）。
- **验收标准**：在同一目录上，agentlens 的输出与 gitingest 输出中的 tree 段 `diff` 为空。测试方法：构造含嵌套 `.gitignore`、符号链接、隐藏文件、空目录、`node_modules` 的 fixture 目录，两个实现各跑一遍做 diff。

## 附录 A：DEFAULT_IGNORE_PATTERNS 全量清单

需从 `gitingest/src/gitingest/utils/ignore_patterns.py` 逐条搬入 TS 常量，共约 140 条，按类别为：

```
Python:        *.pyc *.pyo *.pyd __pycache__ .pytest_cache .coverage .tox .nox .mypy_cache .ruff_cache .hypothesis poetry.lock Pipfile.lock
JavaScript:    node_modules bower_components package-lock.json yarn.lock .npm .yarn .pnpm-store bun.lock bun.lockb
Java:          *.class *.jar *.war *.ear *.nar .gradle/ build/ .settings/ .classpath gradle-app.setting *.gradle .project
C/C++:         *.o *.obj *.dll *.dylib *.exe *.lib *.out *.a *.pdb *.bin
Swift/Xcode:   .build/ *.xcodeproj/ *.xcworkspace/ *.pbxuser *.mode1v3 *.mode2v3 *.perspectivev3 *.xcuserstate xcuserdata/ .swiftpm/
Ruby:          *.gem .bundle/ vendor/bundle Gemfile.lock .ruby-version .ruby-gemset .rvmrc
Rust:          Cargo.lock **/*.rs.bk
Go:            pkg/
.NET:          obj/ *.suo *.user *.userosscache *.sln.docstates *.nupkg
通用构建产物:  target/ bin/ build dist out *.egg-info *.egg *.whl *.so
版本控制:      .git .svn .hg .gitignore .gitattributes .gitmodules
图片/媒体:     *.svg *.png *.jpg *.jpeg *.gif *.ico *.pdf *.mov *.mp4 *.mp3 *.wav
虚拟环境:      venv .venv env .env virtualenv
IDE/编辑器:    .idea .vscode .vs *.swo *.swn .settings *.sublime-*
临时/缓存:     *.log *.bak *.swp *.tmp *.temp .cache .sass-cache .eslintcache .DS_Store Thumbs.db desktop.ini
文档站点:      site-packages .docusaurus .next .nuxt
数据库:        *.db *.sqlite *.sqlite3
其它:          *.min.js *.min.css *.map *.tfstate* vendor/ digest.txt
```

（实现时以源文件为准逐条核对，上面仅为类别索引。）

---

## 与原描述的三点重要出入（已按本规格处理）

1. "二进制文件被忽略" → 实际是按扩展名模式忽略，复刻同一份忽略表即天然一致；
2. 符号链接、10MB 大文件也会/不会影响 tree，已写入规则；
3. 默认输出对齐 gitingest：写 `digest.txt`，`-o -` 走 stdout。
