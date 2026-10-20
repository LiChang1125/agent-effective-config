# Agent Effective Config (`aec`) 最终交付报告

完成日期：2026-10-20（Asia/Shanghai）

## 1. 目录树

```text
.
├── adapters/
│   ├── claude-code.js
│   ├── codex.js
│   ├── contract.js
│   ├── cursor.js
│   ├── index.js
│   └── shared.js
├── bin/
│   └── aec.js
├── fixtures/
│   ├── scenario-a/        # 正常声明与可选 canary
│   └── scenario-b/        # shadow、未注册 hook、未连接 MCP
├── outputs/
│   └── final-report.md
├── src/
│   ├── cli.js
│   ├── constants.js
│   ├── engine.js
│   ├── files.js
│   └── index.js
├── test/
│   └── aec.test.js
├── work/                  # 本地验证临时副本，不属于发布包
├── .gitignore
├── install.sh
├── LICENSE
├── package.json
└── README.md
```

根目录共 12 个项目文件/文件夹（不计 Git 元数据），满足上限。

## 2. 核心文件职责

- `bin/aec.js`：跨平台 CLI 入口，把参数交给核心命令层。
- `src/cli.js`：解析参数、自动识别 agent、输出 JSON 或按状态分组的终端表格。
- `src/engine.js`：执行 discover → visibility → canary 流程并生成固定字段的报告。
- `src/files.js`：只读文件发现、路径显示、可执行文件检查与受限命令调用。
- `src/constants.js`：唯一维护四档状态、agent 名称和版本号。
- `adapters/contract.js`：统一 adapter 契约与保守证据分类器。
- `adapters/shared.js`：复用 settings、MCP、hook、优先级解析逻辑。
- `adapters/claude-code.js`：Claude memory/settings/skills/hooks/MCP 发现与只读 probe。
- `adapters/codex.js`：AGENTS 层级、skills、exec policy、config.toml/MCP 与只读 canary。
- `adapters/cursor.js`：Cursor rules、兼容指令、skills、hooks 与 MCP 发现。
- `fixtures/`：clone 后可直接运行的正常场景与故障场景。
- `test/aec.test.js`：9 个端到端/契约测试，覆盖三个 adapter 与证据分级。
- `install.sh`：把轻量 wrapper 安装到明确目录，不改 shell 配置或 agent 配置。

## 3. Adapter 覆盖等级

### Claude Code

- 已测试配置档案：2026-10-20 官方文档；本机未安装 Claude Code CLI，因此未声称 live canary 已测试。
- instruction / skill：发现路径后默认 `UNVERIFIED`；配置中存在 `AEC_CANARY` 且 `--probe`、CLI 可用时可到 `CONFIRMED_EFFECTIVE`。`AGENTS.md` 对 Claude 是确定的不支持来源，可报 `CONFIRMED_NOT_LOADED`。
- hook：未知生命周期事件、无效 JSON 可报 `CONFIRMED_NOT_LOADED`；实际触发仍为 `UNVERIFIED`。
- MCP：缺失 executable 或 live list 明确缺席可报 `CONFIRMED_NOT_LOADED`；live list 命中可报 `CONFIRMED_EFFECTIVE`。
- permission：必须针对具体操作验证，当前固定为 `UNVERIFIED`。

### Codex

- 已测试版本：`codex-cli 0.163.0-alpha.10.2`。
- instruction / skill：`AGENTS.override.md` 同目录覆盖可确定；带 canary 时使用 `--sandbox read-only --ephemeral`，命中可到 `CONFIRMED_EFFECTIVE`。
- MCP：支持 `codex mcp list` 只读可见性检查及 executable 缺失确认。
- exec policy / permission：能发现 `.rules` 与 config 声明，但不执行权限动作，保持 `UNVERIFIED`。
- hook：仅发现声明；没有独立 receipt 时保持 `UNVERIFIED`。

### Cursor Agent

- 已测试配置档案：2026-10-20 官方文档；本机未安装 Cursor Agent CLI。
- instruction / skill：支持 `.cursor/rules`、`.cursorrules`、`AGENTS.md`、`CLAUDE.md` 与 `.cursor/skills` 发现；缺少可靠只读 adherence endpoint，因此保持 `UNVERIFIED`。
- MCP：CLI 可用时用 `cursor-agent mcp list`；缺失 executable 可确定为 `CONFIRMED_NOT_LOADED`。
- hook：无效 JSON 可确定为未加载；实际触发保持 `UNVERIFIED`。
- permission：Cursor 的交互式批准没有稳定项目文件 receipt，不作启发式猜测。

## 4. 七项验证报告

### 1) 干净目录按 README 从零运行：通过

执行：

```sh
AEC_INSTALL_DIR="$PWD/.local/bin" ./install.sh
export PATH="$PWD/.local/bin:$PATH"
aec --cwd fixtures/scenario-b
aec --cwd fixtures/scenario-b --json
```

证据摘要：在 `work/verify-clean` 的独立副本中安装成功；终端报告显示 4 项 `CONFIRMED_NOT_LOADED`、4 项 `UNVERIFIED`；JSON 含固定的 `cwd / agent / agentVersion / aecVersion / sources / findings / summary` 字段。验证过程发现并修复了 Windows Git Bash 的符号链接兼容问题，最终 installer 使用显式 wrapper。

### 2) 全部测试：通过

命令：`npm test`

证据摘要：9 tests，9 pass，0 fail；覆盖 Claude、Codex、Cursor，优先级、无效配置、缺失 MCP 与 JSON contract。

### 3) README 命令与文件一致：通过

证据摘要：`install.sh=True`、`fixtures/scenario-b=True`；README 四行 quick start 已在干净副本逐行执行成功；Node.js 最低版本与 `package.json` 的 `>=18` 一致。

### 4) 结构限制：通过

命令摘要：PowerShell 统计根目录和 `src/ + bin/` 行数。

证据：`ROOT_COUNT=12`；`CORE_LINES=348`，低于 1200；adapter、测试与 README 未计入核心行数。

### 5) 路径、密钥与隐私安全：通过

证据摘要：

- user-specific absolute path / key-shaped literal 扫描无命中。
- 运行时代码的 HTTP/HTTPS/network import 数量为 0，不上传任何内容。
- 文件读取仅面向已知 agent 配置路径、skill manifest 和 canary 行；没有源码目录递归读取或对话读取。
- 缺失 executable 只检查 `PATH`，不会执行用户在配置中声明的 MCP 命令。
- `--probe` 前后 fixtures 的 SHA-256 集合一致：`ZERO_WRITE_FIXTURES_UNCHANGED=True`。

### 6) 自证 `CLAUDE.local.md` / `AGENTS.md` 场景：通过

命令：`aec --cwd fixtures/scenario-b --agent claude-code --json`

证据：`AGENTS.md.status=CONFIRMED_NOT_LOADED`，`shadowedBy=CLAUDE.local.md`；另外 `.claude/settings.json` 的 permission 被 `.claude/settings.local.json` 覆盖。

### 7) 防止把“不遵守”误报成“没加载”：通过

命令：`node --test --test-name-pattern="loaded but unfollowed" test/aec.test.js`

证据：mock runtime 返回 `visible=true, followed=false`，唯一结果为 `LOADED_BUT_UNFOLLOWED`，1 pass，0 fail。

## 5. 自主关键决策

- 选择无运行时依赖的 Node.js ESM：用户机器只需 Node 18+，测试使用内置 `node:test`；没有新增第三方依赖需要解释或审计。
- 默认不运行付费/联网模型请求：普通 `aec` 只做静态和本机只读证据；`--probe` 才尝试 live metadata/canary。
- canary 采用配置内显式 `AEC_CANARY` marker：不修改仓库，不向用户文件注入暗号；miss 没有独立可见性时仍为 `UNVERIFIED`。
- source 级输出严格使用固定 contract：内部 metadata 不泄露到 JSON，只输出 path/kind/priority/declared 与 evidence/reason。
- installer 使用 wrapper 而非 symlink：避免 Windows Git Bash 与受限 macOS/Linux 环境的 symlink 行为差异。

## 6. 已知限制与下一版建议

1. **降低概率性**：增加 `--samples N`、最小命中阈值和 Wilson 区间；只有可见性独立确认后才统计 adherence，避免把随机 miss 解释成加载失败。
2. **跟进厂商变化**：为每个 adapter 建立版本快照矩阵与官方 schema fixture，CI 按 agent 版本跑 discovery/MCP receipt；未知版本在报告中自动降级为 `UNVERIFIED`。
3. **接入新 agent**：发布可版本化 adapter manifest 与 contract conformance suite，让新 adapter 必须通过 precedence、zero-write、negative evidence、unfollowed 四类测试后才能注册。

另外，当前会列出所有可生效的用户级 skills；技能很多的机器上报告可能较长。下一版可加入 `--scope project|all`，但默认仍应保留 `all` 以免遗漏真正生效的全局配置。

## 7. GitHub 首发建议

Repo description（200 字以内）：

> Probe-first CLI that shows which Claude Code, Codex, and Cursor instructions, skills, hooks, permissions, and MCP settings are effective, ignored, or still unverified.

Topics：`ai-agents`, `cli`, `claude-code`, `codex`, `cursor`, `mcp`, `developer-tools`, `config-debugging`。

首发顺序：

1. 先创建 `v0.1.0` GitHub Release，写清 supported/partial coverage 和已知限制；GitHub Release 会基于 tag 固化可下载源码，并可附 release notes。[GitHub 官方说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
2. 完成真实 `demo.gif` 后再发 Show HN；项目现在满足“可在本机直接运行、无需注册”的基本条件。当前 HN 对 Show HN 有额外限制，发布者应先熟悉社区，并亲自撰写说明、在线回复，不要让 AI 代写帖子。[Show HN 指南](https://news.ycombinator.com/showhn.html) [当前限制说明](https://news.ycombinator.com/showlim)
3. 同日分享到 Claude Code、Codex、Cursor 相关社区，重点展示一张 scenario-b 的终端截图，而不是泛化宣传。

时机：选择工作日、维护者接下来能连续 4–6 小时回复 issue/讨论的时段；先发布 GitHub Release，再在 30–60 分钟内发社区帖子，确保任何点击都能直接 clone 和复现。
