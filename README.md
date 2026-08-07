# agentlens

极快的本地目录文件树 CLI。输出与 [gitingest](https://github.com/cyclotruc/gitingest) 输出三段中的 tree 段**逐字节一致**（仅含下文列出的少量有意偏离）。

```
agentlens [source] [-i <pattern>...] [-o <file>] [--preset <name>...]
```

## 安装 / 构建

```bash
npm install
npm run build      # tsup → dist/cli.js（单文件、零运行时依赖）
npm link           # 可选：全局获得 `agentlens` 命令
```

要求 Node.js >= 18。

## 用法

```bash
agentlens                      # 当前目录 → 写 digest.txt，stdout 打一行确认
agentlens ./src                # 指定目录
agentlens . -o -               # tree 写 stdout（提示/警告一律走 stderr，可管道消费）
agentlens . -i "*.py"          # 只保留匹配的文件；无子节点的目录整支剪掉
agentlens . -i "*.py,*.js"     # 逗号分隔
agentlens . -i "*.py *.js"     # 空白分隔
agentlens . -i "*.py" -i "*.md"  # 重复标志
agentlens . --preset deploy      # 只列出部署相关文件（内置模式集）
agentlens . --preset deploy -i "*.md"  # preset ∪ 自定义 -i
```

### `--preset deploy`

内置的"部署透镜"：只列出与构建/部署相关的文件——语言/框架 marker（`package.json`、`go.mod`、`Cargo.toml`…）、容器/编排（`Dockerfile*`、`compose*.yml`…）、部署平台/CI/IaC（`vercel.json`、`.github/workflows/*`、`*.tf`…）、环境/运行时版本（`.env`、`.nvmrc`…）。完整清单与设计说明见 `PLAN-preset-deploy.md`，模式数据在 `src/presets/deploy.ts`。

- 模式与用户 `-i` **取并集**，走同一条 gitingest include 管线；
- `Cargo.lock`、`.env`、`package-lock.json` 等同时在默认忽略集里的条目，靠"精确相减"机制自动 rescue；
- 定位是给 agent 的启发式透镜，宁多勿漏（`*.tf`、`main.go` 等假阳性是有意取舍）；
- 使用 preset 时输出与 gitingest 无可比性（gitingest 无此功能）。

未知 preset 名会以非零码退出并在 stderr 列出全部可选值。

输出示例：

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

## 与 gitingest 的兼容性

- 默认忽略集逐条复刻 gitingest 的 `DEFAULT_IGNORE_PATTERNS`（约 140 条）；`.gitignore` / `.gitingestignore` 从根目录出发收集所有层级，解析规则一致（`!` 取反、去掉前导 `/`、拼接所在目录前缀）。
- 匹配语义为 gitwildmatch，与 gitingest 使用的 Python `pathspec` 逐路径求值语义**完全一致**（`src/matcher.ts` 是 pathspec `GitIgnoreSpecPattern` 的逐行移植——因此与真实 git 有一点相同于 pathspec 的偏离：取反规则可以重新包含被排除目录内的文件）。
- 排序、连线、符号链接显示（`<name> -> <目标basename>`）、目录尾斜杠、结尾单换行均逐字节对齐。
- 限制规则保留：单文件 >10MB 跳过、深度 >20 停止、累计 10,000 文件 / 500MB 停止。
- 匹配器在遍历开始前只编译一次（gitingest 每个文件重新编译一次 PathSpec，是它的主要慢点）。8000 文件基准：agentlens ~0.19s vs gitingest ~4.2s。

**有意偏离：**

1. 不支持远程 URL / clone / branch / tag / token / submodules；不输出 summary 与文件内容段；不读取任何文件内容。
2. 不支持单文件 ingest（source 必须是目录）。
3. 遇到无权限读取的目录/文件：跳过并 stderr 警告（gitingest 直接崩溃）。
4. 非法 pattern（如悬空反斜杠、无效区间）按 null-op 丢弃（gitingest 会抛异常崩溃）。
5. 冲突 pattern 的优先级按声明顺序（gitingest 用 Python set 存储 pattern，冲突时结果依赖哈希随机化，本就非确定）。

## 开发

```bash
npm run typecheck
npm test           # 构建 + matcher 对拍测试（8944 条 pathspec 参考用例）+ tree 渲染测试
```

`test/matcher-cases.json` 由 `test/generate-matcher-cases.py` 生成（需要本地安装 pathspec）。

## 验收

在同一目录上与 gitingest 做 tree 段 diff：

```bash
gitingest <dir> -o /tmp/gi.txt
# 提取 tree 段（"Directory structure:" 到 48 个 '=' 分隔线之间，去掉拼接换行）
agentlens <dir> -o - | diff - <(提取后的 tree 段)
```

已在以下场景验证 `diff` 为空：含嵌套 `.gitignore` / `.gitingestignore` / 符号链接 / 隐藏文件 / 空目录 / `node_modules` 的 fixture、`-i` 各形态、gitingest 仓库本体、agentlens 仓库本体、8000 文件合成树。

## 包名说明

npm 上 `agentlens` 已被占用（2024-10 发布的 1.0.0），本仓库使用 scope 占位名 `@agentlens/agentlens`；正式上架需换成自己的 scope 或改名。

## License

MIT
