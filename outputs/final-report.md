# Agent Effective Config (`aec`) v0.2.0 交付与测试报告

完成日期：2026-10-21（Asia/Shanghai）

## 交付结果

项目现已同时提供 CLI 与可分发插件：

- Codex / Cursor：根目录 `plugin.json`，遵循 Agent Plugins 1.0 标准。
- Claude Code：`.claude-plugin/plugin.json` 兼容清单。
- 三端共享：`skills/aec-diagnose/SKILL.md` 与同一套只读诊断实现。
- Codex 市场入口：`.agents/plugins/marketplace.json`。

插件技能默认执行只读 JSON 诊断；只有用户明确要求实时验证时才添加 `--probe`，并且不会自行改写项目配置。

## 发布目录

```text
.
├── .agents/plugins/marketplace.json
├── .claude-plugin/plugin.json
├── bin/
├── outputs/
├── skills/aec-diagnose/
├── src/
│   └── adapters/
├── test/
│   └── fixtures/
├── .gitignore
├── LICENSE
├── package.json
├── plugin.json
└── README.md
```

发布根目录共 12 项，满足不超过 12 项的约束。核心逻辑继续低于 1200 行。

## 自动化测试

命令：`npm test`

结果：

- 13 tests
- 13 pass
- 0 fail
- 0 skipped

覆盖内容：

- Claude Code、Codex、Cursor 三个 adapter 的配置发现。
- 优先级与 shadow 行为。
- 缺失 MCP executable 的确定性负证据。
- `LOADED_BUT_UNFOLLOWED` 不会误报成 `CONFIRMED_NOT_LOADED`。
- JSON 稳定输出契约。
- portable / Claude Code / Codex marketplace 三份清单的一致性。
- `aec-diagnose` 技能脚本端到端执行。
- 根目录数量与核心代码规模约束。

官方 skill-creator 校验结果：`Skill is valid!`

打包检查：`npm pack --dry-run` 成功，运行时代码、技能、Claude 清单、portable 清单和吉祥物图标均进入发布包。

## Codex 真实安装与调用

测试环境：`codex-cli 0.163.0-alpha.10.2`，Windows，Codex 模型 `gpt-5.6-sol`。

1. 通过本地隔离市场安装 `agent-effective-config@aec-local-test`。
2. `codex plugin list` 显示 `installed, enabled`，版本 `0.2.0`。
3. 启动全新、临时 Codex 会话，显式要求使用 `$aec-diagnose`。
4. Codex 从 `~/.codex/plugins/cache/aec-local-test/agent-effective-config/0.2.0/` 读取技能并执行内置 `run-aec.mjs`。
5. 会话正常退出，退出码为 `0`，结构化结果包含 `skillInvoked: true`。

真实诊断结果：

- `agent: codex`
- `notLoaded: 4`
- `AGENTS.md` 被更高优先级的 `AGENTS.override.md` 覆盖。
- `.codex/config.toml` 声明的 MCP executable `aec-fixture-missing-mcp-executable` 不在 PATH，判定为 `CONFIRMED_NOT_LOADED`。
- 大量用户级 skills 因未请求 live probe 被保守标记为 `UNVERIFIED`，没有被误判为失败。

## 三端可用性结论

| 平台 | 结果 | 验证方式 |
|---|---|---|
| Codex | 通过 | 真机安装、启用、新会话技能调用、脚本执行和结构化结果全部成功。 |
| Claude Code | 插件包通过 | 官方目录结构、清单和共享技能通过自动测试；本机未安装 Claude Code，无法声称真实运行测试。 |
| Cursor | 插件包通过 | Cursor 原生支持的 Agent Plugins 根清单与 skill 通过自动测试；本机未安装 Cursor，无法声称真实运行测试。 |

## 已知边界

- 用户级技能非常多时，完整 JSON 会较长；后续可加入 `--scope project|all`，但默认仍应保留完整范围以免遗漏真正生效的全局配置。
- hooks、权限和模型 adherence 只有在存在独立、只读 receipt 时才能升级为确定结论，否则保持 `UNVERIFIED`。
- Claude Code 与 Cursor 的真实 CLI 测试需要相应软件可用；本次未伪造这两项结果。
