<p align="center">
  <img src="assets/tokenless-logo.png" alt="Tokenless faucet logo" />
</p>

<h1 align="center">Tokenless</h1>

<p align="center">
  <strong>一行命令，让 Claude Code 的 token 消耗减少 50%+。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="#安装">安装</a> ·
  <a href="#输出模式">输出模式</a> ·
  <a href="#真实-benchmark">Benchmark</a> ·
  <a href="#隐私和安全">隐私和安全</a> ·
  <a href="docs/benchmarking.md">完整测试方法</a>
</p>

---

Tokenless 是一个 Claude Code 插件，用来降低 coding 工作流里的 API 上下文膨胀。

它会在大型工具输出进入模型上下文之前拦截它，把原始输出保存在本地磁盘，只把压缩后的证据包发送给 Claude。Claude 需要细节时，可以再按行号或关键词展开原始证据。

Tokenless 不是 LLM 总结器，也不会把你的数据发送到额外服务。压缩规则是本地、确定性的。

当前证据包格式：`TOKENLESS-PACKET/0.1`。

## 为什么需要 Tokenless

Claude Code 会把工具输出、文件读取、任务计划历史和助手回复继续带进后续 API 请求。时间一长，上下文会快速变大。

Tokenless 主要压缩三类增长：

- 大型工具输出：测试日志、构建日志、搜索结果、目录树、diff、大文件读取、大型 edit/write 结果。
- Agent 轨迹开销：重复探索、Task/Plan 工具历史、大型原始文件载荷。
- 回复冗长：`chat` 和 `coding` 模式让 Claude 的回复更短。

## Before / After

| 普通 Claude Code | 使用 Tokenless |
| --- | --- |
| 大文件或日志会反复进入后续上下文。 | 原始内容留在本地，只发送紧凑证据包。 |
| 冗长最终回复会继续变成下一轮请求历史。 | `chat` / `coding` 模式控制回复长度。 |
| 反复探索和计划会推高请求体大小。 | 默认 launcher 会减少 Task/Plan 工具开销。 |

示例：

```text
TOKENLESS-READ-PACKET/0.1
file: /path/to/src/App.tsx
artifact_id: ctx_20260518_abc123
summary: imports, symbols, snippets, nearby files, exact expansion commands
```

## 真实 Benchmark

这些数据来自真实 Claude Code API body 记录。主指标是 raw API request body 的估算 token 数，不是本地 hook 侧的宣传估算。

| 场景 | 基线 | Tokenless | 降幅 |
| --- | ---: | ---: | ---: |
| 5 轮 CRM vibe coding，`off` 对比 `coding` | 4,697,867 request tokens | 2,476,391 | 47.3% |
| 6 轮自然对话，`off` 对比 `chat` | 7,223 response tokens | 1,442 | 80.0% |
| 10k 行 React/TSX 编辑 | 917,137 request tokens | 545,456 | 40.5% |
| 多文件 React dashboard | 628,261 request tokens | 512,521 | 18.4% |

完整测试方法见 [docs/benchmarking.md](docs/benchmarking.md) 和 [docs/style-benchmark.md](docs/style-benchmark.md)。

## 安装

从 GitHub 安装：

```bash
npm install -g github:MaxForAI/Tokenless
tokenless install-hooks --user
tokenless launch
```

Tokenless 目前通过 GitHub 分发，尚未发布到公开 npm registry。

从源码本地开发：

```bash
git clone https://github.com/MaxForAI/Tokenless.git
cd Tokenless
npm install
npm link
tokenless install-hooks --user
tokenless launch
```

检查状态：

```bash
tokenless status --user
```

## 输出模式

Tokenless 有三个公开模式：

| 模式 | 行为 |
| --- | --- |
| `chat` | 默认模式。简短、可读的自然语言回复。只改变输出风格。 |
| `coding` | 面向 coding 工作流的高密度结构化回复。只改变输出风格。 |
| `off` | 完全关闭 Tokenless。禁用风格注入和压缩 hooks。 |

设置模式：

```bash
tokenless style chat
tokenless style coding
tokenless style off
```

Claude Code 快捷命令：

```text
/tokenless
/tokenless-style-chat
/tokenless-style-coding
/tokenless-style-off
```

配置默认保存到 `~/.tokenless/style.json`，重启 Claude Code 后仍然生效。

## 如何展开原始证据

查看最新 artifact：

```bash
tokenless latest --data-dir ~/.tokenless
```

按关键词展开：

```bash
tokenless expand latest --around "DashboardShell" --data-dir ~/.tokenless
```

按行号展开：

```bash
tokenless expand latest --lines 120:170 --data-dir ~/.tokenless
```

## 常用命令

```bash
tokenless --help
tokenless status --user
tokenless stats --data-dir ~/.tokenless
tokenless latest --data-dir ~/.tokenless
tokenless expand latest --around "Cannot find module" --data-dir ~/.tokenless
tokenless clean --data-dir ~/.tokenless --keep 100 --dry-run
tokenless api-usage --since 24h
```

## 隐私和安全

- Tokenless 在本地运行。
- 原始 artifacts 保存在本地磁盘。
- Tokenless 不调用额外 LLM，也不调用云总结服务。
- 压缩 reducer 是确定性的。
- 风险输出和失败输出默认不压缩。
- 法律、金融、医疗、安全和严格代码审查场景，应该主动展开原始证据。

## 限制

- 当前主要集成目标是 Claude Code hooks。
- API-body token 数是估算，不是精确账单 token。
- 小输出如果被强行压缩，可能反而变长。
- Read packet 是证据索引，不是替代精确行号阅读。

## 贡献者

- Max Liu
- Codex, AI coding assistant
